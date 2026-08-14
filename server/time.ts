const SEOUL_TIMEZONE = "Asia/Seoul";

export function seoulDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function dailyBoundaries(now = new Date()): { playDate: string; joinCutoffAt: Date; endAt: Date } {
  const playDate = seoulDate(now);
  const endAt = new Date(`${playDate}T23:59:59.999+09:00`);
  return {
    playDate,
    joinCutoffAt: endAt,
    endAt,
  };
}

export function effectiveStatus(endAt: string | Date, storedStatus: string): "active" | "ended" {
  return storedStatus === "ended" || new Date(endAt).getTime() <= Date.now() ? "ended" : "active";
}
