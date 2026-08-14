CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anonymous_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) NOT NULL UNIQUE,
  play_date DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  join_cutoff_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  CONSTRAINT session_window_order CHECK (join_cutoff_at <= end_at)
);

CREATE INDEX IF NOT EXISTS daily_sessions_date_idx ON daily_sessions (play_date DESC);

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_session_id UUID NOT NULL REFERENCES daily_sessions(id) ON DELETE CASCADE,
  anonymous_session_id UUID NOT NULL REFERENCES anonymous_sessions(id) ON DELETE CASCADE,
  nickname VARCHAR(20) NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (daily_session_id, anonymous_session_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS members_session_nickname_idx
  ON members (daily_session_id, LOWER(nickname));

CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_session_id UUID NOT NULL REFERENCES daily_sessions(id) ON DELETE CASCADE,
  author_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  answer_ciphertext TEXT NOT NULL,
  answer_iv TEXT NOT NULL,
  answer_tag TEXT NOT NULL,
  jamo_length SMALLINT NOT NULL CHECK (jamo_length BETWEEN 3 AND 12),
  hint VARCHAR(80) NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  UNIQUE (daily_session_id, author_member_id)
);

CREATE INDEX IF NOT EXISTS challenges_session_idx ON challenges (daily_session_id, published_at);

CREATE TABLE IF NOT EXISTS plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  solver_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'solved', 'failed', 'expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  solved_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  UNIQUE (challenge_id, solver_member_id)
);

CREATE INDEX IF NOT EXISTS plays_solver_idx ON plays (solver_member_id, status);
CREATE INDEX IF NOT EXISTS plays_challenge_idx ON plays (challenge_id, status);

CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id UUID NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  sequence SMALLINT NOT NULL CHECK (sequence BETWEEN 1 AND 5),
  guess VARCHAR(24) NOT NULL,
  feedback JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (play_id, sequence)
);

CREATE INDEX IF NOT EXISTS attempts_play_idx ON attempts (play_id, sequence);
