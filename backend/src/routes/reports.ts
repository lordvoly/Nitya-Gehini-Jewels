import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istMonthRange } from "../lib/dates.js";
import {
  getPeriodBookingItems,
  summarizeBookingItems,
  rankMostBookedItems,
  getIdleInventory,
  getFinancialSummary,
  getOutstandingDues,
  effectivePrice,
} from "../lib/reportsData.js";

export const reportsRouter = Router();

// GET /api/reports?from=&to=&include_collabs=true|false
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
    const defaultRange = istMonthRange();
    const from = typeof req.query.from === "string" && req.query.from ? req.query.from : defaultRange.from;
    const to = typeof req.query.to === "string" && req.query.to ? req.query.to : defaultRange.to;
    const includeCollabs = req.query.include_collabs === "true";

    // Bookings this period + most-booked items — both scoped to [from, to] by
    // pickup_date (when the item actually goes out / the sale happens, not
    // when the booking record was created).
    const periodItems = await getPeriodBookingItems(from, to);
    const summary = summarizeBookingItems(periodItems);
    const most_booked_items = rankMostBookedItems(periodItems, includeCollabs);

    // Repeat customers — all-time, never scoped to the date range. Not
    // shared via reportsData.ts since nothing else (route or tool) needs
    // this specific aggregation yet.
    const { data: allItems, error: allError } = await supabase
      .from("booking_items")
      .select("id, booking_id, type, price_charged, is_foc, item_id, items(item_code, name), bookings(customer_id, customers(name, phone, customer_type))")
      .neq("status", "cancelled")
      .returns<
        {
          id: string;
          booking_id: string;
          type: "rental" | "sale";
          price_charged: number;
          is_foc: boolean;
          item_id: string;
          items: { item_code: string; name: string } | null;
          bookings: { customer_id: string; customers: { name: string; phone: string; customer_type: "regular" | "influencer" | "mua" } | null } | null;
        }[]
      >();
    if (allError) throw allError;

    const isRegular = (b: (typeof allItems)[number]) => (b.bookings?.customers?.customer_type ?? "regular") === "regular";
    const repeatRows = includeCollabs ? allItems : allItems.filter(isRegular);
    const customerAgg = new Map<
      string,
      { customer_id: string; name: string; phone: string; bookingIds: Set<string>; total_spend: number }
    >();
    for (const b of repeatRows) {
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
    const repeat_customers = [...customerAgg.values()]
      .map((c) => ({ customer_id: c.customer_id, name: c.name, phone: c.phone, booking_count: c.bookingIds.size, total_spend: c.total_spend }))
      .filter((c) => c.booking_count > 1)
      .sort((a, b) => b.booking_count - a.booking_count);

    const idle_inventory = await getIdleInventory();
    const pnl = await getFinancialSummary(from, to);
    const outstanding_dues = await getOutstandingDues();

    res.json({
      period: { from, to },
      include_collabs: includeCollabs,
      summary,
      most_booked_items,
      repeat_customers,
      idle_inventory,
      pnl,
      outstanding_dues,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});
