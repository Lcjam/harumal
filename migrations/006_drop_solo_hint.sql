-- 초기 solo_plays 스키마를 먼저 적용한 운영 DB에는 더 이상 쓰지 않는 hint가 남아 있습니다.
-- 기존 마이그레이션 파일을 고쳐도 이미 적용된 DB에는 다시 실행되지 않으므로 전진 마이그레이션으로 제거합니다.
ALTER TABLE solo_plays DROP COLUMN IF EXISTS hint;
