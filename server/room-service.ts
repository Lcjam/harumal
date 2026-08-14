import { randomBytes } from "node:crypto";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import type { ChallengeDto, GuessResultDto, LeaderboardEntryDto, MemberDto, PublicRoomDto, RoomSnapshotDto } from "../lib/contracts.ts";
import { compareRanking, decomposeHangul, evaluateGuess, isCorrectFeedback, normalizeWord, validateChallengeWord } from "../lib/game.ts";
import { decryptValue, encryptValue } from "./crypto.ts";
import { pool, withTransaction } from "./db.ts";
import { AppError, isPostgresUniqueViolation } from "./errors.ts";
import { dailyBoundaries, effectiveStatus } from "./time.ts";

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
};

type SessionRow = {
  id: string;
  code: string;
  play_date: string;
  status: string;
  join_cutoff_at: Date;
  end_at: Date;
  created_at: Date;
};

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const MAX_MEMBERS = 6;

function makeCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function normalizeNickname(value: string): string {
  const nickname = value.trim().replace(/\s+/g, " ");
  if (nickname.length < 1 || nickname.length > 12) throw new AppError(400, "INVALID_NICKNAME", "닉네임은 1~12자로 입력해 주세요.");
  if (/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 _-]/u.test(nickname)) throw new AppError(400, "INVALID_NICKNAME", "닉네임에 사용할 수 없는 문자가 있습니다.");
  return nickname;
}

async function getSessionByCode(database: Queryable, code: string, lock = false): Promise<SessionRow> {
  const result = await database.query<SessionRow>(
    `SELECT id, code, play_date::text, status, join_cutoff_at, end_at, created_at
     FROM daily_sessions WHERE code = $1 ${lock ? "FOR UPDATE" : ""}`,
    [code.toUpperCase()],
  );
  if (!result.rows[0]) throw new AppError(404, "ROOM_NOT_FOUND", "존재하지 않는 초대코드입니다.");
  return result.rows[0];
}

async function getMember(database: Queryable, sessionId: string, anonymousSessionId: string): Promise<{ id: string; nickname: string; joined_at: Date }> {
  const result = await database.query<{ id: string; nickname: string; joined_at: Date }>(
    "SELECT id, nickname, joined_at FROM members WHERE daily_session_id = $1 AND anonymous_session_id = $2",
    [sessionId, anonymousSessionId],
  );
  if (!result.rows[0]) throw new AppError(403, "NOT_A_MEMBER", "먼저 이 방에 참가해 주세요.");
  return result.rows[0];
}

function assertActive(session: SessionRow): void {
  if (effectiveStatus(session.end_at, session.status) === "ended") {
    throw new AppError(409, "SESSION_ENDED", "오늘의 방이 종료되었습니다.");
  }
}

