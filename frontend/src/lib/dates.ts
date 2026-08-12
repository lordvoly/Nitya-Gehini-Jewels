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
