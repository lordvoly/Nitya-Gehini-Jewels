import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istToday, istWeekStart } from "../lib/dates.js";
import { ACTIVE_STATUSES } from "./bookings.js";

export const dashboardRouter = Router();

// NOTE — Checkpoint (a) / preview-branch code: view names below are
// suffixed `_v2` until Stage 2 renames them — see PROJECT_PLAN_V2.md §8.

// GET /api/dashboard/summary — read-only status snapshot for the dashboard.
// Composes existing tables/views rather than reimplementing any of the
// booking/conflict/financial logic that already lives in bookings.ts — this
// route only reads and merges. Everything below is now item-grain
// (booking_items), since "due today" / "overdue" are inherently per-item
// concepts once a family booking can have several items on different
// schedules.
dashboardRouter.get("/summary", async (_req, res) => {
  // Today's returns due: return_date = today (IST), still active. Distinct
  // from upcoming_returns_v2 (return_date >= today) and overdue_rentals_v2
  // (return_date < today) — this is exactly "due today", regardless of
  // whether it was ever formally checked out.
  const { data: dueTodayRows, error: dueTodayError } = await supabase
    .from("booking_items")
    .select("*, bookings(booking_code, customer_id), items(item_code, name, tracking_type)")
    .eq("type", "rental")
    .in("status", ACTIVE_STATUSES)
    .eq("return_date", istToday())
    .order("id");
  if (dueTodayError) return res.status(500).json({ error: dueTodayError.message });

  const dueTodayCustomerIds = [...new Set((dueTodayRows ?? []).map((r) => (r as unknown as { bookings: { customer_id: string } }).bookings.customer_id))];
  const { data: dueTodayCustomers, error: dueTodayCustomersError } = dueTodayCustomerIds.length
    ? await supabase.from("customers").select("id, name, phone").in("id", dueTodayCustomerIds)
    : { data: [], error: null };
  if (dueTodayCustomersError) return res.status(500).json({ error: dueTodayCustomersError.message });
  const dueTodayCustomersById = new Map((dueTodayCustomers ?? []).map((c) => [c.id, c]));
  const due_today = (dueTodayRows ?? []).map((r) => {
    const row = r as unknown as { bookings: { booking_code: string; customer_id: string } };
    return { ...r, customers: dueTodayCustomersById.get(row.bookings.customer_id) ?? null };
  });

  // Overdue rentals, including the next_customer_waiting urgency flag —
  // overdue_rentals_v2 has no real FK for items/customers (it's a view), so
  // batch-fetch and merge by id, same two-queries-plus-merge pattern used
  // elsewhere.
  const { data: overdueRows, error: overdueError } = await supabase
    .from("overdue_rentals_v2")
    .select("*")
    .order("return_date");
  if (overdueError) return res.status(500).json({ error: overdueError.message });

  const itemIds = [...new Set((overdueRows ?? []).map((r) => r.item_id))];
  const customerIds = [...new Set((overdueRows ?? []).map((r) => r.customer_id))];
  const [{ data: overdueItems, error: overdueItemsError }, { data: overdueCustomers, error: overdueCustomersError }] =
    await Promise.all([
      itemIds.length
        ? supabase.from("items").select("id, item_code, name").in("id", itemIds)
        : Promise.resolve({ data: [], error: null }),
      customerIds.length
        ? supabase.from("customers").select("id, name, phone").in("id", customerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (overdueItemsError) return res.status(500).json({ error: overdueItemsError.message });
  if (overdueCustomersError) return res.status(500).json({ error: overdueCustomersError.message });

  const itemsById = new Map((overdueItems ?? []).map((i) => [i.id, i]));
  const customersById = new Map((overdueCustomers ?? []).map((c) => [c.id, c]));
  const overdue = (overdueRows ?? []).map((r) => ({
    ...r,
    items: itemsById.get(r.item_id) ?? null,
    customers: customersById.get(r.customer_id) ?? null,
  }));

  // Outstanding balance: sum of booking_financials_v2.balance_due over
  // bookings whose computed status is 'active' — preserves the exact old
  // semantics (booked/out-equivalent only, not completed/cancelled), just
  // re-derived through booking_status_v2 instead of a stored column.
  const { data: activeStatusRows, error: activeStatusError } = await supabase
    .from("booking_status_v2")
    .select("booking_id")
    .eq("computed_status", "active");
  if (activeStatusError) return res.status(500).json({ error: activeStatusError.message });
  const activeIds = (activeStatusRows ?? []).map((b) => b.booking_id);
  let outstanding_balance = 0;
  if (activeIds.length) {
    const { data: financials, error: financialsError } = await supabase
      .from("booking_financials_v2")
      .select("balance_due")
      .in("booking_id", activeIds);
    if (financialsError) return res.status(500).json({ error: financialsError.message });
    outstanding_balance = (financials ?? []).reduce((sum, f) => sum + Number(f.balance_due), 0);
  }

  const [
    { count: total_active_items, error: activeItemsError },
    { data: itemsOutRows, error: itemsOutError },
    { count: total_customers, error: customersError },
    { count: bookings_this_week, error: bookingsWeekError },
  ] = await Promise.all([
    supabase.from("items").select("*", { count: "exact", head: true }).neq("status", "sold"),
    // items_out — bundled fix (§8 decision 3): a unique item's status is
    // deliberately never flipped to 'rented_out' on rental creation, so
    // count(status='rented_out') has always silently read 0. Recomputed
    // here from booking_items directly instead.
    supabase.from("booking_items").select("item_id").eq("type", "rental").in("status", ACTIVE_STATUSES),
    supabase.from("customers").select("*", { count: "exact", head: true }),
    // bookings_this_week — no change needed: already queries the parent
    // bookings table directly by created_at, which is family-grain by
    // construction now that the old per-item columns are gone.
    supabase.from("bookings").select("*", { count: "exact", head: true }).gte("created_at", istWeekStart()),
  ]);
  if (activeItemsError) return res.status(500).json({ error: activeItemsError.message });
  if (itemsOutError) return res.status(500).json({ error: itemsOutError.message });
  if (customersError) return res.status(500).json({ error: customersError.message });
  if (bookingsWeekError) return res.status(500).json({ error: bookingsWeekError.message });
  const items_out = new Set((itemsOutRows ?? []).map((r) => r.item_id)).size;

  res.json({
    due_today,
    overdue,
    outstanding_balance,
    stats: {
      total_active_items: total_active_items ?? 0,
      items_out,
      total_customers: total_customers ?? 0,
      bookings_this_week: bookings_this_week ?? 0,
    },
  });
});
