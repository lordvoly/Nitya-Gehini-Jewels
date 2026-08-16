// Reformats an ISO YYYY-MM-DD string (the only shape dates ever come back
// from the backend as) into DD/MM/YYYY for display — pure string
// reordering, no Date object involved, so there's no timezone shift risk
// to a value that's already a plain calendar date. Native <input
// type="date"> fields already display DD/MM/YYYY on their own (governed by
// the browser's own locale, not this function) — this is only for the
// read-only text spots that print a raw ISO string straight from the API.
export function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// Pure date-math on an already-known YYYY-MM-DD string — never "now", so
// this stays safe under this app's "never compute today client-side" rule
// as long as the caller's starting date came from the server (e.g. the
// Dashboard summary's own echoed-back `today`). Constructs from explicit
// Y/M/D components (not `new Date(dateStr)`, which parses as UTC midnight
// and can shift a day once formatted back in the browser's local zone).
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// "Wed 19 Aug" — for grouping a list of dates by day (This Week's Pickups
// Due) without repeating formatDateDisplay's full DD/MM/YYYY. Same
// local-components construction as addDaysToDateString, for the same
// timezone-shift reason.
export function formatWeekdayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
