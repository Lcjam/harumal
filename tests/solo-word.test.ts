import assert from "node:assert/strict";
import test from "node:test";
import { decomposeHangul, validateChallengeWord } from "../lib/game.ts";
import { dailyWord, dayNumber, randomWord } from "../server/daily-word.ts";
import { SOLO_WORDS, SOLO_WORD_CATALOG } from "../server/words.ts";

test("사전의 모든 단어가 출제 규칙을 통과한다", () => {
  for (const word of SOLO_WORD_CATALOG) {
    const { normalized, units } = validateChallengeWord(word);
    assert.equal(normalized, word, `${word}는 정규화가 필요한 형태입니다.`);
    assert.ok(units.length >= 3 && units.length <= 12, `${word}는 자모 ${units.length}개로 범위를 벗어납니다.`);
  }
  assert.equal(SOLO_WORDS.length, SOLO_WORD_CATALOG.length, "검증을 통과하지 못한 단어가 있습니다.");
});

test("사전에 중복된 단어가 없다", () => {
  assert.equal(new Set(SOLO_WORD_CATALOG).size, SOLO_WORD_CATALOG.length);
});

test("같은 날짜에는 언제 물어봐도 같은 단어가 나온다", () => {
  assert.deepEqual(dailyWord("2026-08-15"), dailyWord("2026-08-15"));
  assert.notEqual(dailyWord("2026-08-15").word, dailyWord("2026-08-16").word);
});

test("사전을 한 바퀴 도는 동안 같은 단어를 다시 내지 않는다", () => {
  const start = dayNumber("2026-01-01");
  const words = new Set<string>();
  for (let offset = 0; offset < SOLO_WORDS.length; offset += 1) {
    const date = new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10);
    words.add(dailyWord(date).word);
  }
  assert.equal(words.size, SOLO_WORDS.length);
  assert.equal(dayNumber("2026-01-02") - start, 1);
});

test("날짜 번호는 하루에 1씩 늘고 연·월 경계에서도 이어진다", () => {
  assert.equal(dayNumber("2024-01-01"), 0);
  assert.equal(dayNumber("2024-03-01") - dayNumber("2024-02-29"), 1);
  assert.equal(dayNumber("2027-01-01") - dayNumber("2026-12-31"), 1);
  assert.throws(() => dayNumber("2026-8-15"), /날짜 형식/);
});

test("연습 모드 단어도 출제 가능한 형태다", () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const picked = randomWord();
    assert.equal(decomposeHangul(picked.word).length, validateChallengeWord(picked.word).units.length);
    assert.ok(picked.index >= 0 && picked.index < SOLO_WORDS.length);
  }
});
