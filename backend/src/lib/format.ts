// Indian digit grouping (lakh/crore: ₹1,23,456, not the US ₹123,456) for
// the rare user-facing message this backend builds itself (most currency
// display lives in the frontend — see frontend/src/lib/format.ts, which
// this mirrors). `Intl.NumberFormat("en-IN")` already implements the
// grouping correctly.
const inrNumberFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function formatINR(amount: number): string {
  return inrNumberFormatter.format(amount);
}
