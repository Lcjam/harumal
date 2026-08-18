import assert from "node:assert/strict";
import test from "node:test";
import { decomposeHangul } from "../lib/game.ts";
import { AppError } from "../server/errors.ts";
import { resolveGuess } from "../server/guess.ts";
import { ALLOWED_WORD_COUNT, findDictionaryWord, isDictionaryWord, SOLO_WORDS } from "../server/words.ts";

function expectAppError(code: string) {
  return (error: unknown): boolean => error instanceof AppError && error.code === code;
}

test("완성된 단어로 내도 자모로 내도 같은 단어로 받는다", () => {
  assert.equal(resolveGuess("사진", 5), "사진");
  assert.equal(resolveGuess("ㅅㅏㅈㅣㄴ", 5), "사진");
  // 겹자모는 기본 자모로 풀어서 들어옵니다.
  assert.equal(resolveGuess("베개", 6), "베개");
  assert.equal(resolveGuess("ㅂㅓㅣㄱㅏㅣ", 6), "베개");
});

test("사전에 없는 단어는 받지 않는다", () => {
  assert.throws(() => resolveGuess("ㅋㅋㅋㅏㅣ", 5), expectAppError("NOT_IN_DICTIONARY"));
  assert.equal(isDictionaryWord("사진"), true);
  assert.equal(isDictionaryWord("김민지"), false);
});

test("칸 수가 다르거나 한글이 아니면 막는다", () => {
  assert.throws(() => resolveGuess("사진", 6), expectAppError("WRONG_JAMO_LENGTH"));
  assert.throws(() => resolveGuess("photo", 5), expectAppError("INVALID_GUESS"));
  assert.throws(() => resolveGuess("   ", 5), expectAppError("INVALID_GUESS"));
});

test("정답으로 나가는 단어는 반드시 추측할 수도 있어야 한다", () => {
  // 정답 후보가 허용 목록에 없으면 맞는 답을 넣고도 막히게 됩니다.
  for (const word of SOLO_WORDS) {
    assert.ok(isDictionaryWord(word), `${word}는 정답 후보인데 추측이 막힙니다.`);
  }
  assert.ok(ALLOWED_WORD_COUNT > SOLO_WORDS.length * 3, "추측 허용 범위가 정답 후보보다 충분히 넓어야 합니다.");
});

test("사전의 모든 단어는 자기 자신으로 되찾을 수 있다", () => {
  for (const word of SOLO_WORDS) {
    const units = decomposeHangul(word);
    assert.equal(resolveGuess(units.join(""), units.length), findDictionaryWord(word));
  }
});
