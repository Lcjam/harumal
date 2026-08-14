import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "./config.ts";

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
