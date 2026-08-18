export type FeedbackState = "correct" | "present" | "absent";

const CHOSEONG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"] as const;
const JUNGSEONG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"] as const;
const JONGSEONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"] as const;

/**
 * 겹자모는 기본 자모로 쪼개서 답을 맞힙니다. 예를 들어 베개는 ㅂ ㅓ ㅣ ㄱ ㅏ ㅣ입니다.
 * 쪼개고 나면 남는 것은 한글 기본 자모 24자뿐이고, 그게 아래 키보드와 정확히 일치합니다.
 */
const COMPOUND_PARTS: Record<string, string> = {
  ㄲ: "ㄱㄱ", ㄸ: "ㄷㄷ", ㅃ: "ㅂㅂ", ㅆ: "ㅅㅅ", ㅉ: "ㅈㅈ",
  ㄳ: "ㄱㅅ", ㄵ: "ㄴㅈ", ㄶ: "ㄴㅎ",
  ㄺ: "ㄹㄱ", ㄻ: "ㄹㅁ", ㄼ: "ㄹㅂ", ㄽ: "ㄹㅅ", ㄾ: "ㄹㅌ", ㄿ: "ㄹㅍ", ㅀ: "ㄹㅎ",
  ㅄ: "ㅂㅅ",
  ㅐ: "ㅏㅣ", ㅒ: "ㅑㅣ", ㅔ: "ㅓㅣ", ㅖ: "ㅕㅣ",
  ㅘ: "ㅗㅏ", ㅙ: "ㅗㅏㅣ", ㅚ: "ㅗㅣ",
  ㅝ: "ㅜㅓ", ㅞ: "ㅜㅓㅣ", ㅟ: "ㅜㅣ", ㅢ: "ㅡㅣ",
};

function toBasicJamo(jamo: string): string[] {
  const parts = COMPOUND_PARTS[jamo];
  return parts ? Array.from(parts) : [jamo];
}

export const KEYBOARD_ROWS = [
  [["Q", "ㅂ"], ["W", "ㅈ"], ["E", "ㄷ"], ["R", "ㄱ"], ["T", "ㅅ"], ["Y", "ㅛ"], ["U", "ㅕ"], ["I", "ㅑ"]],
  [["A", "ㅁ"], ["S", "ㄴ"], ["D", "ㅇ"], ["F", "ㄹ"], ["G", "ㅎ"], ["H", "ㅗ"], ["J", "ㅓ"], ["K", "ㅏ"], ["L", "ㅣ"]],
  [["Z", "ㅋ"], ["X", "ㅌ"], ["C", "ㅊ"], ["V", "ㅍ"], ["B", "ㅠ"], ["N", "ㅜ"], ["M", "ㅡ"]],
] as const;

export function normalizeWord(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, "");
}

export function isKoreanWord(value: string): boolean {
  const normalized = normalizeWord(value);
  return normalized.length > 0 && /^[가-힣]+$/u.test(normalized);
}

export function decomposeHangul(value: string): string[] {
  const units: string[] = [];
  for (const character of Array.from(normalizeWord(value))) {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const offset = code - 0xac00;
      const initial = Math.floor(offset / 588);
      const medial = Math.floor((offset % 588) / 28);
      const final = offset % 28;
      units.push(...toBasicJamo(CHOSEONG[initial]), ...toBasicJamo(JUNGSEONG[medial]));
      if (JONGSEONG[final]) units.push(...toBasicJamo(JONGSEONG[final]));
    } else if (/[ㄱ-ㅎㅏ-ㅣ]/u.test(character)) {
      units.push(...toBasicJamo(character));
    }
  }
  return units;
}

export function evaluateGuess(guess: string, answer: string): FeedbackState[] {
  const guessUnits = decomposeHangul(guess);
  const answerUnits = decomposeHangul(answer);
  if (guessUnits.length !== answerUnits.length) {
    throw new Error(`정답과 같은 ${answerUnits.length}개의 자모가 필요합니다.`);
  }

  const result: FeedbackState[] = answerUnits.map(() => "absent");
  const remaining = new Map<string, number>();

  answerUnits.forEach((unit, index) => {
    if (guessUnits[index] === unit) {
      result[index] = "correct";
    } else {
      remaining.set(unit, (remaining.get(unit) ?? 0) + 1);
    }
  });

  guessUnits.forEach((unit, index) => {
    if (result[index] === "correct") return;
    const count = remaining.get(unit) ?? 0;
    if (count > 0) {
      result[index] = "present";
      remaining.set(unit, count - 1);
    }
  });

  return result;
}

export function isCorrectFeedback(feedback: FeedbackState[]): boolean {
  return feedback.length > 0 && feedback.every((state) => state === "correct");
}

export function validateChallengeWord(value: string): { normalized: string; units: string[] } {
  const normalized = normalizeWord(value);
  if (!isKoreanWord(normalized)) throw new Error("한글 단어만 입력할 수 있습니다.");
  const units = decomposeHangul(normalized);
  if (units.length < 3 || units.length > 12) {
    throw new Error("정답은 자모 3개 이상 12개 이하로 입력해 주세요.");
  }
  return { normalized, units };
}

export function feedbackToEmoji(feedback: FeedbackState[]): string {
  return feedback.map((state) => state === "correct" ? "🟩" : state === "present" ? "🟨" : "⬛").join("");
}

export type RankingEntry = {
  solvedCount: number;
  attemptCount: number;
  totalDurationMs: number;
  submittedChallenge: boolean;
  joinedAt: string;
};

export function compareRanking(a: RankingEntry, b: RankingEntry): number {
  if (a.submittedChallenge !== b.submittedChallenge) return a.submittedChallenge ? -1 : 1;
  if (a.solvedCount !== b.solvedCount) return b.solvedCount - a.solvedCount;
  if (a.attemptCount !== b.attemptCount) return a.attemptCount - b.attemptCount;
  if (a.totalDurationMs !== b.totalDurationMs) return a.totalDurationMs - b.totalDurationMs;
  return a.joinedAt.localeCompare(b.joinedAt);
}
