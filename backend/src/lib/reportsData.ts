import { supabase } from "./supabase.js";
import { istDaysAgo } from "./dates.js";

// Shared by reports.ts (GET /api/reports) and the AI assistant's tools
// (backend/src/tools/index.ts) — extracted so the tool answers are
// genuinely backed by the same already-tested queries the Reports page
// itself uses, not a second, possibly-diverging reimplementation.

export interface BookingItemRow {
  id: string;
  booking_id: string;
  type: "rental" | "sale";
  price_charged: number;
  is_foc: boolean;
  item_id: string;
  items: { item_code: string; name: string } | null;
  bookings: { customer_id: string; customers: { name: string; phone: string; customer_type: "regular" | "influencer" | "mua" } | null } | null;
  // Optional — only getPeriodBookingItems actually selects this column;
  // getItemBookingItems/getAllBookingItems don't, so it stays undefined
  // there rather than claiming a guarantee those queries don't provide.
  // Feeds getRevenueTrend's date-bucketing below.
  pickup_date?: string;
}

const isRegular = (b: BookingItemRow) => (b.bookings?.customers?.customer_type ?? "regular") === "regular";

// The one place "what did this item actually cost" gets decided — an FOC
// item's real price_charged stays stored untouched (a reference of what it
// would have cost), but contributes ₹0 to every revenue/balance figure.
// Every function below that sums price_charged goes through this instead
// of reading the raw column directly.
export function effectivePrice(item: { price_charged: number; is_foc: boolean }): number {
  return item.is_foc ? 0 : Number(item.price_charged);
}

// A cancelled item never actually happened, so it's excluded here — same
// rule applied consistently across every figure derived from this query.
export async function getPeriodBookingItems(from: string, to: string): Promise<BookingItemRow[]> {
  const { data, error } = await supabase
    .from("booking_items")
    .select(
      "id, booking_id, type, price_charged, is_foc, item_id, pickup_date, items(item_code, name), bookings(customer_id, customers(name, phone, customer_type))",
    )
    .neq("status", "cancelled")
    .gte("pickup_date", from)
    .lte("pickup_date", to)
    .returns<BookingItemRow[]>();
  if (error) throw error;
  return data;
}

// Same shape and same cancelled-exclusion rule as getPeriodBookingItems,
// scoped to one item instead of a date-bounded shop-wide period — from/to
// optional (all-time when omitted) rather than required, since
// get_item_revenue's default is "this item's whole history", not "this
// month" the way get_financial_summary's is. Feeds directly into
// getRevenueBreakdown below exactly like getPeriodBookingItems already
// does, so a single item's revenue reconciles by the same construction.
export async function getItemBookingItems(itemId: string, from?: string, to?: string): Promise<BookingItemRow[]> {
  let query = supabase
    .from("booking_items")
    .select("id, booking_id, type, price_charged, is_foc, item_id, items(item_code, name), bookings(customer_id, customers(name, phone, customer_type))")
    .eq("item_id", itemId)
    .neq("status", "cancelled");
  if (from) query = query.gte("pickup_date", from);
  if (to) query = query.lte("pickup_date", to);
  const { data, error } = await query.returns<BookingItemRow[]>();
  if (error) throw error;
  return data;
}

export function summarizeBookingItems(periodItems: BookingItemRow[]) {
  return {
    total_bookings: new Set(periodItems.map((b) => b.booking_id)).size,
    rental_count: periodItems.filter((b) => b.type === "rental").length,
    sale_count: periodItems.filter((b) => b.type === "sale").length,
    // FOC items count for booking/rental/sale counts above (a real
    // transaction happened) but contribute ₹0 to revenue.
    total_revenue: periodItems.reduce((sum, b) => sum + effectivePrice(b), 0),
  };
}

