import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type pg from "pg";
import { pool } from "./db.ts";
import { hashValue } from "./crypto.ts";
import { isProduction } from "./config.ts";

export const DEVICE_COOKIE = isProduction ? "__Host-harumal_device" : "harumal_device";
export const ANONYMOUS_SESSION_MAX_AGE_DAYS = 30;

export function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(";").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    const encodedValue = rest.join("=");
    try {
      return [key, decodeURIComponent(encodedValue)];
    } catch {
      return [key, ""];
    }
  }));
}

function setDeviceCookie(response: Response, token: string): void {
  const parts = [
    `${DEVICE_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Priority=High",
    `Max-Age=${60 * 60 * 24 * ANONYMOUS_SESSION_MAX_AGE_DAYS}`,
  ];
  if (isProduction) parts.push("Secure");
  response.appendHeader("Set-Cookie", parts.join("; "));
}

export async function ensureAnonymousSession(request: Request, response: Response, client?: pg.PoolClient): Promise<string> {
  const database = client ?? pool;
  const cookies = parseCookies(request.headers.cookie);
  const existingToken = cookies[DEVICE_COOKIE];

  if (existingToken) {
    const result = await database.query<{ id: string }>(
      "UPDATE anonymous_sessions SET last_seen_at = NOW() WHERE token_hash = $1 RETURNING id",
      [hashValue(existingToken)],
    );
    if (result.rows[0]) return result.rows[0].id;
  }

  const token = randomBytes(32).toString("base64url");
  const result = await database.query<{ id: string }>(
    "INSERT INTO anonymous_sessions (token_hash) VALUES ($1) RETURNING id",
    [hashValue(token)],
  );
  setDeviceCookie(response, token);
  return result.rows[0].id;
}

export async function findAnonymousSessionId(request: Request): Promise<string | null> {
  return findAnonymousSessionIdFromCookie(request.headers.cookie);
}

export async function findAnonymousSessionIdFromCookie(cookieHeader?: string): Promise<string | null> {
  const token = parseCookies(cookieHeader)[DEVICE_COOKIE];
  if (!token) return null;
  const result = await pool.query<{ id: string }>("SELECT id FROM anonymous_sessions WHERE token_hash = $1", [hashValue(token)]);
  return result.rows[0]?.id ?? null;
}
