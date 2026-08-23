import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { databaseUrlForRuntime } from "../scripts/runtime-database.ts";

test("npm start는 서버보다 먼저 마이그레이션을 실행하는 시작 스크립트를 사용한다", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
    scripts: { start: string };
  };
  assert.match(packageJson.scripts.start, /scripts\/start\.ts$/);
});

test("일반 실행에서는 설정된 DATABASE_URL을 그대로 사용한다", () => {
  const configured = "postgresql://app:password@127.0.0.1:5432/harumal";
  assert.equal(databaseUrlForRuntime({ DATABASE_URL: configured }), configured);
});

test("Docker 실행에서는 APP_SECRET으로 최소 권한 DB 접속 주소를 만든다", () => {
  const appSecret = "a".repeat(64);
  const resolved = new URL(databaseUrlForRuntime({
    APP_SECRET: appSecret,
    APP_DB_USER: "harumal_app",
    POSTGRES_DB: "harumal",
    DB_HOST: "db",
    DB_PORT: "5432",
  }));
  const expectedPassword = createHash("sha256")
    .update(`${appSecret}:harumal-app-db-v1`, "utf8")
    .digest("hex");

  assert.equal(resolved.username, "harumal_app");
  assert.equal(resolved.password, expectedPassword);
  assert.equal(resolved.hostname, "db");
  assert.equal(resolved.port, "5432");
  assert.equal(resolved.pathname, "/harumal");
});
