import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { encryptValue } from "../server/crypto.ts";
import { pool } from "../server/db.ts";
import { AppError } from "../server/errors.ts";
import { getDaily, getPractice, getSoloStats, nextPractice, submitSoloGuess } from "../server/solo-service.ts";
import { seoulDate } from "../server/time.ts";

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

function seoulDayOffset(offset: number): string {
  const base = new Date(`${seoulDate()}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}

/** 지난 날짜의 오늘의 단어를 이미 푼 것처럼 만들어 둡니다. */
async function seedSolvedDay(deviceId: string, playDate: string, attempts: number): Promise<void> {
  const encrypted = encryptValue("사진");
  const play = await pool.query<{ id: string }>(
    `INSERT INTO solo_plays (
       anonymous_session_id, mode, play_date, word_index,
       answer_ciphertext, answer_iv, answer_tag, jamo_length, status, finished_at, duration_ms
     ) VALUES ($1, 'daily', $2, 0, $3, $4, $5, 5, 'solved', NOW(), 1000)
     RETURNING id`,
    [deviceId, playDate, encrypted.ciphertext, encrypted.iv, encrypted.tag],
  );
  for (let sequence = 1; sequence <= attempts; sequence += 1) {
    await pool.query(
      `INSERT INTO solo_attempts (solo_play_id, sequence, guess, feedback)
       VALUES ($1, $2, '사진', '["correct","correct","correct","correct","correct"]'::jsonb)`,
      [play.rows[0].id, sequence],
    );
  }
}

test("오늘의 단어는 기기마다 하루 한 판이고 연속 기록이 이어진다", { skip: !enabled }, async () => {
  const deviceId = await createDevice();
  try {
    const first = await getDaily(deviceId);
    const second = await getDaily(deviceId);
    assert.equal(first.play.id, second.play.id, "같은 날 다시 열면 같은 판이어야 합니다.");
    assert.equal(first.play.playDate, seoulDate());
    assert.equal(first.play.status, "active");
    assert.equal(first.play.answer, undefined, "풀기 전에는 정답이 내려가면 안 됩니다.");

    const otherDevice = await createDevice();
    const otherDaily = await getDaily(otherDevice);
    assert.equal(otherDaily.play.jamoLength, first.play.jamoLength, "같은 날에는 모두 같은 단어여야 합니다.");
    await pool.query("DELETE FROM anonymous_sessions WHERE id = $1", [otherDevice]);

    await seedSolvedDay(deviceId, seoulDayOffset(-1), 3);
    await seedSolvedDay(deviceId, seoulDayOffset(-2), 2);
    const beforeToday = await getSoloStats(deviceId);
    assert.equal(beforeToday.currentStreak, 2, "어제까지 이어온 기록은 오늘 풀기 전에도 살아 있어야 합니다.");
    assert.equal(beforeToday.playedCount, 2);
    assert.deepEqual(beforeToday.distribution, [0, 1, 1, 0, 0]);

    // 지난 판이 하나 끊기면 연속 기록도 거기서 끊깁니다.
    await seedSolvedDay(deviceId, seoulDayOffset(-5), 1);
    const withGap = await getSoloStats(deviceId);
    assert.equal(withGap.currentStreak, 2);
    assert.equal(withGap.bestStreak, 2);
    assert.equal(withGap.solvedCount, 3);
  } finally {
    await pool.query("DELETE FROM anonymous_sessions WHERE id = $1", [deviceId]);
  }
});

test("암호화 키가 달라 읽을 수 없는 오늘 기록은 새 문제로 복구한다", { skip: !enabled }, async () => {
  const deviceId = await createDevice();
  try {
    const broken = await pool.query<{ id: string }>(
      `INSERT INTO solo_plays (
         anonymous_session_id, mode, play_date, word_index,
         answer_ciphertext, answer_iv, answer_tag, jamo_length
       ) VALUES ($1, 'daily', $2, 0, 'AA', 'AAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAA', 5)
       RETURNING id`,
      [deviceId, seoulDate()],
    );

    const daily = await getDaily(deviceId);
    assert.notEqual(daily.play.id, broken.rows[0].id);
    assert.equal(daily.play.status, "active");
    assert.equal(daily.play.answer, undefined);

    const remaining = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM solo_plays WHERE anonymous_session_id = $1 AND mode = 'daily' AND play_date = $2",
      [deviceId, seoulDate()],
    );
    assert.equal(remaining.rows[0].count, "1");
  } finally {
    await pool.query("DELETE FROM anonymous_sessions WHERE id = $1", [deviceId]);
  }
});

test("solo_plays에는 더 이상 사용하지 않는 hint 열이 남아 있지 않다", { skip: !enabled }, async () => {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'solo_plays' AND column_name = 'hint'
     ) AS exists`,
  );
  assert.equal(result.rows[0].exists, false);
});

test("풀이는 본인 기기만, 다섯 번까지만 제출할 수 있다", { skip: !enabled }, async () => {
  const deviceId = await createDevice();
  const intruderId = await createDevice();
  try {
    const { play } = await getPractice(deviceId);
    assert.equal(play.attemptsRemaining, 5);
    assert.equal((await getPractice(deviceId)).play.id, play.id, "진행 중인 연습 문제가 있으면 그대로 이어져야 합니다.");

    await assert.rejects(
      () => submitSoloGuess(play.id, intruderId, "사진"),
      expectAppError("NOT_YOUR_PLAY"),
    );
    await assert.rejects(
      () => submitSoloGuess(play.id, deviceId, "photo"),
      expectAppError("INVALID_GUESS"),
    );

    const jamoMismatch = play.jamoLength === 5 ? "고양이" : "사진";
    await assert.rejects(
      () => submitSoloGuess(play.id, deviceId, jamoMismatch),
      expectAppError("WRONG_JAMO_LENGTH"),
    );

    const skipped = await nextPractice(deviceId);
    assert.ok(skipped.skippedAnswer, "건너뛴 문제의 정답을 알려 줘야 합니다.");
    assert.notEqual(skipped.play.id, play.id);

    await assert.rejects(
      () => submitSoloGuess(play.id, deviceId, "사진"),
      expectAppError("PLAY_FINISHED"),
    );

    const stats = await getSoloStats(deviceId);
    assert.equal(stats.playedCount, 0, "연습 모드는 오늘의 단어 기록에 들어가지 않습니다.");
  } finally {
    await pool.query("DELETE FROM anonymous_sessions WHERE id = ANY($1::uuid[])", [[deviceId, intruderId]]);
  }
});
