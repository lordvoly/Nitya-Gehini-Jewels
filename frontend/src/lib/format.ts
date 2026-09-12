// Every currency figure and large count in this app should read the way
// this shop's own market expects — Indian digit grouping (lakh/crore:
// 1,23,456 and 12,34,567), not the US 3-digit grouping (123,456 and
// 1,234,567) plain template-literal interpolation (`₹${amount}`) used to
// produce with no separators at all. `Intl.NumberFormat("en-IN")` already
// implements this grouping correctly — no manual digit-splitting needed.
const inrNumberFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

// Formats a plain number/numeric-string for display — no currency symbol
// baked in, since every caller already writes its own literal "₹" (or, for
// a non-money count, none at all) right before this in JSX, and baking one
// in here would either duplicate it or force it where it isn't wanted.
// Null/undefined/NaN — a still-loading or genuinely absent figure — render
// as "0" rather than "NaN"/"null", matching what the raw-interpolation
// callers this replaces already did in practice (every call site guarded
// with `?? 0` or only ever passed a real number).
export function formatNumber(value: number | string | null | undefined): string {
  if (value == null) return "0";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  return inrNumberFormatter.format(n);
}