export async function createRoom(anonymousSessionId: string, nicknameInput: string): Promise<string> {
  const nickname = normalizeNickname(nicknameInput);
  const boundaries = dailyBoundaries();
  if (Date.now() >= boundaries.joinCutoffAt.getTime()) throw new AppError(409, "JOIN_CLOSED", "오늘의 방 생성은 23시 59분에 마감되었습니다.");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = makeCode();
    try {
      await withTransaction(async (client) => {
        const session = await client.query<{ id: string }>(
          `INSERT INTO daily_sessions (code, play_date, join_cutoff_at, end_at)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [code, boundaries.playDate, boundaries.joinCutoffAt, boundaries.endAt],
        );
        await client.query(
          `INSERT INTO members (daily_session_id, anonymous_session_id, nickname)
           VALUES ($1, $2, $3)`,
          [session.rows[0].id, anonymousSessionId, nickname],
        );
      });
      return code;
    } catch (error) {
      if (isPostgresUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new AppError(503, "CODE_EXHAUSTED", "초대코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export async function joinRoom(code: string, anonymousSessionId: string, nicknameInput: string): Promise<{ sessionId: string; memberId: string }> {
  const nickname = normalizeNickname(nicknameInput);
  return withTransaction(async (client) => {
    const session = await getSessionByCode(client, code, true);
    assertActive(session);

    const existing = await client.query<{ id: string }>(
      "SELECT id FROM members WHERE daily_session_id = $1 AND anonymous_session_id = $2",
      [session.id, anonymousSessionId],
    );
    if (existing.rows[0]) return { sessionId: session.id, memberId: existing.rows[0].id };
    if (Date.now() >= session.join_cutoff_at.getTime()) throw new AppError(409, "JOIN_CLOSED", "이 방의 참가가 마감되었습니다.");

    const count = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM members WHERE daily_session_id = $1", [session.id]);
    if (Number(count.rows[0].count) >= MAX_MEMBERS) throw new AppError(409, "ROOM_FULL", "방이 가득 찼습니다.");

    try {
      const member = await client.query<{ id: string }>(
        "INSERT INTO members (daily_session_id, anonymous_session_id, nickname) VALUES ($1, $2, $3) RETURNING id",
        [session.id, anonymousSessionId, nickname],
      );
      return { sessionId: session.id, memberId: member.rows[0].id };
    } catch (error) {
      if (isPostgresUniqueViolation(error)) throw new AppError(409, "NICKNAME_TAKEN", "이미 사용 중인 닉네임입니다.");
      throw error;
    }
  });
}

export async function getPublicRoom(code: string, anonymousSessionId: string | null): Promise<PublicRoomDto> {
  const session = await getSessionByCode(pool, code);
  const [memberCountResult, membershipResult] = await Promise.all([
    pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM members WHERE daily_session_id = $1", [session.id]),
    anonymousSessionId
      ? pool.query("SELECT 1 FROM members WHERE daily_session_id = $1 AND anonymous_session_id = $2", [session.id, anonymousSessionId])
      : Promise.resolve({ rowCount: 0 }),
  ]);
  const memberCount = Number(memberCountResult.rows[0].count);
  const status = effectiveStatus(session.end_at, session.status);
  const isMember = Boolean(membershipResult.rowCount);
  return {
    code: session.code,
    playDate: session.play_date,
    status,
    joinCutoffAt: session.join_cutoff_at.toISOString(),
    endAt: session.end_at.toISOString(),
    memberCount,
    maxMembers: MAX_MEMBERS,
    isMember,
    canJoin: status === "active" && Date.now() < session.join_cutoff_at.getTime() && memberCount < MAX_MEMBERS,
  };
}

export async function publishChallenge(
  code: string,
  anonymousSessionId: string,
  answerInput: string,
  hintInput: string,
): Promise<{ sessionId: string; challengeId: string }> {
  let validated: ReturnType<typeof validateChallengeWord>;
  try {
    validated = validateChallengeWord(answerInput);
  } catch (error) {
    throw new AppError(400, "INVALID_ANSWER", error instanceof Error ? error.message : "정답을 확인해 주세요.");
  }
  const { normalized, units } = validated;
  const hint = hintInput.trim().replace(/\s+/g, " ");
  if (hint.length < 2 || hint.length > 60) throw new AppError(400, "INVALID_HINT", "힌트는 2~60자로 입력해 주세요.");
  if (hint.includes(normalized)) throw new AppError(400, "ANSWER_IN_HINT", "힌트에 정답을 직접 포함할 수 없습니다.");
  const encrypted = encryptValue(normalized);

  return withTransaction(async (client) => {
    const session = await getSessionByCode(client, code, true);
    assertActive(session);
    if (Date.now() >= session.join_cutoff_at.getTime()) throw new AppError(409, "PUBLISH_CLOSED", "문제 출제가 마감되었습니다.");
    const member = await getMember(client, session.id, anonymousSessionId);

    const result = await client.query<{ id: string }>(
      `INSERT INTO challenges (
         daily_session_id, author_member_id, answer_ciphertext, answer_iv, answer_tag,
         jamo_length, hint
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (daily_session_id, author_member_id) DO UPDATE SET
         answer_ciphertext = EXCLUDED.answer_ciphertext,
         answer_iv = EXCLUDED.answer_iv,
         answer_tag = EXCLUDED.answer_tag,
         jamo_length = EXCLUDED.jamo_length,
         hint = EXCLUDED.hint,
         updated_at = NOW()
       WHERE challenges.locked_at IS NULL
       RETURNING id`,
      [session.id, member.id, encrypted.ciphertext, encrypted.iv, encrypted.tag, units.length, hint],
    );
    if (!result.rows[0]) throw new AppError(409, "CHALLENGE_LOCKED", "다른 친구가 풀이를 시작해 문제를 수정할 수 없습니다.");
    return { sessionId: session.id, challengeId: result.rows[0].id };
  });
}

export async function startPlay(challengeId: string, anonymousSessionId: string): Promise<{ sessionId: string; playId: string }> {
  return withTransaction(async (client) => {
    const challenge = await client.query<{
      id: string;
      daily_session_id: string;
      author_member_id: string;
      status: string;
      end_at: Date;
    }>(
      `SELECT c.id, c.daily_session_id, c.author_member_id, s.status, s.end_at
       FROM challenges c JOIN daily_sessions s ON s.id = c.daily_session_id
       WHERE c.id = $1 FOR UPDATE OF c`,
      [challengeId],
    );
    const row = challenge.rows[0];
    if (!row) throw new AppError(404, "CHALLENGE_NOT_FOUND", "문제를 찾을 수 없습니다.");
    if (effectiveStatus(row.end_at, row.status) === "ended") throw new AppError(409, "SESSION_ENDED", "오늘의 방이 종료되었습니다.");
    const member = await getMember(client, row.daily_session_id, anonymousSessionId);
    if (member.id === row.author_member_id) throw new AppError(400, "OWN_CHALLENGE", "본인이 출제한 문제는 풀 수 없습니다.");

    const play = await client.query<{ id: string }>(
      `INSERT INTO plays (challenge_id, solver_member_id) VALUES ($1, $2)
       ON CONFLICT (challenge_id, solver_member_id) DO UPDATE SET challenge_id = EXCLUDED.challenge_id
       RETURNING id`,
      [challengeId, member.id],
    );
    await client.query("UPDATE challenges SET locked_at = COALESCE(locked_at, NOW()) WHERE id = $1", [challengeId]);
    return { sessionId: row.daily_session_id, playId: play.rows[0].id };
  });
}

export async function submitGuess(playId: string, anonymousSessionId: string, guessInput: string): Promise<GuessResultDto> {
  return withTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      status: "active" | "solved" | "failed" | "expired";
      started_at: Date;
      solver_member_id: string;
      daily_session_id: string;
      session_status: string;
      end_at: Date;
      answer_ciphertext: string;
      answer_iv: string;
      answer_tag: string;
      jamo_length: number;
    }>(
      `SELECT p.id, p.status, p.started_at, p.solver_member_id, c.daily_session_id,
              s.status AS session_status, s.end_at, c.answer_ciphertext, c.answer_iv,
              c.answer_tag, c.jamo_length
       FROM plays p
       JOIN challenges c ON c.id = p.challenge_id
       JOIN daily_sessions s ON s.id = c.daily_session_id
       WHERE p.id = $1 FOR UPDATE OF p`,
      [playId],
    );
    const play = result.rows[0];
    if (!play) throw new AppError(404, "PLAY_NOT_FOUND", "진행 중인 문제를 찾을 수 없습니다.");
    const member = await getMember(client, play.daily_session_id, anonymousSessionId);
    if (member.id !== play.solver_member_id) throw new AppError(403, "NOT_YOUR_PLAY", "본인의 풀이만 제출할 수 있습니다.");
    if (effectiveStatus(play.end_at, play.session_status) === "ended") {
      await client.query("UPDATE plays SET status = 'expired', finished_at = NOW() WHERE id = $1 AND status = 'active'", [play.id]);
      throw new AppError(409, "SESSION_ENDED", "오늘의 방이 종료되었습니다.");
    }
    if (play.status !== "active") throw new AppError(409, "PLAY_FINISHED", "이미 끝난 문제입니다.");

    const answer = decryptValue({ ciphertext: play.answer_ciphertext, iv: play.answer_iv, tag: play.answer_tag });
    const guess = normalizeWord(guessInput);
    if (!guess || !/^[가-힣]+$/u.test(guess)) throw new AppError(400, "INVALID_GUESS", "완성된 한글 단어를 입력해 주세요.");
    if (decomposeHangul(guess).length !== play.jamo_length) {
      throw new AppError(400, "WRONG_JAMO_LENGTH", `자모 ${play.jamo_length}개로 이루어진 단어를 입력해 주세요.`);
    }

    const countResult = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM attempts WHERE play_id = $1", [play.id]);
    const attemptCount = Number(countResult.rows[0].count);
    if (attemptCount >= 5) throw new AppError(409, "NO_ATTEMPTS_LEFT", "다섯 번의 기회를 모두 사용했습니다.");

    const sequence = attemptCount + 1;
    const feedback = evaluateGuess(guess, answer);
    const now = new Date();
    const durationMs = now.getTime() - play.started_at.getTime();
    const solved = isCorrectFeedback(feedback);
    const nextStatus = solved ? "solved" : sequence === 5 ? "failed" : "active";

    const attempt = await client.query<{ created_at: Date }>(
      `INSERT INTO attempts (play_id, sequence, guess, feedback)
       VALUES ($1, $2, $3, $4::jsonb) RETURNING created_at`,
      [play.id, sequence, guess, JSON.stringify(feedback)],
    );

    if (nextStatus !== "active") {
      await client.query(
        `UPDATE plays SET status = $2::text,
                          solved_at = CASE WHEN $2::text = 'solved' THEN $3::timestamptz ELSE NULL END,
                          finished_at = $3::timestamptz, duration_ms = $4::integer WHERE id = $1`,
        [play.id, nextStatus, now, durationMs],
      );
    }

    return {
      sessionId: play.daily_session_id,
      playId: play.id,
      status: nextStatus,
      attempt: {
        sequence,
        guess,
        units: decomposeHangul(guess),
        feedback,
        createdAt: attempt.rows[0].created_at.toISOString(),
      },
      attemptsRemaining: 5 - sequence,
      durationMs: nextStatus === "active" ? null : durationMs,
      ...(nextStatus === "active" ? {} : { answer }),
    };
  });
}

export async function getRoomSnapshot(code: string, anonymousSessionId: string): Promise<RoomSnapshotDto> {
  const session = await getSessionByCode(pool, code);
  assertActive(session);
  const current = await getMember(pool, session.id, anonymousSessionId);

  const [membersResult, challengesResult, attemptsResult, totalsResult] = await Promise.all([
    pool.query<{
      id: string; nickname: string; joined_at: Date; submitted: boolean; solved_count: string;
    }>(
      `SELECT m.id, m.nickname, m.joined_at, (c.id IS NOT NULL) AS submitted,
              COUNT(p.id) FILTER (WHERE p.status = 'solved')::text AS solved_count
       FROM members m
       LEFT JOIN challenges c ON c.author_member_id = m.id
       LEFT JOIN plays p ON p.solver_member_id = m.id
       WHERE m.daily_session_id = $1
       GROUP BY m.id, c.id ORDER BY m.joined_at`,
      [session.id],
    ),
    pool.query<{
      id: string; author_member_id: string; author_nickname: string; hint: string; jamo_length: number;
      published_at: Date; locked_at: Date | null; started_count: string; solved_count: string;
      play_id: string | null; play_status: "active" | "solved" | "failed" | "expired" | null;
      play_started_at: Date | null; duration_ms: number | null;
      answer_ciphertext: string; answer_iv: string; answer_tag: string;
    }>(
      `SELECT c.id, c.author_member_id, author.nickname AS author_nickname, c.hint, c.jamo_length,
              c.published_at, c.locked_at,
              COUNT(all_plays.id)::text AS started_count,
              COUNT(all_plays.id) FILTER (WHERE all_plays.status = 'solved')::text AS solved_count,
              my_play.id AS play_id, my_play.status AS play_status,
              my_play.started_at AS play_started_at, my_play.duration_ms,
              c.answer_ciphertext, c.answer_iv, c.answer_tag
       FROM challenges c
       JOIN members author ON author.id = c.author_member_id
       LEFT JOIN plays all_plays ON all_plays.challenge_id = c.id
       LEFT JOIN plays my_play ON my_play.challenge_id = c.id AND my_play.solver_member_id = $2
       WHERE c.daily_session_id = $1
       GROUP BY c.id, author.nickname, my_play.id
       ORDER BY c.published_at`,
      [session.id, current.id],
    ),
    pool.query<{
      play_id: string; sequence: number; guess: string; feedback: string[]; created_at: Date;
    }>(
      `SELECT a.play_id, a.sequence, a.guess, a.feedback, a.created_at
       FROM attempts a JOIN plays p ON p.id = a.play_id
       JOIN challenges c ON c.id = p.challenge_id
       WHERE c.daily_session_id = $1 AND p.solver_member_id = $2
       ORDER BY a.sequence`,
      [session.id, current.id],
    ),
    pool.query<{
      member_id: string; attempt_count: string; solved_count: string; total_duration_ms: string;
    }>(
      `WITH play_totals AS (
         SELECT p.id, p.solver_member_id, p.status, p.duration_ms, COUNT(a.id)::integer AS attempt_count
         FROM plays p LEFT JOIN attempts a ON a.play_id = p.id
         GROUP BY p.id
       )
       SELECT m.id AS member_id,
              COALESCE(SUM(pt.attempt_count), 0)::text AS attempt_count,
              COUNT(pt.id) FILTER (WHERE pt.status = 'solved')::text AS solved_count,
              COALESCE(SUM(pt.duration_ms) FILTER (WHERE pt.status = 'solved'), 0)::text AS total_duration_ms
       FROM members m
       LEFT JOIN play_totals pt ON pt.solver_member_id = m.id
       WHERE m.daily_session_id = $1
       GROUP BY m.id`,
      [session.id],
    ),
  ]);

  const members: MemberDto[] = membersResult.rows.map((member) => ({
    id: member.id,
    nickname: member.nickname,
    joinedAt: member.joined_at.toISOString(),
    isMe: member.id === current.id,
    challengeSubmitted: member.submitted,
    solvedCount: Number(member.solved_count),
  }));

  const attemptsByPlay = new Map<string, typeof attemptsResult.rows>();
  attemptsResult.rows.forEach((attempt) => {
    attemptsByPlay.set(attempt.play_id, [...(attemptsByPlay.get(attempt.play_id) ?? []), attempt]);
  });

  const challenges: ChallengeDto[] = challengesResult.rows.map((challenge) => {
    const isOwn = challenge.author_member_id === current.id;
    const terminal = challenge.play_status && challenge.play_status !== "active";
    const canReveal = isOwn || terminal;
    const answer = canReveal
      ? decryptValue({ ciphertext: challenge.answer_ciphertext, iv: challenge.answer_iv, tag: challenge.answer_tag })
      : undefined;
    return {
      id: challenge.id,
      authorMemberId: challenge.author_member_id,
      authorNickname: challenge.author_nickname,
      hint: challenge.hint,
      jamoLength: challenge.jamo_length,
      publishedAt: challenge.published_at.toISOString(),
      locked: Boolean(challenge.locked_at),
      isOwn,
      startedCount: Number(challenge.started_count),
      solvedCount: Number(challenge.solved_count),
      ...(isOwn && answer ? { ownAnswer: answer } : {}),
      play: challenge.play_id && challenge.play_status && challenge.play_started_at ? {
        id: challenge.play_id,
        status: challenge.play_status,
        startedAt: challenge.play_started_at.toISOString(),
        durationMs: challenge.duration_ms,
        attempts: (attemptsByPlay.get(challenge.play_id) ?? []).map((attempt) => ({
          sequence: attempt.sequence,
          guess: attempt.guess,
          units: decomposeHangul(attempt.guess),
          feedback: attempt.feedback as import("../lib/game.ts").FeedbackState[],
          createdAt: attempt.created_at.toISOString(),
        })),
        ...(terminal && answer ? { answer } : {}),
      } : null,
    };
  });

  const totals = new Map(totalsResult.rows.map((total) => [total.member_id, total]));
  const ranked = members.map((member) => {
    const total = totals.get(member.id);
    return {
      memberId: member.id,
      nickname: member.nickname,
      submittedChallenge: member.challengeSubmitted,
      solvedCount: Number(total?.solved_count ?? 0),
      attemptCount: Number(total?.attempt_count ?? 0),
      totalDurationMs: Number(total?.total_duration_ms ?? 0),
      joinedAt: member.joinedAt,
    };
  }).sort(compareRanking);

  let eligibleRank = 0;
  const leaderboard: LeaderboardEntryDto[] = ranked.map((entry) => {
    if (entry.submittedChallenge) eligibleRank += 1;
    return {
      memberId: entry.memberId,
      nickname: entry.nickname,
      rank: entry.submittedChallenge ? eligibleRank : null,
      submittedChallenge: entry.submittedChallenge,
      solvedCount: entry.solvedCount,
      attemptCount: entry.attemptCount,
      totalDurationMs: entry.totalDurationMs,
    };
  });

  return {
    id: session.id,
    code: session.code,
    playDate: session.play_date,
    status: effectiveStatus(session.end_at, session.status),
    joinCutoffAt: session.join_cutoff_at.toISOString(),
    endAt: session.end_at.toISOString(),
    memberCount: members.length,
    maxMembers: MAX_MEMBERS,
    currentMember: members.find((member) => member.isMe)!,
    members,
    challenges,
    leaderboard,
  };
}

export async function endExpiredSessions(): Promise<string[]> {
  return withTransaction(async (client) => {
    const sessions = await client.query<{ id: string }>(
      `SELECT id FROM daily_sessions
       WHERE end_at <= NOW()
       FOR UPDATE SKIP LOCKED`,
    );
    if (sessions.rows.length) {
      await client.query(
        "DELETE FROM daily_sessions WHERE id = ANY($1::uuid[])",
        [sessions.rows.map((session) => session.id)],
      );
    }
    await client.query(
      `DELETE FROM anonymous_sessions a
       WHERE a.last_seen_at < NOW() - INTERVAL '30 days'
         AND NOT EXISTS (SELECT 1 FROM members m WHERE m.anonymous_session_id = a.id)`,
    );
    return sessions.rows.map((session) => session.id);
  });
}
