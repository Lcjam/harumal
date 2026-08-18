"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttemptDto } from "@/lib/contracts";
import { KEYBOARD_ROWS, type FeedbackState } from "@/lib/game";
import { HangulKeyboard } from "./HangulKeyboard";
import { JamoBoard } from "./JamoBoard";

/** 데스크톱에서 물리 키보드로도 칠 수 있게 두벌식 자리를 그대로 씁니다. */
const JAMO_BY_LETTER = new Map(KEYBOARD_ROWS.flat().map(([english, jamo]) => [english.toLowerCase(), jamo as string]));
const JAMO_KEYS = new Set(KEYBOARD_ROWS.flat().map(([, jamo]) => jamo as string));

/**
 * 화면 키보드로 칸을 직접 채우는 입력부입니다.
 * 따로 입력창을 두면 모바일에서 OS 키보드가 올라와 판을 가려 버립니다.
 */
export function PuzzlePad({ attempts, length, active, submitting, error, onSubmit }: {
  attempts: AttemptDto[];
  length: number;
  active: boolean;
  submitting: boolean;
  error: string;
  onSubmit: (guess: string) => void;
}) {
  const [draft, setDraft] = useState<string[]>([]);

  // 제출이 반영되면 다음 줄을 위해 비웁니다.
  useEffect(() => {
    setDraft([]);
  }, [attempts.length, length]);

  const append = useCallback((jamo: string) => {
    if (!active || submitting) return;
    setDraft((current) => (current.length >= length ? current : [...current, jamo]));
  }, [active, submitting, length]);

  const remove = useCallback(() => {
    if (!active || submitting) return;
    setDraft((current) => current.slice(0, -1));
  }, [active, submitting]);

  const filled = draft.length === length;
  const submit = useCallback(() => {
    if (!active || submitting || draft.length !== length) return;
    onSubmit(draft.join(""));
  }, [active, submitting, draft, length, onSubmit]);

  useEffect(() => {
    if (!active) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Backspace") {
        event.preventDefault();
        remove();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
        return;
      }
      const jamo = JAMO_KEYS.has(event.key) ? event.key : JAMO_BY_LETTER.get(event.key.toLowerCase());
      if (jamo) {
        event.preventDefault();
        append(jamo);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, append, remove, submit]);

  const keyboardStates = useMemo(() => {
    const states = new Map<string, FeedbackState>();
    const priority: Record<FeedbackState, number> = { absent: 1, present: 2, correct: 3 };
    attempts.forEach((attempt) => {
      attempt.units.forEach((unit, index) => {
        const next = attempt.feedback[index];
        const current = states.get(unit);
        if (!current || priority[next] > priority[current]) states.set(unit, next);
      });
    });
    return states;
  }, [attempts]);

  return (
    <>
      <JamoBoard attempts={attempts} length={length} draft={draft} />
      <p className="padStatus" role="status" aria-live="polite">
        {error
          ? <span className="guessError">{error}</span>
          : submitting ? "확인하는 중…" : active ? `${draft.length} / ${length}칸` : ""}
      </p>
      {active && (
        <HangulKeyboard
          states={keyboardStates}
          onKey={append}
          onDelete={remove}
          onEnter={submit}
          disabled={submitting}
          canSubmit={filled}
        />
      )}
    </>
  );
}
