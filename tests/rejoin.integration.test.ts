import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { pool } from "../server/db.ts";
import { AppError } from "../server/errors.ts";
import { createRoom, getRoomSnapshot, joinRoom } from "../server/room-service.ts";

const enabled = process.env.RUN_INTEGRATION === "1";

function expectAppError(code: string) {
  return (error: unknown): boolean => error instanceof AppError && error.code === code;
}

async function createDevice(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO anonymous_sessions (token_hash) VALUES ($1) RETURNING id",
    [randomBytes(32).toString("hex")],
  );
  return result.rows[0].id;
}

test("브라우저가 바뀌어도 닉네임과 비밀번호로 자기 자리를 이어받는다", { skip: !enabled }, async () => {
  const phone = await createDevice();
  const otherBrowser = await createDevice();
  const stranger = await createDevice();
  let code = "";

  try {
    code = await createRoom(phone, "민지", "2468");

    // 같은 기기에서 다시 들어오면 예전처럼 그대로 이어집니다.
    const sameDevice = await joinRoom(code, phone, "민지", "2468");
    assert.equal(sameDevice.resumed, false);

    const beforeSwitch = await getRoomSnapshot(code, phone);
    assert.equal(beforeSwitch.memberCount, 1);
    const originalMemberId = beforeSwitch.currentMember.id;

    // 비밀번호가 틀리면 자리를 가져갈 수 없습니다.
    await assert.rejects(
      () => joinRoom(code, otherBrowser, "민지", "1111"),
      expectAppError("WRONG_PIN"),
    );

    const resumed = await joinRoom(code, otherBrowser, "민지", "2468");
    assert.equal(resumed.resumed, true, "이어받기로 처리돼야 합니다.");
    assert.equal(resumed.memberId, originalMemberId, "새 멤버가 아니라 같은 자리여야 합니다.");

    const afterSwitch = await getRoomSnapshot(code, otherBrowser);
    assert.equal(afterSwitch.memberCount, 1, "사람 수가 늘어나면 안 됩니다.");
    assert.equal(afterSwitch.currentMember.nickname, "민지");

    // 자리를 넘겨준 예전 창은 더 이상 멤버가 아닙니다.
    await assert.rejects(() => getRoomSnapshot(code, phone), expectAppError("NOT_A_MEMBER"));

    // 다른 닉네임으로 들어오면 그냥 새 참가자입니다.
    await joinRoom(code, stranger, "지훈", "1357");
    assert.equal((await getRoomSnapshot(code, stranger)).memberCount, 2);
  } finally {
    if (code) await pool.query("DELETE FROM daily_sessions WHERE code = $1", [code]);
    await pool.query("DELETE FROM anonymous_sessions WHERE id = ANY($1::uuid[])", [[phone, otherBrowser, stranger]]);
  }
});

test("비밀번호를 다섯 번 틀리면 그 자리는 잠시 잠긴다", { skip: !enabled }, async () => {
  const owner = await createDevice();
  const attacker = await createDevice();
  let code = "";

  try {
    code = await createRoom(owner, "민지", "2468");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(
        () => joinRoom(code, attacker, "민지", "1111"),
        expectAppError("WRONG_PIN"),
      );
    }

    // 잠긴 뒤에는 맞는 비밀번호라도 잠금이 풀릴 때까지 막힙니다.
    await assert.rejects(
      () => joinRoom(code, attacker, "민지", "2468"),
      expectAppError("PIN_LOCKED"),
    );

    // 자리 주인은 여전히 자기 기기로 그대로 씁니다.
    assert.equal((await getRoomSnapshot(code, owner)).memberCount, 1);
  } finally {
    if (code) await pool.query("DELETE FROM daily_sessions WHERE code = $1", [code]);
    await pool.query("DELETE FROM anonymous_sessions WHERE id = ANY($1::uuid[])", [[owner, attacker]]);
  }
});
