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
