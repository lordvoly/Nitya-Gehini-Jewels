import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istWeekStart } from "../lib/dates.js";
import { getDailyBriefingData, getUpcomingPickupsData, getUpcomingOccasionsData } from "../lib/dashboardData.js";
import { getItemAvailability } from "../lib/itemsData.js";

export const dashboardRouter = Router();

// bookings_this_week must exclude cancelled bookings, same as every other
// figure in the app (Reports, P&L, booking_financials) — a booking's
// cancelled-ness is booking_status.computed_status ('cancelled' when every
// one of its booking_items is itself cancelled), not a column on bookings
// itself, and booking_status is a view with no real FK to join through —
// same two-queries-plus-merge pattern used everywhere else for it.
async function getBookingsThisWeekCount(): Promise<number> {
  const { data: weekBookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id")
    .gte("created_at", istWeekStart());
  if (bookingsError) throw bookingsError;
  const ids = (weekBookings ?? []).map((b) => b.id);
  if (ids.length === 0) return 0;

  const { data: statuses, error: statusError } = await supabase
    .from("booking_status")
    .select("booking_id, computed_status")
    .in("booking_id", ids);
  if (statusError) throw statusError;
  const cancelledIds = new Set(
    (statuses ?? []).filter((s) => s.computed_status === "cancelled").map((s) => s.booking_id)
  );
  return ids.filter((id) => !cancelledIds.has(id)).length;
}

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
    const [briefing, pickups, occasions] = await Promise.all([
      getDailyBriefingData(),
      getUpcomingPickupsData(),
      getUpcomingOccasionsData(),
    ]);

    const [
      { count: items_in_catalog, error: catalogItemsError },
      { count: items_retired, error: retiredItemsError },
      availability,
      { count: total_customers, error: customersError },
      bookings_this_week,
    ] = await Promise.all([
      // Real bug fixed here: this used to be `neq("status", "sold")` with
      // no is_active filter at all, so retiring an item never moved it out
      // of this count. is_active is the actual "retired or not" signal —
      // status is a separate axis (available/sold/etc) — so both are
      // checked: is_active=true (not retired) and status != 'sold' (a sold
      // unique item isn't meaningfully "in catalog" anymore either, even
      // though it's never been retired).
      supabase.from("items").select("*", { count: "exact", head: true }).eq("is_active", true).neq("status", "sold"),
      supabase.from("items").select("*", { count: "exact", head: true }).eq("is_active", false),
      getItemAvailability(),
      supabase.from("customers").select("*", { count: "exact", head: true }),
      getBookingsThisWeekCount(),
    ]);
    if (catalogItemsError) throw catalogItemsError;
    if (retiredItemsError) throw retiredItemsError;
    if (customersError) throw customersError;
    // "Out" here still means the Dashboard's original, broader sense —
    // physically out of the shop right now, whether or not pickup was
    // explicitly confirmed — so this stat's meaning doesn't silently shrink
    // now that currentlyOut has narrowed to mean confirmed-only (Confirm
    // Pickup). pickupOverdue (booked, pickup_date passed, never confirmed)
    // still counts as "out" for this purpose; it just also gets its own
    // distinct badge/category elsewhere so it can be found and confirmed.
    //
    // items_needs_confirmation is reported separately (not folded silently
    // into items_out) so the frontend can show a breakdown — a real user
    // report confirmed this ambiguity: the combined number didn't match
    // what "out" visibly meant to them (no item showed an "Out" pill),
    // because the whole count came from an unconfirmed-pickup item that
    // only shows the separate "Pickup Overdue — Not Confirmed" pill. Same
    // subnote pattern as items_retired alongside items_in_catalog.
    const items_out = availability.currentlyOut.size + availability.pickupOverdue.size;
    const items_needs_confirmation = availability.pickupOverdue.size;

    res.json({
      // Server IST date, echoed back so the frontend never has to compute
      // "today" itself (see CLAUDE.md) — used only to key the once-per-day
      // dashboard-popup dismissal, not for any business logic.
      today: briefing.today,
      due_today: briefing.due_today,
      overdue: briefing.overdue,
      pickups_due_today: pickups.pickups_due_today,
      pickups_due_this_week: pickups.pickups_due_this_week,
      occasions_today: occasions.occasions_today,
      occasions_this_week: occasions.occasions_this_week,
      outstanding_balance: briefing.outstanding_balance,
      outstanding_balance_count: briefing.outstanding_balance_count,
      stats: {
        // Renamed from total_active_items — "active" was already the exact
        // word used for an individual item's own status pill, and that
        // collision is what let this stat's real bug (no is_active filter)
        // go unnoticed.
        items_in_catalog: items_in_catalog ?? 0,
        items_retired: items_retired ?? 0,
        items_out,
        items_needs_confirmation,
        total_customers: total_customers ?? 0,
        bookings_this_week,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});
