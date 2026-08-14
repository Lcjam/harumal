import type { Server, Socket } from "socket.io";
import { findAnonymousSessionIdFromCookie } from "./auth.ts";
import { AppError } from "./errors.ts";
import { getRoomSnapshot } from "./room-service.ts";

type SubscribePayload = { code?: string };
type SubscribeAck = (response: { ok: true } | { ok: false; message: string }) => void;
const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{6}$/;
const SUBSCRIPTION_WINDOW_MS = 60_000;
const SUBSCRIPTIONS_PER_WINDOW = 10;

export function configureSockets(io: Server): void {
  io.use(async (socket, next) => {
    try {
      const anonymousSessionId = await findAnonymousSessionIdFromCookie(socket.handshake.headers.cookie);
      if (!anonymousSessionId) {
        next(new Error("UNAUTHORIZED"));
        return;
      }
      socket.data.anonymousSessionId = anonymousSessionId;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket: Socket) => {
    let windowStartedAt = Date.now();
    let subscriptionCount = 0;

    socket.on("room:subscribe", async (payload: SubscribePayload, acknowledge?: SubscribeAck) => {
      try {
        const now = Date.now();
        if (now - windowStartedAt >= SUBSCRIPTION_WINDOW_MS) {
          windowStartedAt = now;
          subscriptionCount = 0;
        }
        subscriptionCount += 1;
        if (subscriptionCount > SUBSCRIPTIONS_PER_WINDOW) {
          throw new AppError(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
        }

        const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : "";
        if (!CODE_PATTERN.test(code)) throw new AppError(400, "INVALID_CODE", "초대코드를 확인해 주세요.");
        const anonymousSessionId = socket.data.anonymousSessionId as string;
        const room = await getRoomSnapshot(code, anonymousSessionId);
        const previousRooms = [...socket.rooms].filter((roomName) => roomName.startsWith("session:"));
        await Promise.all(previousRooms.map((roomName) => socket.leave(roomName)));
        await socket.join(`session:${room.id}`);
        acknowledge?.({ ok: true });
      } catch (error) {
        const message = error instanceof AppError ? error.message : "방 구독에 실패했습니다.";
        acknowledge?.({ ok: false, message });
      }
    });
  });
}

export function notifySession(io: Server, sessionId: string, event: string): void {
  io.to(`session:${sessionId}`).emit("room:updated", { event, at: new Date().toISOString() });
}
