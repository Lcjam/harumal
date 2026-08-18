import { decomposeHangul, normalizeWord } from "../lib/game.ts";
import { AppError } from "./errors.ts";
import { findDictionaryWord } from "./words.ts";

/**
 * 화면 키보드는 자모를 그대로 보내고 예전 클라이언트는 완성된 단어를 보냅니다.
 * 둘 다 받아서 사전에 있는 단어 형태로 바꿔 돌려줍니다. 채점은 어차피 자모 단위입니다.
 */
export function resolveGuess(input: string, answerLength: number): string {
  const guess = normalizeWord(input);
  if (!guess || !/^[가-힣ㄱ-ㅎㅏ-ㅣ]+$/u.test(guess)) {
    throw new AppError(400, "INVALID_GUESS", "한글 자모로 입력해 주세요.");
  }
  if (decomposeHangul(guess).length !== answerLength) {
    throw new AppError(400, "WRONG_JAMO_LENGTH", `자모 ${answerLength}칸을 모두 채워 주세요.`);
  }
  const word = findDictionaryWord(guess);
  if (!word) throw new AppError(400, "NOT_IN_DICTIONARY", "사전에 없는 단어예요.");
  return word;
}
