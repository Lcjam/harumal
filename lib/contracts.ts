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
  hint: string;
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

export type GuessResultDto = {
  sessionId: string;
  playId: string;
  status: PlayStatus;
  attempt: AttemptDto;
  attemptsRemaining: number;
  durationMs: number | null;
  answer?: string;
};
