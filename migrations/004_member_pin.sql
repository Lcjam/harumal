-- 브라우저를 바꿔도 자기 자리로 돌아올 수 있도록 재입장 비밀번호를 둡니다.
-- 이 마이그레이션 이전에 만들어진 멤버는 pin_hash가 없고, 그 자리는 이어받을 수 없습니다.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS pin_failed_count SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;
