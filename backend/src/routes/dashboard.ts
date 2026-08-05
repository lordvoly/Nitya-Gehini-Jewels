import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istToday, istWeekStart } from "../lib/dates.js";
import { ACTIVE_STATUSES } from "./bookings.js";

export const dashboardRouter = Router();

// GET /api/dashboard/summary — read-only status snapshot for the dashboard.
// Composes existing tables/views (overdue_rentals, booking_financials)
// rather than reimplementing any of the booking/conflict/financial logic
// that already lives in bookings.ts — this route only reads and merges.
dashboardRouter.get("/summary", async (_req, res) => {
  // Today's returns due: return_date = today (IST), still active. Distinct
  // from the upcoming_returns view (status='out' only, return_date >= today)
  // and from overdue_rentals (return_date < today) — this is exactly "due
  // today", regardless of whether it was ever formally checked out.
  const { data: dueToday, error: dueTodayError } = await supabase
    .from("bookings")
    .select("*, items(item_code, name, tracking_type), customers(name, phone)")
    .eq("type", "rental")
    .in("status", ACTIVE_STATUSES)
    .eq("return_date", istToday())
    .order("booking_code");
  if (dueTodayError) return res.status(500).json({ error: dueTodayError.message });

  // Overdue rentals, including the next_customer_waiting urgency flag —
  // overdue_rentals has no real FK for items/customers (it's a view), so
  // batch-fetch and merge by id, the same two-queries-plus-merge pattern
  // used elsewhere (customers search, GET /api/bookings financials).
  const { data: overdueRows, error: overdueError } = await supabase
    .from("overdue_rentals")
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

  // Outstanding balance across active (booked/out) bookings — sum of
  // booking_financials.balance_due, never recomputed here from price_charged.
  const { data: activeBookings, error: activeError } = await supabase
    .from("bookings")
    .select("id")
    .in("status", ACTIVE_STATUSES);
  if (activeError) return res.status(500).json({ error: activeError.message });
  const activeIds = (activeBookings ?? []).map((b) => b.id);
  let outstanding_balance = 0;
  if (activeIds.length) {
    const { data: financials, error: financialsError } = await supabase
      .from("booking_financials")
      .select("balance_due")
      .in("booking_id", activeIds);
    if (financialsError) return res.status(500).json({ error: financialsError.message });
    outstanding_balance = (financials ?? []).reduce((sum, f) => sum + Number(f.balance_due), 0);
  }

  const [
    { count: total_active_items, error: activeItemsError },
    { count: items_out, error: itemsOutError },
    { count: total_customers, error: customersError },
    { count: bookings_this_week, error: bookingsWeekError },
  ] = await Promise.all([
    supabase.from("items").select("*", { count: "exact", head: true }).neq("status", "sold"),
    supabase.from("items").select("*", { count: "exact", head: true }).eq("status", "rented_out"),
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase.from("bookings").select("*", { count: "exact", head: true }).gte("created_at", istWeekStart()),
  ]);
  if (activeItemsError) return res.status(500).json({ error: activeItemsError.message });
  if (itemsOutError) return res.status(500).json({ error: itemsOutError.message });
  if (customersError) return res.status(500).json({ error: customersError.message });
  if (bookingsWeekError) return res.status(500).json({ error: bookingsWeekError.message });

  res.json({
    due_today: dueToday,
    overdue,
    outstanding_balance,
    stats: {
      total_active_items: total_active_items ?? 0,
      items_out: items_out ?? 0,
      total_customers: total_customers ?? 0,
      bookings_this_week: bookings_this_week ?? 0,
    },
  });
});
