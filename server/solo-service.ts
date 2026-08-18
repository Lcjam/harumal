import type { QueryResult, QueryResultRow } from "pg";
import type { AttemptDto, DailyDto, PracticeDto, SoloGuessResultDto, SoloPlayDto, SoloStatsDto } from "../lib/contracts.ts";
import type { FeedbackState } from "../lib/game.ts";
import { decomposeHangul, evaluateGuess, isCorrectFeedback } from "../lib/game.ts";
import { decryptValue, encryptValue } from "./crypto.ts";
import { resolveGuess } from "./guess.ts";
import { dailyWord, dayNumber, randomWord, type PickedWord } from "./daily-word.ts";
import { pool, withTransaction } from "./db.ts";
import { AppError } from "./errors.ts";
import { dailyBoundaries, seoulDate } from "./time.ts";

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
};

type SoloPlayRow = {
  id: string;
  mode: "daily" | "practice";
  play_date: string | null;
  jamo_length: number;
  status: "active" | "solved" | "failed";
  started_at: Date;
  duration_ms: number | null;
  answer_ciphertext: string;
  answer_iv: string;
  answer_tag: string;
};

type AttemptRow = { sequence: number; guess: string; feedback: FeedbackState[]; created_at: Date };

const MAX_ATTEMPTS = 5;
const PLAY_COLUMNS = `id, mode, play_date::text, jamo_length, status, started_at, duration_ms,
                      answer_ciphertext, answer_iv, answer_tag`;

async function insertPlay(
  database: Queryable,
  anonymousSessionId: string,
  mode: "daily" | "practice",
  playDate: string | null,
  picked: PickedWord,
): Promise<SoloPlayRow | null> {
  const encrypted = encryptValue(picked.word);
  const jamoLength = decomposeHangul(picked.word).length;
  const result = await database.query<SoloPlayRow>(
    `INSERT INTO solo_plays (
       anonymous_session_id, mode, play_date, word_index,
       answer_ciphertext, answer_iv, answer_tag, jamo_length
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (anonymous_session_id, play_date) WHERE mode = 'daily' DO NOTHING
     RETURNING ${PLAY_COLUMNS}`,
    [anonymousSessionId, mode, playDate, picked.index, encrypted.ciphertext, encrypted.iv, encrypted.tag, jamoLength],
  );
  return result.rows[0] ?? null;
}

async function selectAttempts(database: Queryable, playId: string): Promise<AttemptDto[]> {
  const result = await database.query<AttemptRow>(
    "SELECT sequence, guess, feedback, created_at FROM solo_attempts WHERE solo_play_id = $1 ORDER BY sequence",
    [playId],
  );
  return result.rows.map((attempt) => ({
    sequence: attempt.sequence,
    guess: attempt.guess,
    units: decomposeHangul(attempt.guess),
    feedback: attempt.feedback,
    createdAt: attempt.created_at.toISOString(),
  }));
}

function revealAnswer(row: SoloPlayRow): string {
  return decryptValue({ ciphertext: row.answer_ciphertext, iv: row.answer_iv, tag: row.answer_tag });
}

function toDto(row: SoloPlayRow, attempts: AttemptDto[]): SoloPlayDto {
  const answer = revealAnswer(row);
  return {
    id: row.id,
    mode: row.mode,
    playDate: row.play_date,
    // 저장된 jamo_length는 만들어질 당시의 분해 규칙을 따르므로, 길이는 정답에서 다시 셉니다.
    jamoLength: decomposeHangul(answer).length,
    status: row.status,
    attempts,
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts.length),
    durationMs: row.duration_ms,
    ...(row.status === "active" ? {} : { answer }),
  };
}

/**
 * APP_SECRET이 바뀌었거나 저장값이 손상되면 기존 정답은 복구할 수 없습니다.
 * 오늘 문제 전체를 500으로 막는 대신, 해당 기기의 당일 판만 새로 만듭니다.
 */