export function rankMostBookedItems(periodItems: BookingItemRow[], includeCollabs: boolean) {
  const rankingRows = includeCollabs ? periodItems : periodItems.filter(isRegular);
  const itemCounts = new Map<string, { item_id: string; item_code: string; name: string; booking_count: number }>();
  for (const b of rankingRows) {
    if (!b.items) continue;
    const existing = itemCounts.get(b.item_id);
    if (existing) existing.booking_count += 1;
    else itemCounts.set(b.item_id, { item_id: b.item_id, item_code: b.items.item_code, name: b.items.name, booking_count: 1 });
  }
  return [...itemCounts.values()].sort((a, b) => b.booking_count - a.booking_count);
}

// ── Revenue trend ("growth" chart) ─────────────────────────────────────

export type RevenueTrendGranularity = "day" | "week" | "month" | "year";

export interface RevenueTrendPoint {
  // The bucket's own start date (ISO) — a day bucket is itself, a week
  // bucket is its Monday, a month bucket is its 1st, a year bucket is its
  // Jan 1. The frontend formats this into a display label; never a
  // separately-computed label sent from here (one source of truth).
  bucket: string;
  revenue: number;
}

function daysBetweenDates(from: string, to: string): number {
  const fromMs = new Date(`${from}T00:00:00Z`).getTime();
  const toMs = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((toMs - fromMs) / 86_400_000);
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 (Sun) .. 6 (Sat)
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

function firstOfYear(dateStr: string): string {
  return `${dateStr.slice(0, 4)}-01-01`;
}

function bucketKeyFor(dateStr: string, granularity: RevenueTrendGranularity): string {
  if (granularity === "day") return dateStr;
  if (granularity === "week") return mondayOf(dateStr);
  if (granularity === "month") return firstOfMonth(dateStr);
  return firstOfYear(dateStr);
}

// Every bucket key in [from, to], inclusive of whichever bucket each
// endpoint falls in — so a chart always starts and ends at the edges of
// the selected range, not just wherever the first/last actual booking
// happened to land, and every bucket in between gets an explicit ₹0
// rather than being silently skipped (a line/area chart connecting across
// a skipped gap would misrepresent a genuinely quiet period as a smooth
// slope instead of a flat trough).
function enumerateBucketKeys(from: string, to: string, granularity: RevenueTrendGranularity): string[] {
  const keys: string[] = [];
  let cursor = bucketKeyFor(from, granularity);
  const lastKey = bucketKeyFor(to, granularity);
  while (cursor <= lastKey) {
    keys.push(cursor);
    const d = new Date(`${cursor}T00:00:00Z`);
    if (granularity === "day") d.setUTCDate(d.getUTCDate() + 1);
    else if (granularity === "week") d.setUTCDate(d.getUTCDate() + 7);
    else if (granularity === "month") d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return keys;
}

// Auto-picks a bucket size from the resolved [from, to] span so a 1-week
// report isn't flattened into a single monthly bar, and a many-year
// "Lifetime" report isn't hundreds of daily points wide. Reuses
// periodItems (already fetched by the caller for summary/most-booked) —
// no second query.
export function getRevenueTrend(periodItems: BookingItemRow[], from: string, to: string): { granularity: RevenueTrendGranularity; points: RevenueTrendPoint[] } {
  const span = daysBetweenDates(from, to);
  const granularity: RevenueTrendGranularity = span <= 14 ? "day" : span <= 120 ? "week" : span <= 730 ? "month" : "year";

  const totals = new Map<string, number>();
  for (const key of enumerateBucketKeys(from, to, granularity)) totals.set(key, 0);
  for (const item of periodItems) {
    if (!item.pickup_date) continue;
    const key = bucketKeyFor(item.pickup_date, granularity);
    totals.set(key, (totals.get(key) ?? 0) + effectivePrice(item));
  }

  return {
    granularity,
    points: [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, revenue]) => ({ bucket, revenue })),
  };
}

