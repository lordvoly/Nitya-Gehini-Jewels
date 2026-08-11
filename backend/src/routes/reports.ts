import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istMonthRange, istDaysAgo } from "../lib/dates.js";

export const reportsRouter = Router();

// NOTE — Checkpoint (a) / preview-branch code: no views are read here, but
// see PROJECT_PLAN_V2.md §8 for the same _v2-until-cutover note that
// applies to dashboard.ts/bookings.ts.

interface BookingItemRow {
  id: string;
  booking_id: string;
  type: "rental" | "sale";
  price_charged: number;
  item_id: string;
  items: { item_code: string; name: string } | null;
  bookings: { customer_id: string; customers: { name: string; phone: string; customer_type: "regular" | "influencer" | "mua" } | null } | null;
}

const isRegular = (b: BookingItemRow) => (b.bookings?.customers?.customer_type ?? "regular") === "regular";

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
reportsRouter.get("/", async (req, res) => {
  const defaultRange = istMonthRange();
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : defaultRange.from;
  const to = typeof req.query.to === "string" && req.query.to ? req.query.to : defaultRange.to;
  const includeCollabs = req.query.include_collabs === "true";

  // Bookings this period + most-booked items — both scoped to [from, to] by
  // pickup_date (when the item actually goes out / the sale happens, not
  // when the booking record was created).
  const { data: periodItems, error: periodError } = await supabase
    .from("booking_items")
    .select("id, booking_id, type, price_charged, item_id, items(item_code, name), bookings(customer_id, customers(name, phone, customer_type))")
    .neq("status", "cancelled")
    .gte("pickup_date", from)
    .lte("pickup_date", to)
    .returns<BookingItemRow[]>();
  if (periodError) return res.status(500).json({ error: periodError.message });

  const summary = {
    total_bookings: new Set(periodItems.map((b) => b.booking_id)).size,
    rental_count: periodItems.filter((b) => b.type === "rental").length,
    sale_count: periodItems.filter((b) => b.type === "sale").length,
    total_revenue: periodItems.reduce((sum, b) => sum + Number(b.price_charged), 0),
  };

  const rankingRows = includeCollabs ? periodItems : periodItems.filter(isRegular);
  const itemCounts = new Map<string, { item_id: string; item_code: string; name: string; booking_count: number }>();
  for (const b of rankingRows) {
    if (!b.items) continue;
    const existing = itemCounts.get(b.item_id);
    if (existing) existing.booking_count += 1;
    else itemCounts.set(b.item_id, { item_id: b.item_id, item_code: b.items.item_code, name: b.items.name, booking_count: 1 });
  }
  const most_booked_items = [...itemCounts.values()].sort((a, b) => b.booking_count - a.booking_count);

  // Repeat customers — all-time, never scoped to the date range.
  const { data: allItems, error: allError } = await supabase
    .from("booking_items")
    .select("id, booking_id, type, price_charged, item_id, items(item_code, name), bookings(customer_id, customers(name, phone, customer_type))")
    .neq("status", "cancelled")
    .returns<BookingItemRow[]>();
  if (allError) return res.status(500).json({ error: allError.message });

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
      existing.total_spend += Number(b.price_charged);
    } else {
      customerAgg.set(customerId, {
        customer_id: customerId,
        name: customer.name,
        phone: customer.phone,
        bookingIds: new Set([b.booking_id]),
        total_spend: Number(b.price_charged),
      });
    }
  }
  const repeat_customers = [...customerAgg.values()]
    .map((c) => ({ customer_id: c.customer_id, name: c.name, phone: c.phone, booking_count: c.bookingIds.size, total_spend: c.total_spend }))
    .filter((c) => c.booking_count > 1)
    .sort((a, b) => b.booking_count - a.booking_count);

  // Idle inventory — active items with no real booking in the last 90 days
  // (fixed window from today, independent of the report's own date range).
  // Always ALL bookings regardless of customer_type — any real usage,
  // collab or not, counts as "not idle."
  const cutoff = istDaysAgo(90);
  const { data: activeItems, error: itemsError } = await supabase
    .from("items")
    .select("id, item_code, name, category")
    .eq("is_active", true);
  if (itemsError) return res.status(500).json({ error: itemsError.message });

  const { data: recentBookingItems, error: recentError } = await supabase
    .from("booking_items")
    .select("item_id")
    .neq("status", "cancelled")
    .gte("pickup_date", cutoff);
  if (recentError) return res.status(500).json({ error: recentError.message });

  const recentlyBookedIds = new Set((recentBookingItems ?? []).map((b) => b.item_id));
  const idle_inventory = (activeItems ?? []).filter((i) => !recentlyBookedIds.has(i.id));

  res.json({
    period: { from, to },
    include_collabs: includeCollabs,
    summary,
    most_booked_items,
    repeat_customers,
    idle_inventory,
  });
});
