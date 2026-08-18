"use client";

import type { AttemptDto } from "@/lib/contracts";

export function JamoBoard({ attempts, length, draft = [] }: {
  attempts: AttemptDto[];
  length: number;
  /** 아직 제출하지 않고 채워 넣는 중인 자모입니다. */
  draft?: string[];
}) {
  return (
    <div className={`jamoBoard jamoLength${length}`}>
      {Array.from({ length: 5 }, (_, rowIndex) => {
        const attempt = attempts[rowIndex];
        const isCurrent = rowIndex === attempts.length;
        return (
          <div className={`jamoRow ${isCurrent ? "current" : ""}`} key={rowIndex}>
            {Array.from({ length }, (_, unitIndex) => {
              const drafted = isCurrent ? draft[unitIndex] : undefined;
              return (
                <span
                  className={`jamoTile ${attempt?.feedback[unitIndex] ?? (drafted ? "drafted" : "empty")}`}
                  key={unitIndex}
                >
                  {attempt?.units[unitIndex] ?? drafted ?? ""}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
