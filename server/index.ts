import http from "node:http";
import { randomBytes } from "node:crypto";
import compression from "compression";
import express from "express";
import helmet from "helmet";
import next from "next";
import { Server } from "socket.io";
import { createApiRouter, apiErrorHandler } from "./api.ts";
import { config, isProduction, publicOrigin } from "./config.ts";
import { pool } from "./db.ts";
import { endExpiredSessions } from "./room-service.ts";
import { configureSockets, notifySession } from "./socket.ts";

const nextApp = next({ dev: !isProduction, hostname: "0.0.0.0", port: config.PORT });
const nextHandler = nextApp.getRequestHandler();
const INVITE_CODE_IN_PATH = /(?<=\/)([2-9A-HJ-NP-Z]{6})(?=\/|$)/g;
const UUID_IN_PATH = /(?<=\/)[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi;

function redactedRequestPath(originalUrl: string): string {
  return originalUrl
    .split("?")[0]
    .replace(INVITE_CODE_IN_PATH, ":code")
    .replace(UUID_IN_PATH, ":id");
}

await nextApp.prepare();

const app = express();
const realtimeOrigin = publicOrigin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
if (isProduction) app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((request, response, nextMiddleware) => {
  const nonce = randomBytes(16).toString("base64");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${!isProduction ? " 'unsafe-eval'" : ""} https://t1.kakaocdn.net`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'none'",
    "img-src 'self' data: https://*.kakao.com https://*.kakaocdn.net",
    "font-src 'self'",
    `connect-src 'self' ${realtimeOrigin} https://*.kakao.com`,
    "frame-src 'self' https://*.kakao.com kakaotalk:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  request.headers["content-security-policy"] = policy;
  request.headers["x-nonce"] = nonce;
  response.setHeader("Content-Security-Policy", policy);
  nextMiddleware();
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: { action: "deny" },
}));
app.use(compression());
app.use(express.json({ limit: "64kb" }));

app.use((request, response, nextMiddleware) => {
  const startedAt = Date.now();
  const requestPath = redactedRequestPath(request.originalUrl);
  response.on("finish", () => {
    if (requestPath === "/api/health") return;
    console.log(JSON.stringify({
      level: "info",
      event: "http_request",
      method: request.method,
      path: requestPath,
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });
  nextMiddleware();
});

const server = http.createServer(app);
server.requestTimeout = 60_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;
const io = new Server(server, {
  path: "/socket.io",
  cors: { origin: publicOrigin, credentials: true },
  allowRequest: (request, callback) => {
    const origin = request.headers.origin;
    callback(null, origin === undefined || origin === publicOrigin);
  },
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 16 * 1024,
  perMessageDeflate: false,
});

configureSockets(io);
app.use("/api", createApiRouter((sessionId, event) => notifySession(io, sessionId, event)));
app.use(apiErrorHandler);
app.use((request, response) => nextHandler(request, response));

await endExpiredSessions();

const expirationTimer = setInterval(async () => {
  try {
    const expiredSessionIds = await endExpiredSessions();
    expiredSessionIds.forEach((sessionId) => notifySession(io, sessionId, "session:ended"));
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "session_expiration_failed", message: error instanceof Error ? error.message : String(error) }));
  }
}, 30_000);
expirationTimer.unref();

server.listen(config.PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", event: "server_started", port: config.PORT, environment: config.NODE_ENV }));
});

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ level: "info", event: "shutdown", signal }));
  clearInterval(expirationTimer);
  io.close();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
