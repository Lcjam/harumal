"use client";

import { KEYBOARD_ROWS, type FeedbackState } from "@/lib/game";

export function HangulKeyboard({ states, onKey, onDelete, onEnter, disabled = false, canSubmit = false }: {
  states: Map<string, FeedbackState>;
  onKey: (jamo: string) => void;
  onDelete: () => void;
  onEnter: () => void;
  disabled?: boolean;
  canSubmit?: boolean;
}) {
  return (
    <section className="hangulKeyboard" aria-label="한글 기본 자모 24자">
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div className={`keyboardRow keyboardRow${rowIndex + 1}`} key={rowIndex}>
          {rowIndex === 2 && (
            <button type="button" className="keycap action" onClick={onDelete} disabled={disabled} aria-label="한 칸 지우기">
              <b>⌫</b>
            </button>
          )}
          {row.map(([english, jamo]) => (
            <button
              type="button"
              className={`keycap ${states.get(jamo) ?? "empty"}`}
              key={english}
              onClick={() => onKey(jamo)}
              disabled={disabled}
              aria-label={jamo}
            >
              <b>{jamo}</b>
            </button>
          ))}
          {rowIndex === 2 && (
            <button type="button" className="keycap action enter" onClick={onEnter} disabled={disabled || !canSubmit} aria-label="정답 확인">
              <b>확인</b>
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
