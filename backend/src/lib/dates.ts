const IST_TIMEZONE = "Asia/Kolkata";

/**
 * "Today" in IST, as YYYY-MM-DD. All overdue/due-today/days-until-return
 * logic must be computed against this, never against the server's or
 * viewer's local timezone — see CLAUDE.md.
 */
export function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
}

export function daysUntil(dateStr: string): number {
  const today = new Date(`${istToday()}T00:00:00`);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Start (Monday) of the current calendar week in IST, as YYYY-MM-DD.
 */
export function istWeekStart(): string {
  const today = new Date(`${istToday()}T00:00:00`);
  const day = today.getDay(); // 0 (Sun) .. 6 (Sat)
  const diffToMonday = day === 0 ? 6 : day - 1;
  today.setDate(today.getDate() - diffToMonday);
  return today.toLocaleDateString("en-CA");
}

/**
 * End (Sunday) of the current calendar week in IST, as YYYY-MM-DD — the
 * forward-looking counterpart to istWeekStart(). Neither istWeekStart()
 * alone (used backward/present-looking, "since Monday until now", by
 * bookings_this_week) nor istRangeForPreset("week") (a backward-looking
 * rolling "past 7 days" window, for BookingsList's Time filter) is a
 * forward-looking range — this is a distinct third use of "week", for
 * "what's coming up before this calendar week ends" (Dashboard's This
 * Week's Pickups Due).
 */
export function istWeekEnd(): string {
  const start = new Date(`${istWeekStart()}T00:00:00`);
  start.setDate(start.getDate() + 6);
  return start.toLocaleDateString("en-CA");
}

/**
 * First and last day of the current calendar month in IST, as YYYY-MM-DD
 * — the default date range for Reports.
 */
export function istMonthRange(): { from: string; to: string } {
  const today = new Date(`${istToday()}T00:00:00`);
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: from.toLocaleDateString("en-CA"), to: to.toLocaleDateString("en-CA") };
}

/**
 * `days` days before today in IST, as YYYY-MM-DD — e.g. the "last 90 days"
 * cutoff for idle-inventory detection.
 */
export function istDaysAgo(days: number): string {
  const today = new Date(`${istToday()}T00:00:00`);
  today.setDate(today.getDate() - days);
  return today.toLocaleDateString("en-CA");
}

/**
 * `days` days after today in IST, as YYYY-MM-DD — the forward-looking
 * counterpart to istDaysAgo(), for a flexible "next N days" window (e.g.
 * the AI assistant's get_upcoming_pickups(days_ahead)).
 */
export function istDaysAhead(days: number): string {
  return istDaysAgo(-days);
}

const BOOKING_TIME_RANGE_DAYS: Record<string, number> = {
  week: 7,
  month: 30,
  "3months": 90,
  year: 365,
};

/**
 * Resolves a BookingsList time-range preset ("week"/"month"/"3months"/
 * "year") to a rolling [from, today] window in IST. Deliberately a rolling
 * window (today minus N days), not a calendar-boundary one like
 * istMonthRange() — "Past month" here means the last 30 days, not
 * "this calendar month so far", since these are relative "past N" presets,
 * not a "current period" default the way Reports' month range is. Returns
 * null for "all" (or anything unrecognized) — the caller's signal to skip
 * time-based filtering entirely.
 */
export function istRangeForPreset(preset: string): { from: string; to: string } | null {
  const days = BOOKING_TIME_RANGE_DAYS[preset];
  if (days == null) return null;
  return { from: istDaysAgo(days), to: istToday() };
}