// All-time, non-cancelled booking_items — no date bound, unlike
// getPeriodBookingItems. Backs repeat-customer ranking below, which is
// deliberately never scoped to a report's date range (a customer's repeat
// status is a lifetime fact, not a this-month one — see rankRepeatCustomers).
export async function getAllBookingItems(): Promise<BookingItemRow[]> {
  const { data, error } = await supabase
    .from("booking_items")
    .select("id, booking_id, type, price_charged, is_foc, item_id, items(item_code, name), bookings(customer_id, customers(name, phone, customer_type))")
    .neq("status", "cancelled")
    .returns<BookingItemRow[]>();
  if (error) throw error;
  return data;
}

// Originally inline in reports.ts (GET /api/reports) — extracted once the AI
// assistant's own get_repeat_customers tool needed the exact same
// aggregation, same reasoning as every other shared function in this file:
// one query, not two that could quietly drift. Filters to customers with
// more than one (non-cancelled) booking, sorted by booking_count descending.
export function rankRepeatCustomers(allItems: BookingItemRow[], includeCollabs: boolean) {
  const rankingRows = includeCollabs ? allItems : allItems.filter(isRegular);
  const customerAgg = new Map<
    string,
    { customer_id: string; name: string; phone: string; bookingIds: Set<string>; total_spend: number }
  >();
  for (const b of rankingRows) {
    const customerId = b.bookings?.customer_id;
    const customer = b.bookings?.customers;
    if (!customerId || !customer) continue;
    const existing = customerAgg.get(customerId);
    if (existing) {
      existing.bookingIds.add(b.booking_id);
      existing.total_spend += effectivePrice(b);
    } else {
      customerAgg.set(customerId, {
        customer_id: customerId,
        name: customer.name,
        phone: customer.phone,
        bookingIds: new Set([b.booking_id]),
        total_spend: effectivePrice(b),
      });
    }
  }
  return [...customerAgg.values()]
    .map((c) => ({ customer_id: c.customer_id, name: c.name, phone: c.phone, booking_count: c.bookingIds.size, total_spend: c.total_spend }))
    .filter((c) => c.booking_count > 1)
    .sort((a, b) => b.booking_count - a.booking_count);
}

// Active items with no real booking in the last 90 days (fixed window from
// today, independent of any report date range). Retired items (is_active =
// false) stay excluded — a retired item was already taken out of rotation
// on purpose, so it isn't "idle inventory worth reactivating".
export async function getIdleInventory() {
  const cutoff = istDaysAgo(90);
  const { data: activeItems, error: itemsError } = await supabase
    .from("items")
    .select("id, item_code, name, category")
    .eq("is_active", true);
  if (itemsError) throw itemsError;

  const { data: recentBookingItems, error: recentError } = await supabase
    .from("booking_items")
    .select("item_id")
    .neq("status", "cancelled")
    .gte("pickup_date", cutoff);
  if (recentError) throw recentError;

  const recentlyBookedIds = new Set((recentBookingItems ?? []).map((b) => b.item_id));
  return (activeItems ?? []).filter((i) => !recentlyBookedIds.has(i.id));
}

