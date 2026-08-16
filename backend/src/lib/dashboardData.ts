import { supabase } from "./supabase.js";
import { istToday, istWeekEnd } from "./dates.js";
import { ACTIVE_STATUSES } from "../routes/bookings.js";

// Shared by dashboard.ts (GET /api/dashboard/summary, which also adds the
// stats tiles on top of this) and the AI assistant's get_daily_briefing
// tool — the exact same due-today/overdue/outstanding-balance queries the
// Dashboard popups already use, not a second reimplementation.
export async function getDailyBriefingData() {
  // Today's returns due: return_date = today (IST), still active. Distinct
  // from upcoming_returns (return_date >= today) and overdue_rentals
  // (return_date < today) — this is exactly "due today", regardless of
  // whether it was ever formally checked out.
  const { data: dueTodayRows, error: dueTodayError } = await supabase
    .from("booking_items")
    .select("*, bookings(booking_code, customer_id), items(item_code, name, tracking_type)")
    .eq("type", "rental")
    .in("status", ACTIVE_STATUSES)
    .eq("return_date", istToday())
    .order("id");
  if (dueTodayError) throw dueTodayError;

  const dueTodayCustomerIds = [...new Set((dueTodayRows ?? []).map((r) => (r as unknown as { bookings: { customer_id: string } }).bookings.customer_id))];
  const { data: dueTodayCustomers, error: dueTodayCustomersError } = dueTodayCustomerIds.length
    ? await supabase.from("customers").select("id, name, phone").in("id", dueTodayCustomerIds)
    : { data: [], error: null };
  if (dueTodayCustomersError) throw dueTodayCustomersError;
  const dueTodayCustomersById = new Map((dueTodayCustomers ?? []).map((c) => [c.id, c]));
  const due_today = (dueTodayRows ?? []).map((r) => {
    const row = r as unknown as { bookings: { booking_code: string; customer_id: string } };
    return { ...r, customers: dueTodayCustomersById.get(row.bookings.customer_id) ?? null };
  });

  // Overdue rentals, including the next_customer_waiting urgency flag —
  // overdue_rentals has no real FK for items/customers (it's a view), so
  // batch-fetch and merge by id, same two-queries-plus-merge pattern used
  // elsewhere.
  const { data: overdueRows, error: overdueError } = await supabase.from("overdue_rentals").select("*").order("return_date");
  if (overdueError) throw overdueError;

  const itemIds = [...new Set((overdueRows ?? []).map((r) => r.item_id))];
  const customerIds = [...new Set((overdueRows ?? []).map((r) => r.customer_id))];
  const [{ data: overdueItems, error: overdueItemsError }, { data: overdueCustomers, error: overdueCustomersError }] = await Promise.all([
    itemIds.length ? supabase.from("items").select("id, item_code, name").in("id", itemIds) : Promise.resolve({ data: [], error: null }),
    customerIds.length ? supabase.from("customers").select("id, name, phone").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (overdueItemsError) throw overdueItemsError;
  if (overdueCustomersError) throw overdueCustomersError;

  const itemsById = new Map((overdueItems ?? []).map((i) => [i.id, i]));
  const customersById = new Map((overdueCustomers ?? []).map((c) => [c.id, c]));
  const overdue = (overdueRows ?? []).map((r) => ({
    ...r,
    items: itemsById.get(r.item_id) ?? null,
    customers: customersById.get(r.customer_id) ?? null,
  }));

  // Outstanding balance: sum of booking_financials.balance_due over
  // bookings whose computed status is 'active' — preserves the exact old
  // semantics (booked/out-equivalent only, not completed/cancelled), just
  // re-derived through booking_status instead of a stored column.
  const { data: activeStatusRows, error: activeStatusError } = await supabase
    .from("booking_status")
    .select("booking_id")
    .eq("computed_status", "active");
  if (activeStatusError) throw activeStatusError;
  const activeIds = (activeStatusRows ?? []).map((b) => b.booking_id);
  let outstanding_balance = 0;
  let outstanding_balance_count = 0;
  if (activeIds.length) {
    const { data: financials, error: financialsError } = await supabase.from("booking_financials").select("balance_due").in("booking_id", activeIds);
    if (financialsError) throw financialsError;
    // Filtered to strictly positive balances — a booking sitting at exactly
    // 0 (the common case) or, in a rare overpaid-and-not-yet-refunded edge
    // case, negative, isn't "owed" and shouldn't count as a due booking.
    const dueFinancials = (financials ?? []).filter((f) => Number(f.balance_due) > 0);
    outstanding_balance = dueFinancials.reduce((sum, f) => sum + Number(f.balance_due), 0);
    outstanding_balance_count = dueFinancials.length;
  }

  return {
    today: istToday(),
    due_today,
    overdue,
    outstanding_balance,
    outstanding_balance_count,
  };
}

// Deliberately separate from getDailyBriefingData() above rather than
// folded into it — that function's shape is shared with the AI assistant's
// get_daily_briefing tool, and this is a new, distinct concern ("what to
// prep for" vs. "what's due back") with no reason to touch that existing
// contract. Only status='booked' — an item already 'out' has already been
// picked up and needs no further prep; a cancelled one was never really
// due. No type filter: applies to both rental and sale line items, since a
// sale customer collecting their purchase still needs it prepped and
// ready, same as a rental customer. Deliberately excludes the overdue/
// unconfirmed concept (pickup_date in the past, still 'booked') — that's a
// different, already-flagged idea for later, not folded in here.
export async function getUpcomingPickupsData() {
  const today = istToday();
  const weekEnd = istWeekEnd();

  const PICKUP_SELECT = "*, bookings(booking_code, customer_id), items(item_code, name, item_type, tracking_type, components, photos)";

  const [{ data: todayRows, error: todayError }, { data: weekRows, error: weekError }] = await Promise.all([
    supabase.from("booking_items").select(PICKUP_SELECT).eq("status", "booked").eq("pickup_date", today).order("id"),
    // Strictly AFTER today through the end of this calendar week — today's
    // own pickups are already covered by pickups_due_today above and must
    // not also appear here.
    supabase
      .from("booking_items")
      .select(PICKUP_SELECT)
      .eq("status", "booked")
      .gt("pickup_date", today)
      .lte("pickup_date", weekEnd)
      .order("pickup_date")
      .order("id"),
  ]);
  if (todayError) throw todayError;
  if (weekError) throw weekError;

  const allRows = [...(todayRows ?? []), ...(weekRows ?? [])];
  const customerIds = [
    ...new Set(allRows.map((r) => (r as unknown as { bookings: { customer_id: string } }).bookings.customer_id)),
  ];
  const { data: customers, error: customersError } = customerIds.length
    ? await supabase.from("customers").select("id, name, phone").in("id", customerIds)
    : { data: [], error: null };
  if (customersError) throw customersError;
  const customersById = new Map((customers ?? []).map((c) => [c.id, c]));

  function attachCustomer(r: Record<string, unknown>) {
    const row = r as unknown as { bookings: { customer_id: string } | null };
    return { ...r, customers: row.bookings ? (customersById.get(row.bookings.customer_id) ?? null) : null };
  }

  return {
    pickups_due_today: (todayRows ?? []).map(attachCustomer),
    pickups_due_this_week: (weekRows ?? []).map(attachCustomer),
  };
}
