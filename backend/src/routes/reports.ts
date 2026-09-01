import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istReportsRangeForPreset } from "../lib/dates.js";
import {
  getPeriodBookingItems,
  summarizeBookingItems,
  rankMostBookedItems,
  getAllBookingItems,
  rankRepeatCustomers,
  getIdleInventory,
  getFinancialSummary,
  getOutstandingDues,
  getRevenueTrend,
  getPaymentMethodBreakdown,
  getRefundMethodBreakdown,
} from "../lib/reportsData.js";

export const reportsRouter = Router();

// GET /api/reports?from=&to=&range=&include_collabs=true|false
//
// `range` (week/month/3months/6months/year/lifetime) is the quick-select
// path — resolved server-side via istReportsRangeForPreset so the
// frontend never computes "today" or a relative window itself, same IST
// rule as everywhere else in this app. Explicit from+to (the calendar
// pickers) always win over `range` when both are present, so switching a
// date field back to a custom value can't be silently overridden by a
// stale range param. Omitting all three falls back to the past month
// (istReportsRangeForPreset("") below), replacing the old "this calendar
// month" default.
//
// A cancelled item never actually happened, so it's excluded from every
// figure here (revenue, counts, "idle" activity) — same spirit as
// ACTIVE_STATUSES in bookings.ts, applied to reporting. Retirement
// (items.is_active) never touches historical figures — a retired item's
// past bookings still count fully in revenue and most-booked; only idle
// inventory looks at is_active.
//
// Grain (§8 decision C): total_bookings/repeat_customers.booking_count are
// DISTINCT family transactions (count(distinct booking_id)); most_booked_items
// and rental_count/sale_count stay item-grain (row counts over booking_items)
// — that's inherently what they measure, independent of how many other items
// rode along in the same family transaction.
//
// Most of the actual computation here now lives in ../lib/reportsData.ts,
// shared with the AI assistant's tools (backend/src/tools/index.ts) so both
// surfaces are backed by the exact same queries, never a second
// reimplementation that could quietly drift from this one.
reportsRouter.get("/", async (req, res) => {
  try {
    const explicitFrom = typeof req.query.from === "string" && req.query.from ? req.query.from : null;
    const explicitTo = typeof req.query.to === "string" && req.query.to ? req.query.to : null;
    const resolved =
      explicitFrom && explicitTo
        ? { from: explicitFrom, to: explicitTo }
        : istReportsRangeForPreset(typeof req.query.range === "string" ? req.query.range : "");
    const { from, to } = resolved;
    const includeCollabs = req.query.include_collabs === "true";

    // Bookings this period + most-booked items — both scoped to [from, to] by
    // pickup_date (when the item actually goes out / the sale happens, not
    // when the booking record was created).
    const periodItems = await getPeriodBookingItems(from, to);
    const summary = summarizeBookingItems(periodItems);
    const most_booked_items = rankMostBookedItems(periodItems, includeCollabs);
    // Bucket granularity (day/week/month/year) is auto-picked from the
    // resolved [from, to] span — see getRevenueTrend. Always includes
    // collabs (same as summary/pnl above) — this is a revenue trend, not
    // a most-booked-style ranking, so the collab toggle doesn't apply.
    const revenue_trend = getRevenueTrend(periodItems, from, to);

    // Repeat customers — all-time, never scoped to the date range. Now
    // shared with the AI assistant's get_repeat_customers tool via
    // reportsData.ts, same reasoning as every other extraction in this file.
    const allItems = await getAllBookingItems();
    const repeat_customers = rankRepeatCustomers(allItems, includeCollabs);

    const idle_inventory = await getIdleInventory();
    const pnl = await getFinancialSummary(from, to);
    const outstanding_dues = await getOutstandingDues();
    const payment_methods = await getPaymentMethodBreakdown(from, to);
    const refund_methods = await getRefundMethodBreakdown(from, to);

    res.json({
      period: { from, to },
      include_collabs: includeCollabs,
      summary,
      most_booked_items,
      revenue_trend,
      repeat_customers,
      idle_inventory,
      pnl,
      outstanding_dues,
      payment_methods,
      refund_methods,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});
