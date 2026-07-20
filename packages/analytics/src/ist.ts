// IST (Asia/Kolkata) calendar helpers. Trading days and weekday buckets are
// always reckoned in IST (CLAUDE.md: store UTC, display/analyze IST).

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

function toIst(utcIso: string): Date {
  return new Date(new Date(utcIso).getTime() + IST_OFFSET_MS);
}

/** UTC ISO → IST calendar date (YYYY-MM-DD). */
export function istDate(utcIso: string): string {
  return toIst(utcIso).toISOString().slice(0, 10);
}

/** UTC ISO → IST weekday label. */
export function istWeekday(utcIso: string): Weekday {
  return WEEKDAYS[toIst(utcIso).getUTCDay()]!;
}
