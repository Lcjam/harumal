import assert from "node:assert/strict";
import test from "node:test";
import { io } from "socket.io-client";
import { pool } from "../server/db.ts";

const enabled = process.env.RUN_E2E === "1";
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

type ApiResponse<T> = { status: number; data: T; cookie: string; headers: Headers };

async function api<T>(path: string, options: { method?: string; body?: unknown; cookie?: string } = {}): Promise<ApiResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json() as T;
  return {
    status: response.status,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? options.cookie ?? "",
    headers: response.headers,
  };
}

test("HTTP cookies and Socket.IO complete a two-player game", { skip: !enabled, timeout: 15_000 }, async () => {
  let code = "";
  let socket: ReturnType<typeof io> | undefined;
  try {
    const home = await fetch(baseUrl);
    const homeHtml = await home.text();
    const contentSecurityPolicy = home.headers.get("content-security-policy") ?? "";
    const nonce = contentSecurityPolicy.match(/'nonce-([^']+)'/)?.[1];
    assert.equal(home.status, 200);
    assert.ok(nonce);
    assert.equal(contentSecurityPolicy.includes("'unsafe-inline'"), false);
    assert.ok(homeHtml.includes(`nonce="${nonce}"`));
    assert.ok(homeHtml.includes("integrity=\"sha384-"));

    const health = await api<{ status: string }>("/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.status, "ok");
    assert.equal(health.headers.get("cache-control"), "no-store");

    const blockedCrossSiteResponse = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
        "Sec-Fetch-Site": "cross-site",
      },
      body: JSON.stringify({ nickname: "차단대상" }),
    });
    assert.equal(blockedCrossSiteResponse.status, 403);

    const created = await api<{ code: string }>("/api/rooms", { method: "POST", body: { nickname: "HTTP출제자" } });
    assert.equal(created.status, 201);
    assert.ok(created.cookie.includes("harumal_device="));
    const setCookie = created.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Max-Age=2592000/i);
    code = created.data.code;

    const joined = await api<{ code: string }>(`/api/rooms/${code}/join`, { method: "POST", body: { nickname: "소켓친구" } });
    assert.equal(joined.status, 201);
    assert.ok(joined.cookie.includes("harumal_device="));

    const blockedSocket = io(baseUrl, {
      path: "/socket.io",
      transports: ["websocket"],
      extraHeaders: { Cookie: joined.cookie, Origin: "https://evil.example" },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("교차 출처 소켓이 차단되지 않았습니다.")), 5_000);
      blockedSocket.on("connect", () => {
        clearTimeout(timer);
        reject(new Error("교차 출처 소켓이 연결되었습니다."));
      });
      blockedSocket.on("connect_error", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    blockedSocket.disconnect();

    socket = io(baseUrl, {
      path: "/socket.io",
      transports: ["websocket"],
      extraHeaders: { Cookie: joined.cookie },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket.IO 연결 시간이 초과되었습니다.")), 5_000);
      socket!.on("connect", () => {
        socket!.emit("room:subscribe", { code }, (result: { ok: boolean; message?: string }) => {
          clearTimeout(timer);
          result.ok ? resolve() : reject(new Error(result.message));
        });
      });
      socket!.on("connect_error", reject);
    });

    const update = new Promise<{ event: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("실시간 방 갱신 이벤트가 오지 않았습니다.")), 5_000);
      socket!.once("room:updated", (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
    const published = await api<{ challengeId: string }>(`/api/rooms/${code}/challenge`, {
      method: "PUT",
      cookie: created.cookie,
      body: { answer: "사진", hint: "추억을 남기는 것" },
    });
    assert.equal(published.status, 201);
    assert.equal((await update).event, "challenge:published");

    const before = await api<{ challenges: Array<{ id: string; ownAnswer?: string; play: unknown }> }>(`/api/rooms/${code}`, { cookie: joined.cookie });
    assert.equal(before.headers.get("cache-control"), "no-store");
    const challenge = before.data.challenges.find((item) => item.id === published.data.challengeId)!;
    assert.equal(challenge.ownAnswer, undefined);
    assert.equal(challenge.play, null);

    const started = await api<{ playId: string }>(`/api/challenges/${challenge.id}/start`, { method: "POST", cookie: joined.cookie });
    assert.equal(started.status, 201);
    const wrong = await api<{ status: string; answer?: string }>(`/api/plays/${started.data.playId}/guesses`, {
      method: "POST", cookie: joined.cookie, body: { guess: "시장" },
    });
    assert.equal(wrong.data.status, "active");
    assert.equal(wrong.data.answer, undefined);
    const solved = await api<{ status: string; answer?: string }>(`/api/plays/${started.data.playId}/guesses`, {
      method: "POST", cookie: joined.cookie, body: { guess: "사진" },
    });
    assert.equal(solved.data.status, "solved");
    assert.equal(solved.data.answer, "사진");
  } finally {
    socket?.disconnect();
    if (code) await pool.query("DELETE FROM daily_sessions WHERE code = $1", [code]);
    await pool.end();
  }
});
