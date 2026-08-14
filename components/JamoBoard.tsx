"use client";

import type { AttemptDto } from "@/lib/contracts";

export function JamoBoard({ attempts, length }: { attempts: AttemptDto[]; length: number }) {
  return (
    <div className={`jamoBoard jamoLength${length}`}>
      {Array.from({ length: 5 }, (_, rowIndex) => {
        const attempt = attempts[rowIndex];
        return (
          <div className={`jamoRow ${rowIndex === attempts.length ? "current" : ""}`} key={rowIndex}>
            {Array.from({ length }, (_, unitIndex) => (
              <span className={`jamoTile ${attempt?.feedback[unitIndex] ?? "empty"}`} key={unitIndex}>
                {attempt?.units[unitIndex] ?? ""}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