export async function getExpensesForPeriod(from: string, to: string) {
  const { data: periodExpenses, error } = await supabase.from("expenses").select("category, amount").gte("date", from).lte("date", to);
  if (error) throw error;

  const categoryTotals = new Map<string, number>();
  for (const e of periodExpenses ?? []) {
    categoryTotals.set(e.category, (categoryTotals.get(e.category) ?? 0) + Number(e.amount));
  }
  return {
    expenses_total: [...categoryTotals.values()].reduce((sum, v) => sum + v, 0),
    by_category: [...categoryTotals.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
  };
}

// received / balance_remaining for the exact same pickup-date-filtered,
// non-cancelled item set "revenue" already uses — grand_total is that same
// revenue figure, not a third independent computation, so the three always
// reconcile exactly (received + balance_remaining === grand_total, by
// construction, never just by coincidence).
//
// The real complication: payments are recorded once per PARENT booking
// (one running balance per family transaction — see CLAUDE.md), never
// per line item, so there is no stored record of which payment paid for
// which item. Most bookings have every item on the same pickup_date (one
// family visit), where this doesn't matter — but it's a real, not
// theoretical, case: confirmed live against production that a booking can
// have items on genuinely different pickup dates (checked before writing
// this). For such a booking, "how much of what was paid belongs to just
// the in-range items" is unknowable from the data as stored, so it's
// allocated proportionally by each item's own share of the booking's
// total (non-cancelled) price — the only allocation that guarantees the
// sum across every touched booking still reconciles exactly against
// revenue, rather than either double-counting or dropping a fraction.
//
// Known limitation, called out rather than silently glossed over: if a
// booking has a cancelled item whose deposit was collected and
// deliberately kept (not refunded — a legitimate cancellation-fee case
// the refund-infrastructure flow allows), that payment is still sitting in
// the booking's total_paid with no way to attribute it specifically to
// the cancelled item, since payments carry no item-level reference at
// all. It will proportionally count toward this booking's OTHER, still-
// active items' "received" instead of being excluded — the closest this
// data model can get to "excluded entirely" without per-item payment
// tracking, which doesn't exist anywhere else in this app either.
// Exported so get_item_revenue (backend/src/tools/index.ts) can reuse this
// exact proration math against a single item's booking_items instead of a
// whole period's — the function itself is agnostic to what the passed-in
// rows have in common, so no new math is needed for that reuse.
export async function getRevenueBreakdown(periodItems: BookingItemRow[]) {
  const bookingIds = [...new Set(periodItems.map((b) => b.booking_id))];
  if (bookingIds.length === 0) return { grand_total: 0, received: 0, balance_remaining: 0 };

  const rangePriceByBooking = new Map<string, number>();
  for (const item of periodItems) {
    rangePriceByBooking.set(item.booking_id, (rangePriceByBooking.get(item.booking_id) ?? 0) + effectivePrice(item));
  }

  // Every non-cancelled item for each touched booking (not just the
  // in-range ones) — the denominator for proration, matching
  // booking_financials' own "status <> 'cancelled', FOC counts as ₹0"
  // price definition exactly so this never silently diverges from that
  // view.
  const { data: allItemsForTouchedBookings, error: allItemsError } = await supabase
    .from("booking_items")
    .select("booking_id, price_charged, is_foc")
    .in("booking_id", bookingIds)
    .neq("status", "cancelled");
  if (allItemsError) throw allItemsError;
  const totalPriceByBooking = new Map<string, number>();
  for (const row of allItemsForTouchedBookings ?? []) {
    totalPriceByBooking.set(row.booking_id, (totalPriceByBooking.get(row.booking_id) ?? 0) + effectivePrice(row));
  }

  const { data: financials, error: financialsError } = await supabase
    .from("booking_financials")
    .select("booking_id, total_paid")
    .in("booking_id", bookingIds);
  if (financialsError) throw financialsError;
  const paidByBooking = new Map((financials ?? []).map((f) => [f.booking_id, Number(f.total_paid)]));

  let grand_total = 0;
  let received = 0;
  for (const bookingId of bookingIds) {
    const pRange = rangePriceByBooking.get(bookingId) ?? 0;
    const pAll = totalPriceByBooking.get(bookingId) ?? 0;
    const paid = paidByBooking.get(bookingId) ?? 0;
    grand_total += pRange;
    received += pAll > 0 ? paid * (pRange / pAll) : 0;
  }
  grand_total = Math.round(grand_total * 100) / 100;
  received = Math.round(received * 100) / 100;
  // Derived, not independently rounded — guarantees the invariant holds
  // exactly instead of drifting by a paisa from rounding both sides.
  const balance_remaining = Math.round((grand_total - received) * 100) / 100;

  return { grand_total, received, balance_remaining };
}

// Revenue reuses summarizeBookingItems' total_revenue (same periodItems,
// same cancelled-excluded rule) rather than a second query — one function
// both reports.ts and get_financial_summary call, so they can never drift.
export async function getFinancialSummary(from: string, to: string) {
  const periodItems = await getPeriodBookingItems(from, to);
  const { total_bookings, rental_count, sale_count, total_revenue } = summarizeBookingItems(periodItems);
  const { expenses_total, by_category } = await getExpensesForPeriod(from, to);
  const { grand_total, received, balance_remaining } = await getRevenueBreakdown(periodItems);
  return {
    // Family-transaction and item-level counts — the same "Bookings This
    // Period" figures Reports' own stat-grid shows, previously computed by
    // summarizeBookingItems() here but discarded before reaching either
    // reports.ts's response or the AI assistant's get_financial_summary
    // tool. Additive fields, so nothing existing that reads this object
    // breaks.
    total_bookings,
    rental_count,
    sale_count,
    revenue: total_revenue,
    expenses: expenses_total,
    net: total_revenue - expenses_total,
    by_category,
    // grand_total === revenue always (same periodItems, same formula) —
    // exposed alongside it under the shop's own vocabulary (received/
    // balance remaining/grand total) rather than asking the AI tool's
    // caller to infer that mapping from "revenue" alone.
    grand_total,
    received,
    balance_remaining,
  };
}

export interface PaymentMethodTotal {
  method: string;
  amount: number;
  count: number;
}

// Genuine money received this period, split by how it came in (cash / UPI /
// card / bank transfer / other). Scoped by payment_date — when the money
// was actually collected — not pickup_date like summary/revenue above;
// "how much did we take in via UPI this month" is a collection-date
// question, not a booking-date one. Only real money in counts: type =
// 'payment' AND amount > 0 — this excludes refunds (money going back out)
// and the negative 'payment' rows a lost/damaged-item charge writes (see
// the return endpoint in bookings.ts), which are a balance adjustment on
// the books, not actual cash/UPI/etc. changing hands.
export async function getPaymentMethodBreakdown(from: string, to: string): Promise<{ total: number; by_method: PaymentMethodTotal[] }> {
  const { data, error } = await supabase
    .from("payments")
    .select("method, amount")
    .eq("type", "payment")
    .gt("amount", 0)
    .gte("payment_date", from)
    .lte("payment_date", to);
  if (error) throw error;

  const totals = new Map<string, { amount: number; count: number }>();
  for (const p of data ?? []) {
    const existing = totals.get(p.method);
    if (existing) {
      existing.amount += Number(p.amount);
      existing.count += 1;
    } else {
      totals.set(p.method, { amount: Number(p.amount), count: 1 });
    }
  }
  const by_method = [...totals.entries()]
    .map(([method, v]) => ({ method, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);
  const total = by_method.reduce((sum, m) => sum + m.amount, 0);
  return { total, by_method };
}

export interface RefundMethodTotal {
  method: string;
  amount: number;
  count: number;
}

// One real refund event, resolved back to the booking it belongs to — so
// an operator looking at "we refunded ₹600 via Bank Transfer" can actually
// find which customer/booking that was, not just the aggregate total.
// payments.booking_id is a real FK (unlike booking_financials/booking_
// status elsewhere in this app), so this is a genuine PostgREST embed, not
// a separate-queries-plus-merge.
export interface RefundDetail {
  id: string;
  booking_id: string;
  booking_code: string;
  customer_name: string;
  method: string;
  amount: number;
  payment_date: string;
  notes: string | null;
}

interface RefundPaymentRow {
  id: string;
  booking_id: string;
  amount: number;
  method: string;
  payment_date: string;
  notes: string | null;
  bookings: { booking_code: string; customers: { name: string } | null } | null;
}

// Genuine refunds only — money actually handed back to a customer (an item
// removed from a booking, or a whole booking cancelled), never a
// lost/damaged-item charge write-off. Both share payments.type = 'refund'
// but are structurally distinguishable by sign: a real refund is recorded
// with a NEGATIVE amount (it reduces total_paid, per booking_financials'
// sum(amount) formula — see the two refund insert sites in bookings.ts),
// while resolving a charge is deliberately POSITIVE (it nets the charge's
// own negative entry back out; see itemCharges.ts's own comment — no real
// money leaves the shop for that case, so it doesn't belong in a "refunds
// by method" view). Scoped by payment_date, same as
// getPaymentMethodBreakdown.
export async function getRefundMethodBreakdown(
  from: string,
  to: string,
): Promise<{ total: number; by_method: RefundMethodTotal[]; refunds: RefundDetail[] }> {
  const { data, error } = await supabase
    .from("payments")
    .select("id, booking_id, amount, method, payment_date, notes, bookings(booking_code, customers(name))")
    .eq("type", "refund")
    .lt("amount", 0)
    .gte("payment_date", from)
    .lte("payment_date", to)
    .order("payment_date", { ascending: false })
    .returns<RefundPaymentRow[]>();
  if (error) throw error;

  const refunds: RefundDetail[] = (data ?? []).map((p) => ({
    id: p.id,
    booking_id: p.booking_id,
    booking_code: p.bookings?.booking_code ?? "—",
    customer_name: p.bookings?.customers?.name ?? "—",
    method: p.method,
    amount: Math.abs(Number(p.amount)),
    payment_date: p.payment_date,
    notes: p.notes,
  }));

  const totals = new Map<string, { amount: number; count: number }>();
  for (const p of data ?? []) {
    const amt = Math.abs(Number(p.amount));
    const existing = totals.get(p.method);
    if (existing) {
      existing.amount += amt;
      existing.count += 1;
    } else {
      totals.set(p.method, { amount: amt, count: 1 });
    }
  }
  const by_method = [...totals.entries()]
    .map(([method, v]) => ({ method, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);
  const total = by_method.reduce((sum, m) => sum + m.amount, 0);
  return { total, by_method, refunds };
}

// Outstanding dues — a current-state snapshot, not scoped to any date
// range: every booking still owed money, regardless of when it was made.
// booking_financials has no real FK to bookings (it's a view), so
// batch-fetch bookings/customers and merge rather than embed.
export async function getOutstandingDues() {
  const { data: dueFinancials, error: dueFinancialsError } = await supabase
    .from("booking_financials")
    .select("booking_id, balance_due")
    .gt("balance_due", 0)
    .order("balance_due", { ascending: false });
  if (dueFinancialsError) throw dueFinancialsError;

  const dueBookingIds = (dueFinancials ?? []).map((d) => d.booking_id);
  const { data: dueBookings, error: dueBookingsError } = dueBookingIds.length
    ? await supabase.from("bookings").select("id, booking_code, customer_id").in("id", dueBookingIds)
    : { data: [], error: null };
  if (dueBookingsError) throw dueBookingsError;

  const dueBookingsById = new Map((dueBookings ?? []).map((b) => [b.id, b]));
  const dueCustomerIds = [...new Set((dueBookings ?? []).map((b) => b.customer_id))];
  const { data: dueCustomers, error: dueCustomersError } = dueCustomerIds.length
    ? await supabase.from("customers").select("id, name").in("id", dueCustomerIds)
    : { data: [], error: null };
  if (dueCustomersError) throw dueCustomersError;
  const dueCustomersById = new Map((dueCustomers ?? []).map((c) => [c.id, c]));

  return (dueFinancials ?? [])
    .map((d) => {
      const booking = dueBookingsById.get(d.booking_id);
      const customer = booking ? dueCustomersById.get(booking.customer_id) : undefined;
      return {
        booking_id: d.booking_id,
        booking_code: booking?.booking_code ?? "—",
        customer_id: booking?.customer_id ?? null,
        customer_name: customer?.name ?? "—",
        balance_due: Number(d.balance_due),
      };
    })
    // dueFinancials is already balance_due-desc from the query, but that
    // order isn't guaranteed to survive the map above, so re-sort explicitly.
    .sort((a, b) => b.balance_due - a.balance_due);
}
