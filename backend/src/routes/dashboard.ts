import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istWeekStart } from "../lib/dates.js";
import { ACTIVE_STATUSES } from "./bookings.js";
import { getDailyBriefingData } from "../lib/dashboardData.js";

export const dashboardRouter = Router();

// GET /api/dashboard/summary — read-only status snapshot for the dashboard.
// Composes existing tables/views rather than reimplementing any of the
// booking/conflict/financial logic that already lives in bookings.ts — this
// route only reads and merges. Everything below is now item-grain
// (booking_items), since "due today" / "overdue" are inherently per-item
// concepts once a family booking can have several items on different
// schedules.
//
// The due-today/overdue/outstanding-balance piece now lives in
// ../lib/dashboardData.ts, shared with the AI assistant's get_daily_briefing
// tool so both surfaces read the exact same queries.
dashboardRouter.get("/summary", async (_req, res) => {
  try {
    const briefing = await getDailyBriefingData();

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
    if (activeItemsError) throw activeItemsError;
    if (itemsOutError) throw itemsOutError;
    if (customersError) throw customersError;
    if (bookingsWeekError) throw bookingsWeekError;
    const items_out = new Set((itemsOutRows ?? []).map((r) => r.item_id)).size;

    res.json({
      // Server IST date, echoed back so the frontend never has to compute
      // "today" itself (see CLAUDE.md) — used only to key the once-per-day
      // dashboard-popup dismissal, not for any business logic.
      today: briefing.today,
      due_today: briefing.due_today,
      overdue: briefing.overdue,
      outstanding_balance: briefing.outstanding_balance,
      outstanding_balance_count: briefing.outstanding_balance_count,
      stats: {
        total_active_items: total_active_items ?? 0,
        items_out,
        total_customers: total_customers ?? 0,
        bookings_this_week: bookings_this_week ?? 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});
