import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { pool } from "../server/db.ts";
import { AppError } from "../server/errors.ts";
import {
  getPublicRoom,
  getRoomSnapshot,
  joinRoom,
  endExpiredSessions,
  publishChallenge,
  startPlay,
  submitGuess,
} from "../server/room-service.ts";

const enabled = process.env.RUN_INTEGRATION === "1";

function expectAppError(code: string) {
  return (error: unknown): boolean => error instanceof AppError && error.code === code;
}

test("daily room flow keeps answers private and enforces multiplayer rules", { skip: !enabled }, async () => {
  const code = `T${randomBytes(3).toString("hex").toUpperCase().slice(0, 5)}`;
  const anonymousIds: string[] = [];
  let sessionId = "";

  try {
    for (let index = 0; index < 7; index += 1) {
      const tokenHash = randomBytes(32).toString("hex");
      const result = await pool.query<{ id: string }>(
        "INSERT INTO anonymous_sessions (token_hash) VALUES ($1) RETURNING id",
        [tokenHash],
      );
      anonymousIds.push(result.rows[0].id);
    }

    const session = await pool.query<{ id: string }>(
      `INSERT INTO daily_sessions (code, play_date, join_cutoff_at, end_at)
       VALUES ($1, CURRENT_DATE, NOW() + INTERVAL '23 hours', NOW() + INTERVAL '24 hours')
       RETURNING id`,
      [code],
    );
    sessionId = session.rows[0].id;
    await pool.query(
      "INSERT INTO members (daily_session_id, anonymous_session_id, nickname) VALUES ($1, $2, $3)",
      [sessionId, anonymousIds[0], "출제자"],
    );

    for (let index = 1; index < 6; index += 1) {
      await joinRoom(code, anonymousIds[index], `친구${index}`, "1234");
    }
    await assert.rejects(joinRoom(code, anonymousIds[6], "일곱째", "1234"), expectAppError("ROOM_FULL"));
    assert.equal((await getPublicRoom(code, anonymousIds[0])).memberCount, 6);

    const firstChallenge = await publishChallenge(code, anonymousIds[0], "사진");
    await publishChallenge(code, anonymousIds[1], "우산");
    const thirdChallenge = await publishChallenge(code, anonymousIds[2], "바다");

    await assert.rejects(startPlay(firstChallenge.challengeId, anonymousIds[0]), expectAppError("OWN_CHALLENGE"));
    const play = await startPlay(firstChallenge.challengeId, anonymousIds[1]);

    const activeSnapshot = await getRoomSnapshot(code, anonymousIds[1]);
    const activeChallenge = activeSnapshot.challenges.find((item) => item.id === firstChallenge.challengeId)!;
    assert.equal(activeChallenge.play?.status, "active");
    assert.equal(activeChallenge.play?.answer, undefined);
    assert.equal(activeChallenge.ownAnswer, undefined);

    const wrong = await submitGuess(play.playId, anonymousIds[1], "시장");
    assert.equal(wrong.status, "active");
    assert.equal(wrong.answer, undefined);
    assert.equal(wrong.attemptsRemaining, 4);

    const solved = await submitGuess(play.playId, anonymousIds[1], "사진");
    assert.equal(solved.status, "solved");
    assert.equal(solved.answer, "사진");

    const failedPlay = await startPlay(thirdChallenge.challengeId, anonymousIds[1]);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await submitGuess(failedPlay.playId, anonymousIds[1], "나라");
      assert.equal(result.status, attempt === 5 ? "failed" : "active");
      assert.equal(result.answer, attempt === 5 ? "바다" : undefined);
    }
    await assert.rejects(submitGuess(failedPlay.playId, anonymousIds[1], "바다"), expectAppError("PLAY_FINISHED"));

    const finishedSnapshot = await getRoomSnapshot(code, anonymousIds[1]);
    const finishedChallenge = finishedSnapshot.challenges.find((item) => item.id === firstChallenge.challengeId)!;
    assert.equal(finishedChallenge.play?.answer, "사진");
    assert.equal(finishedChallenge.play?.attempts.length, 2);
    assert.equal(finishedSnapshot.leaderboard[0].nickname, "친구1");
    assert.equal(finishedSnapshot.leaderboard[0].solvedCount, 1);

    const authorSnapshot = await getRoomSnapshot(code, anonymousIds[0]);
    const authorChallenge = authorSnapshot.challenges.find((item) => item.id === firstChallenge.challengeId)!;
    assert.equal(authorChallenge.ownAnswer, "사진");
    assert.equal(authorChallenge.startedCount, 1);
    assert.equal(authorChallenge.solvedCount, 1);

    const expiredSession = await pool.query<{ id: string }>(
      `INSERT INTO daily_sessions (code, play_date, join_cutoff_at, end_at)
       VALUES ($1, CURRENT_DATE - 1, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
       RETURNING id`,
      [`E${randomBytes(3).toString("hex").toUpperCase().slice(0, 5)}`],
    );
    await pool.query(
      "INSERT INTO members (daily_session_id, anonymous_session_id, nickname) VALUES ($1, $2, $3)",
      [expiredSession.rows[0].id, anonymousIds[6], "만료회원"],
    );
    await pool.query("UPDATE anonymous_sessions SET last_seen_at = NOW() - INTERVAL '31 days' WHERE id = $1", [anonymousIds[6]]);

    const purgedSessionIds = await endExpiredSessions();
    assert.ok(purgedSessionIds.includes(expiredSession.rows[0].id));
    assert.equal((await pool.query("SELECT 1 FROM daily_sessions WHERE id = $1", [expiredSession.rows[0].id])).rowCount, 0);
    assert.equal((await pool.query("SELECT 1 FROM anonymous_sessions WHERE id = $1", [anonymousIds[6]])).rowCount, 0);
  } finally {
    if (sessionId) await pool.query("DELETE FROM daily_sessions WHERE id = $1", [sessionId]);
    if (anonymousIds.length) await pool.query("DELETE FROM anonymous_sessions WHERE id = ANY($1::uuid[])", [anonymousIds]);
    await pool.end();
  }
});
