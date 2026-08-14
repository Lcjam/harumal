import { Router, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { ensureAnonymousSession, findAnonymousSessionId } from "./auth.ts";
import { publicOrigin } from "./config.ts";
import { checkDatabase } from "./db.ts";
import { AppError } from "./errors.ts";
import {
  createRoom,
  getPublicRoom,
  getRoomSnapshot,
  joinRoom,
  publishChallenge,
  startPlay,
  submitGuess,
} from "./room-service.ts";

type RoomNotifier = (sessionId: string, event: string) => void;

const nicknameSchema = z.object({ nickname: z.string().min(1).max(20) });
const challengeSchema = z.object({ answer: z.string().min(1).max(24), hint: z.string().min(2).max(80) });
const guessSchema = z.object({ guess: z.string().min(1).max(24) });
const codeSchema = z.string().regex(/^[2-9A-HJ-NP-Z]{6}$/);
const rateLimitMessage = { error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." } };

const createRoomRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitMessage,
});

const joinRoomRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitMessage,
});

function routeParam(value: string | string[] | undefined): string {
  const resolved = Array.isArray(value) ? value[0] : value;
  if (!resolved) throw new AppError(400, "MISSING_PARAMETER", "요청 경로가 올바르지 않습니다.");
  return resolved;
}

function asyncRoute(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response).catch(next);
  };
}

export function createApiRouter(notifyRoom: RoomNotifier): Router {
  const router = Router();

  router.use((request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");

    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      next();
      return;
    }

    const origin = request.get("origin");
    const fetchSite = request.get("sec-fetch-site");
    if ((origin && origin !== publicOrigin) || fetchSite === "cross-site") {
      next(new AppError(403, "CROSS_SITE_REQUEST_BLOCKED", "허용되지 않은 출처의 요청입니다."));
      return;
    }
    next();
  });

  router.use(rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: rateLimitMessage,
  }));

  router.get("/health", asyncRoute(async (_request, response) => {
    await checkDatabase();
    response.json({ status: "ok", time: new Date().toISOString() });
  }));

  router.post("/rooms", createRoomRateLimit, asyncRoute(async (request, response) => {
    const body = nicknameSchema.parse(request.body);
    const anonymousSessionId = await ensureAnonymousSession(request, response);
    const code = await createRoom(anonymousSessionId, body.nickname);
    response.status(201).json({ code });
  }));

  router.get("/rooms/:code/public", asyncRoute(async (request, response) => {
    const code = codeSchema.parse(routeParam(request.params.code).toUpperCase());
    const anonymousSessionId = await findAnonymousSessionId(request);
    response.json(await getPublicRoom(code, anonymousSessionId));
  }));

  router.post("/rooms/:code/join", joinRoomRateLimit, asyncRoute(async (request, response) => {
    const code = codeSchema.parse(routeParam(request.params.code).toUpperCase());
    const body = nicknameSchema.parse(request.body);
    const anonymousSessionId = await ensureAnonymousSession(request, response);
    const joined = await joinRoom(code, anonymousSessionId, body.nickname);
    notifyRoom(joined.sessionId, "member:joined");
    response.status(201).json({ code });
  }));

  router.get("/rooms/:code", asyncRoute(async (request, response) => {
    const code = codeSchema.parse(routeParam(request.params.code).toUpperCase());
    const anonymousSessionId = await findAnonymousSessionId(request);
    if (!anonymousSessionId) throw new AppError(403, "NOT_A_MEMBER", "먼저 이 방에 참가해 주세요.");
    response.json(await getRoomSnapshot(code, anonymousSessionId));
  }));

  router.put("/rooms/:code/challenge", asyncRoute(async (request, response) => {
    const code = codeSchema.parse(routeParam(request.params.code).toUpperCase());
    const body = challengeSchema.parse(request.body);
    const anonymousSessionId = await findAnonymousSessionId(request);
    if (!anonymousSessionId) throw new AppError(403, "NOT_A_MEMBER", "먼저 이 방에 참가해 주세요.");
    const published = await publishChallenge(code, anonymousSessionId, body.answer, body.hint);
    notifyRoom(published.sessionId, "challenge:published");
    response.status(201).json({ challengeId: published.challengeId });
  }));

  router.post("/challenges/:challengeId/start", asyncRoute(async (request, response) => {
    const anonymousSessionId = await findAnonymousSessionId(request);
    if (!anonymousSessionId) throw new AppError(403, "NOT_A_MEMBER", "먼저 이 방에 참가해 주세요.");
    const play = await startPlay(routeParam(request.params.challengeId), anonymousSessionId);
    notifyRoom(play.sessionId, "play:started");
    response.status(201).json({ playId: play.playId });
  }));

  router.post("/plays/:playId/guesses", asyncRoute(async (request, response) => {
    const body = guessSchema.parse(request.body);
    const anonymousSessionId = await findAnonymousSessionId(request);
    if (!anonymousSessionId) throw new AppError(403, "NOT_A_MEMBER", "먼저 이 방에 참가해 주세요.");
    const result = await submitGuess(routeParam(request.params.playId), anonymousSessionId, body.guess);
    notifyRoom(result.sessionId, result.status === "active" ? "play:progress" : "play:finished");
    response.status(201).json(result);
  }));

  return router;
}

export function apiErrorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  if (error instanceof AppError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: { code: "INVALID_REQUEST", message: "입력값을 확인해 주세요.", issues: error.issues } });
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(JSON.stringify({ level: "error", event: "api_error", message, stack: error instanceof Error ? error.stack : undefined }));
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." } });
}
