CREATE TABLE IF NOT EXISTS solo_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_session_id UUID NOT NULL REFERENCES anonymous_sessions(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('daily', 'practice')),
  play_date DATE,
  word_index INTEGER NOT NULL,
  answer_ciphertext TEXT NOT NULL,
  answer_iv TEXT NOT NULL,
  answer_tag TEXT NOT NULL,
  jamo_length SMALLINT NOT NULL CHECK (jamo_length BETWEEN 3 AND 12),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'solved', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  CONSTRAINT solo_daily_has_date CHECK ((mode = 'daily') = (play_date IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS solo_plays_daily_idx
  ON solo_plays (anonymous_session_id, play_date)
  WHERE mode = 'daily';

CREATE INDEX IF NOT EXISTS solo_plays_session_idx
  ON solo_plays (anonymous_session_id, started_at DESC);

CREATE TABLE IF NOT EXISTS solo_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solo_play_id UUID NOT NULL REFERENCES solo_plays(id) ON DELETE CASCADE,
  sequence SMALLINT NOT NULL CHECK (sequence BETWEEN 1 AND 5),
  guess VARCHAR(24) NOT NULL,
  feedback JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (solo_play_id, sequence)
);

CREATE INDEX IF NOT EXISTS solo_attempts_play_idx ON solo_attempts (solo_play_id, sequence);
