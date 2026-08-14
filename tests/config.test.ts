import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function loadProductionConfig(appSecret: string, databasePassword: string, publicUrl = "https://game.example.com") {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", "import './server/config.ts'"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        PUBLIC_URL: publicUrl,
        APP_SECRET: appSecret,
        DATABASE_URL: `postgresql://harumal:${databasePassword}@db:5432/harumal`,
      },
    },
  );
}

test("public production rejects placeholder secrets and weak database passwords", () => {
  const weakSecret = loadProductionConfig("replace-with-at-least-32-random-characters", "short-password");
  assert.notEqual(weakSecret.status, 0);

  const weakDatabasePassword = loadProductionConfig("a".repeat(64), "short-password");
  assert.notEqual(weakDatabasePassword.status, 0);
});

test("public production accepts strong secrets and enforces HTTPS", () => {
  const strongConfig = loadProductionConfig("a".repeat(64), "b".repeat(24));
  assert.equal(strongConfig.status, 0, strongConfig.stderr);

  const insecureUrl = loadProductionConfig("a".repeat(64), "b".repeat(24), "http://game.example.com");
  assert.notEqual(insecureUrl.status, 0);
});
