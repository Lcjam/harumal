-- 힌트 없이 자모 단서만으로 추리하는 방식으로 바뀌어 힌트를 더 이상 쓰지 않습니다.
ALTER TABLE challenges DROP COLUMN IF EXISTS hint;