async function recoverUnreadableDailyPlay(
  anonymousSessionId: string,
  playDate: string,
): Promise<SoloPlayRow> {
  return withTransaction(async (client) => {
    const current = await client.query<SoloPlayRow>(
      `SELECT ${PLAY_COLUMNS} FROM solo_plays
       WHERE anonymous_session_id = $1 AND mode = 'daily' AND play_date = $2
       FOR UPDATE`,
      [anonymousSessionId, playDate],
    );

    if (current.rows[0]) {
      try {
        revealAnswer(current.rows[0]);
        return current.rows[0];
      } catch {
        await client.query("DELETE FROM solo_plays WHERE id = $1", [current.rows[0].id]);
      }
    }

    const replacement = await insertPlay(client, anonymousSessionId, "daily", playDate, dailyWord(playDate));
    if (!replacement) {
      const retry = await client.query<SoloPlayRow>(
        `SELECT ${PLAY_COLUMNS} FROM solo_plays
         WHERE anonymous_session_id = $1 AND mode = 'daily' AND play_date = $2`,
        [anonymousSessionId, playDate],
      );
      if (!retry.rows[0]) throw new AppError(500, "DAILY_UNAVAILABLE", "오늘의 단어를 준비하지 못했습니다.");
      return retry.rows[0];
    }

    console.warn(JSON.stringify({ level: "warn", event: "daily_play_recreated", playDate }));
    return replacement;
  });
}

export async function getDaily(anonymousSessionId: string): Promise<DailyDto> {
  const playDate = seoulDate();
  const existing = await pool.query<SoloPlayRow>(
    `SELECT ${PLAY_COLUMNS} FROM solo_plays
     WHERE anonymous_session_id = $1 AND mode = 'daily' AND play_date = $2`,
    [anonymousSessionId, playDate],
  );

  let row: SoloPlayRow | null = existing.rows[0] ?? null;
  if (!row) {
    row = await insertPlay(pool, anonymousSessionId, "daily", playDate, dailyWord(playDate));
    if (!row) {
      // 같은 기기에서 동시에 두 번 열면 한쪽만 INSERT에 성공합니다.
      const retry = await pool.query<SoloPlayRow>(
        `SELECT ${PLAY_COLUMNS} FROM solo_plays
         WHERE anonymous_session_id = $1 AND mode = 'daily' AND play_date = $2`,
        [anonymousSessionId, playDate],
      );
      if (!retry.rows[0]) throw new AppError(500, "DAILY_UNAVAILABLE", "오늘의 단어를 준비하지 못했습니다.");
      row = retry.rows[0];
    }
  }

  try {
    revealAnswer(row);
  } catch {
    row = await recoverUnreadableDailyPlay(anonymousSessionId, playDate);
  }

  const [attempts, stats] = await Promise.all([selectAttempts(pool, row.id), getSoloStats(anonymousSessionId)]);
  return { play: toDto(row, attempts), stats, endsAt: dailyBoundaries().endAt.toISOString() };
}

export async function getPractice(anonymousSessionId: string): Promise<PracticeDto> {
  const active = await pool.query<SoloPlayRow>(
    `SELECT ${PLAY_COLUMNS} FROM solo_plays
     WHERE anonymous_session_id = $1 AND mode = 'practice' AND status = 'active'
     ORDER BY started_at DESC LIMIT 1`,
    [anonymousSessionId],
  );

  if (active.rows[0]) {
    return { play: toDto(active.rows[0], await selectAttempts(pool, active.rows[0].id)) };
  }

  const created = await insertPlay(pool, anonymousSessionId, "practice", null, randomWord());
  if (!created) throw new AppError(500, "PRACTICE_UNAVAILABLE", "연습 문제를 준비하지 못했습니다.");
  return { play: toDto(created, []) };
}

/** 풀던 연습 문제를 포기하고 새 단어를 받습니다. */
export async function nextPractice(anonymousSessionId: string): Promise<PracticeDto> {
  return withTransaction(async (client) => {
    const active = await client.query<SoloPlayRow>(
      `SELECT ${PLAY_COLUMNS} FROM solo_plays
       WHERE anonymous_session_id = $1 AND mode = 'practice' AND status = 'active'
       ORDER BY started_at DESC LIMIT 1 FOR UPDATE`,
      [anonymousSessionId],
    );

    let skippedAnswer: string | undefined;
    if (active.rows[0]) {
      await client.query(
        "UPDATE solo_plays SET status = 'failed', finished_at = NOW() WHERE id = $1 AND status = 'active'",
        [active.rows[0].id],
      );
      skippedAnswer = revealAnswer(active.rows[0]);
    }

    const created = await insertPlay(client, anonymousSessionId, "practice", null, randomWord());
    if (!created) throw new AppError(500, "PRACTICE_UNAVAILABLE", "연습 문제를 준비하지 못했습니다.");
    return { play: toDto(created, []), ...(skippedAnswer ? { skippedAnswer } : {}) };
  });
}

