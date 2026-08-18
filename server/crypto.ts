import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config.ts";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const PIN_KEY_LENGTH = 32;

const encryptionKey = createHash("sha256").update(config.APP_SECRET).digest();

export type EncryptedValue = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export function encryptValue(value: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptValue(value: EncryptedValue): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(value.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * 재입장 비밀번호는 네 자리라 경우의 수가 1만 개뿐입니다.
 * 데이터베이스만 새어도 바로 뚫리지 않도록 느린 해시(scrypt)에 APP_SECRET을 섞어 둡니다.
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(`${pin}:${config.APP_SECRET}`, salt, PIN_KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const expectedBytes = Buffer.from(expected, "base64url");
  const derived = await scrypt(`${pin}:${config.APP_SECRET}`, Buffer.from(salt, "base64url"), expectedBytes.length);
  return expectedBytes.length === derived.length && timingSafeEqual(expectedBytes, derived);
}
