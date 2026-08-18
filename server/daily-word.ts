import { randomInt } from "node:crypto";
import { SOLO_WORDS } from "./words.ts";

export type PickedWord = { word: string; index: number };

/** 날짜를 번호로 바꿀 때 기준이 되는 날입니다. 바꾸면 출제 순서가 통째로 밀립니다. */
const EPOCH_UTC = Date.UTC(2024, 0, 1);
const SHUFFLE_SEED = 0x48415255;
const DAY_MS = 86_400_000;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * 사전을 한 번만 섞어 두고 그 순서를 계속 돌립니다.
 * 순서가 고정이라 연속한 며칠 안에 같은 단어가 다시 나오는 일이 없고,
 * 사전 길이만큼 지나야 한 바퀴가 돕니다.
 */
const ORDER = ((): number[] => {
  const random = mulberry32(SHUFFLE_SEED);
  const order = SOLO_WORDS.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
})();

export function dayNumber(playDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(playDate);
  if (!match) throw new Error(`날짜 형식이 올바르지 않습니다: ${playDate}`);
  return Math.round((Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - EPOCH_UTC) / DAY_MS);
}

/** 같은 날이면 누구에게나 같은 단어가 나옵니다. */
export function dailyWord(playDate: string): PickedWord {
  const total = SOLO_WORDS.length;
  if (!total) throw new Error("출제할 단어가 없습니다.");
  const day = dayNumber(playDate);
  const index = ORDER[((day % total) + total) % total];
  return { word: SOLO_WORDS[index], index };
}

export function randomWord(): PickedWord {
  const total = SOLO_WORDS.length;
  if (!total) throw new Error("출제할 단어가 없습니다.");
  const index = randomInt(total);
  return { word: SOLO_WORDS[index], index };
}
