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
