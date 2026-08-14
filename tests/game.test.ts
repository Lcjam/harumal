import assert from "node:assert/strict";
import test from "node:test";
import { compareRanking, decomposeHangul, evaluateGuess, feedbackToEmoji, validateChallengeWord } from "../lib/game.ts";

test("한글 음절을 자음과 모음으로 분해한다", () => {
  assert.deepEqual(decomposeHangul("사진"), ["ㅅ", "ㅏ", "ㅈ", "ㅣ", "ㄴ"]);
  assert.deepEqual(decomposeHangul("꽃"), ["ㄲ", "ㅗ", "ㅊ"]);
  assert.deepEqual(decomposeHangul("과일"), ["ㄱ", "ㅘ", "ㅇ", "ㅣ", "ㄹ"]);
});

test("위치 일치, 포함, 불포함을 중복 자모 수까지 고려해 판정한다", () => {
  assert.deepEqual(evaluateGuess("시장", "사진"), ["correct", "present", "correct", "present", "absent"]);
  assert.deepEqual(evaluateGuess("사진", "사진"), ["correct", "correct", "correct", "correct", "correct"]);
  assert.deepEqual(evaluateGuess("가가", "나라"), ["absent", "correct", "absent", "correct"]);
});

test("공유용 결과는 정답 자모 없이 색상만 만든다", () => {
  assert.equal(feedbackToEmoji(["absent", "present", "correct"]), "⬛🟨🟩");
});

test("문제 정답 길이와 한글 여부를 검증한다", () => {
  assert.equal(validateChallengeWord(" 사진 ").normalized, "사진");
  assert.throws(() => validateChallengeWord("photo"), /한글/);
  assert.throws(() => validateChallengeWord("ㅅㅏㅈㅣㄴ"), /한글/);
  assert.throws(() => validateChallengeWord("가나다라마바사"), /12개/);
});

test("순위는 출제 여부, 정답 수, 시도 수, 시간 순서다", () => {
  const base = { submittedChallenge: true, joinedAt: "2026-08-06T00:00:00Z" };
  const entries = [
    { ...base, solvedCount: 3, attemptCount: 8, totalDurationMs: 50_000 },
    { ...base, solvedCount: 4, attemptCount: 12, totalDurationMs: 90_000 },
    { ...base, solvedCount: 4, attemptCount: 9, totalDurationMs: 100_000 },
  ].sort(compareRanking);
  assert.equal(entries[0].attemptCount, 9);
  assert.equal(entries[2].solvedCount, 3);
});
