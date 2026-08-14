"use client";

import { KEYBOARD_ROWS, type FeedbackState } from "@/lib/game";

export function HangulKeyboard({ states }: {
  states: Map<string, FeedbackState>;
}) {
  return (
    <section className="hangulKeyboard" aria-label="두벌식 한글 키보드">
      <div className="keyboardCaption"><strong>두벌식 키보드</strong><span>사용한 자모의 결과가 누적됩니다</span></div>
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div className={`keyboardRow keyboardRow${rowIndex + 1}`} key={rowIndex}>
          {rowIndex === 2 && <span className="keycap action" aria-hidden="true"><small>DEL</small><b>⌫</b></span>}
          {row.map(([english, jamo]) => (
            <span className={`keycap ${states.get(jamo) ?? "empty"}`} key={english} aria-label={`${english} 키, ${jamo}`}>
              <small>{english}</small><b>{jamo}</b>
            </span>
          ))}
          {rowIndex === 2 && <span className="keycap action enter" aria-hidden="true"><small>ENTER</small><b>↵</b></span>}
        </div>
      ))}
    </section>
  );
}
