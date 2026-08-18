import type { FeedbackState } from "./game.ts";

export type SessionStatus = "active" | "ended";
export type PlayStatus = "active" | "solved" | "failed" | "expired";

export type MemberDto = {
  id: string;
  nickname: string;
  joinedAt: string;
  isMe: boolean;
  challengeSubmitted: boolean;
  solvedCount: number;
};

export type AttemptDto = {
  sequence: number;
  guess: string;
  units: string[];
  feedback: FeedbackState[];
  createdAt: string;
};

export type ChallengeDto = {
  id: string;
  authorMemberId: string;
  authorNickname: string;
  jamoLength: number;
  publishedAt: string;
  locked: boolean;
  isOwn: boolean;
  startedCount: number;
  solvedCount: number;
  play: null | {
    id: string;
    status: PlayStatus;
    startedAt: string;
    durationMs: number | null;
    attempts: AttemptDto[];
    answer?: string;
  };
  ownAnswer?: string;
};

export type LeaderboardEntryDto = {
  memberId: string;
  nickname: string;
  rank: number | null;
  submittedChallenge: boolean;
  solvedCount: number;
  attemptCount: number;
  totalDurationMs: number;
};

export type RoomSnapshotDto = {
  id: string;
  code: string;
  playDate: string;
  status: SessionStatus;
  joinCutoffAt: string;
  endAt: string;
  memberCount: number;
  maxMembers: number;
  currentMember: MemberDto;
  members: MemberDto[];
  challenges: ChallengeDto[];
  leaderboard: LeaderboardEntryDto[];
};

export type PublicRoomDto = {
  code: string;
  playDate: string;
  status: SessionStatus;
  joinCutoffAt: string;
  endAt: string;
  memberCount: number;
  maxMembers: number;
  isMember: boolean;
  canJoin: boolean;
};

export type SoloMode = "daily" | "practice";
export type SoloStatus = "active" | "solved" | "failed";

export type SoloPlayDto = {
  id: string;
  mode: SoloMode;
  playDate: string | null;
  jamoLength: number;
  status: SoloStatus;
  attempts: AttemptDto[];
  attemptsRemaining: number;
  durationMs: number | null;
  answer?: string;
};

export type SoloStatsDto = {
  playedCount: number;
  solvedCount: number;
  currentStreak: number;
  bestStreak: number;
  /** 1~5번째 시도에 맞힌 횟수입니다. */
  distribution: number[];
};

export type DailyDto = {
  play: SoloPlayDto;
  stats: SoloStatsDto;
  endsAt: string;
};

export type PracticeDto = {
  play: SoloPlayDto;
  /** 새 단어를 받으면서 포기한 직전 문제의 정답입니다. */
  skippedAnswer?: string;
};

export type SoloGuessResultDto = {
  play: SoloPlayDto;
  stats: SoloStatsDto | null;
};

export type GuessResultDto = {
  sessionId: string;
  playId: string;
  status: PlayStatus;
  attempt: AttemptDto;
  attemptsRemaining: number;
  durationMs: number | null;
  answer?: string;
};