export async function submitSoloGuess(
  playId: string,
  anonymousSessionId: string,
  guessInput: string,
): Promise<SoloGuessResultDto> {
  const row = await withTransaction<SoloPlayRow>(async (client) => {
    const result = await client.query<SoloPlayRow & { anonymous_session_id: string }>(
      `SELECT ${PLAY_COLUMNS}, anonymous_session_id FROM solo_plays WHERE id = $1 FOR UPDATE`,
      [playId],
    );
    const play = result.rows[0];
    if (!play) throw new AppError(404, "PLAY_NOT_FOUND", "진행 중인 문제를 찾을 수 없습니다.");
    if (play.anonymous_session_id !== anonymousSessionId) {
      throw new AppError(403, "NOT_YOUR_PLAY", "본인의 풀이만 제출할 수 있습니다.");
    }
    if (play.status !== "active") throw new AppError(409, "PLAY_FINISHED", "이미 끝난 문제입니다.");
    if (play.mode === "daily" && play.play_date !== seoulDate()) {
      throw new AppError(409, "DAILY_EXPIRED", "날짜가 바뀌어 어제의 단어는 더 풀 수 없습니다.");
    }

    const answer = revealAnswer(play);
    const guess = resolveGuess(guessInput, decomposeHangul(answer).length);

    const countResult = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM solo_attempts WHERE solo_play_id = $1",
      [play.id],
    );
    const attemptCount = Number(countResult.rows[0].count);
    if (attemptCount >= MAX_ATTEMPTS) throw new AppError(409, "NO_ATTEMPTS_LEFT", "다섯 번의 기회를 모두 사용했습니다.");

    const sequence = attemptCount + 1;
    const feedback = evaluateGuess(guess, answer);
    const solved = isCorrectFeedback(feedback);
    const nextStatus = solved ? "solved" : sequence === MAX_ATTEMPTS ? "failed" : "active";
    const now = new Date();
    const durationMs = now.getTime() - play.started_at.getTime();

    await client.query(
      "INSERT INTO solo_attempts (solo_play_id, sequence, guess, feedback) VALUES ($1, $2, $3, $4::jsonb)",
      [play.id, sequence, guess, JSON.stringify(feedback)],
    );

    if (nextStatus === "active") return { ...play, status: nextStatus };

    await client.query(
      "UPDATE solo_plays SET status = $2::text, finished_at = $3::timestamptz, duration_ms = $4::integer WHERE id = $1",
      [play.id, nextStatus, now, durationMs],
    );
    return { ...play, status: nextStatus, duration_ms: durationMs };
  });

  const attempts = await selectAttempts(pool, row.id);
  const stats = row.mode === "daily" ? await getSoloStats(anonymousSessionId) : null;
  return { play: toDto(row, attempts), stats };
}

export async function getSoloStats(anonymousSessionId: string): Promise<SoloStatsDto> {
  const result = await pool.query<{ status: string; play_date: string; attempt_count: string }>(
    `SELECT p.status, p.play_date::text, COUNT(a.id)::text AS attempt_count
     FROM solo_plays p
     LEFT JOIN solo_attempts a ON a.solo_play_id = p.id
     WHERE p.anonymous_session_id = $1 AND p.mode = 'daily'
     GROUP BY p.id
     ORDER BY p.play_date DESC`,
    [anonymousSessionId],
  );

  const distribution = [0, 0, 0, 0, 0];
  const solvedDays: number[] = [];
  let playedCount = 0;

  for (const row of result.rows) {
    if (row.status === "active") continue;
    playedCount += 1;
    if (row.status !== "solved") continue;
    const attemptCount = Number(row.attempt_count);
    if (attemptCount >= 1 && attemptCount <= MAX_ATTEMPTS) distribution[attemptCount - 1] += 1;
    solvedDays.push(dayNumber(row.play_date));
  }

  return {
    playedCount,
    solvedCount: solvedDays.length,
    currentStreak: currentStreakOf(solvedDays, dayNumber(seoulDate())),
    bestStreak: bestStreakOf(solvedDays),
    distribution,
  };
}

/** solvedDays는 최신순으로 정렬된 날짜 번호입니다. */
function currentStreakOf(solvedDays: number[], today: number): number {
  if (!solvedDays.length) return 0;
  // 오늘 아직 못 풀었어도 어제까지 이어온 연속 기록은 살아 있습니다.
  let expected = solvedDays[0] === today ? today : today - 1;
  if (solvedDays[0] !== expected) return 0;

  let streak = 0;
  for (const day of solvedDays) {
    if (day !== expected) break;
    streak += 1;
    expected -= 1;
  }
  return streak;
}

function bestStreakOf(solvedDays: number[]): number {
  let best = 0;
  let streak = 0;
  let previous: number | null = null;
  for (const day of solvedDays) {
    streak = previous !== null && previous - day === 1 ? streak + 1 : 1;
    previous = day;
    if (streak > best) best = streak;
  }
  return best;
}
