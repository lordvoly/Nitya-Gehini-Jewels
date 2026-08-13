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
  item_id: string;
  items: { item_code: string; name: string } | null;
  bookings: { customer_id: string; customers: { name: string; phone: string; customer_type: "regular" | "influencer" | "mua" } | null } | null;
}

const isRegular = (b: BookingItemRow) => (b.bookings?.customers?.customer_type ?? "regular") === "regular";

// A cancelled item never actually happened, so it's excluded here — same
// rule applied consistently across every figure derived from this query.
export async function getPeriodBookingItems(from: string, to: string): Promise<BookingItemRow[]> {
  const { data, error } = await supabase
    .from("booking_items")
    .select("id, booking_id, type, price_charged, item_id, items(item_code, name), bookings(customer_id, customers(name, phone, customer_type))")
    .neq("status", "cancelled")
    .gte("pickup_date", from)
    .lte("pickup_date", to)
    .returns<BookingItemRow[]>();
  if (error) throw error;
  return data;
}

export function summarizeBookingItems(periodItems: BookingItemRow[]) {
  return {
    total_bookings: new Set(periodItems.map((b) => b.booking_id)).size,
    rental_count: periodItems.filter((b) => b.type === "rental").length,
    sale_count: periodItems.filter((b) => b.type === "sale").length,
    total_revenue: periodItems.reduce((sum, b) => sum + Number(b.price_charged), 0),
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

// Revenue reuses summarizeBookingItems' total_revenue (same periodItems,
// same cancelled-excluded rule) rather than a second query — one function
// both reports.ts and get_financial_summary call, so they can never drift.
export async function getFinancialSummary(from: string, to: string) {
  const periodItems = await getPeriodBookingItems(from, to);
  const { total_revenue } = summarizeBookingItems(periodItems);
  const { expenses_total, by_category } = await getExpensesForPeriod(from, to);
  return {
    revenue: total_revenue,
    expenses: expenses_total,
    net: total_revenue - expenses_total,
    by_category,
  };
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
        customer_name: customer?.name ?? "—",
        balance_due: Number(d.balance_due),
      };
    })
    // dueFinancials is already balance_due-desc from the query, but that
    // order isn't guaranteed to survive the map above, so re-sort explicitly.
    .sort((a, b) => b.balance_due - a.balance_due);
}
