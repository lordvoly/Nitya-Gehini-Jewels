import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istMonthRange, istDaysAgo } from "../lib/dates.js";

export const reportsRouter = Router();

interface BookingRow {
  id: string;
  type: "rental" | "sale";
  price_charged: number;
  item_id: string;
  customer_id: string;
  items: { item_code: string; name: string } | null;
  customers: { name: string; phone: string; customer_type: "regular" | "influencer" | "mua" } | null;
}

const isRegular = (b: BookingRow) => (b.customers?.customer_type ?? "regular") === "regular";

// GET /api/reports?from=&to=&include_collabs=true|false
//
// A cancelled booking never actually happened, so it's excluded from every
// figure here (revenue, counts, "idle" activity) — the same spirit as
// ACTIVE_STATUSES in bookings.ts, just applied to reporting rather than
// conflict checks. Retirement (items.is_active) never touches historical
// figures — a retired item's past bookings still count fully in revenue and
// most-booked; only idle inventory looks at is_active, since a retired item
// obviously can't be "idle inventory" worth reactivating.
reportsRouter.get("/", async (req, res) => {
  const defaultRange = istMonthRange();
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : defaultRange.from;
  const to = typeof req.query.to === "string" && req.query.to ? req.query.to : defaultRange.to;
  const includeCollabs = req.query.include_collabs === "true";

  // Bookings this period + most-booked items — both scoped to [from, to]
  // by pickup_date (when the item actually goes out / the sale happens,
  // not when the booking record was created).
  const { data: periodBookings, error: periodError } = await supabase
    .from("bookings")
    .select("id, type, price_charged, item_id, customer_id, items(item_code, name), customers(name, phone, customer_type)")
    .neq("status", "cancelled")
    .gte("pickup_date", from)
    .lte("pickup_date", to)
    .returns<BookingRow[]>();
  if (periodError) return res.status(500).json({ error: periodError.message });

  const summary = {
    total_bookings: periodBookings.length,
    rental_count: periodBookings.filter((b) => b.type === "rental").length,
    sale_count: periodBookings.filter((b) => b.type === "sale").length,
    total_revenue: periodBookings.reduce((sum, b) => sum + Number(b.price_charged), 0),
  };

  const rankingRows = includeCollabs ? periodBookings : periodBookings.filter(isRegular);
  const itemCounts = new Map<string, { item_id: string; item_code: string; name: string; booking_count: number }>();
  for (const b of rankingRows) {
    if (!b.items) continue;
    const existing = itemCounts.get(b.item_id);
    if (existing) existing.booking_count += 1;
    else itemCounts.set(b.item_id, { item_id: b.item_id, item_code: b.items.item_code, name: b.items.name, booking_count: 1 });
  }
  const most_booked_items = [...itemCounts.values()].sort((a, b) => b.booking_count - a.booking_count);

  // Repeat customers — all-time, never scoped to the date range.
  const { data: allBookings, error: allError } = await supabase
    .from("bookings")
    .select("id, type, price_charged, item_id, customer_id, items(item_code, name), customers(name, phone, customer_type)")
    .neq("status", "cancelled")
    .returns<BookingRow[]>();
  if (allError) return res.status(500).json({ error: allError.message });

  const repeatRows = includeCollabs ? allBookings : allBookings.filter(isRegular);
  const customerAgg = new Map<
    string,
    { customer_id: string; name: string; phone: string; booking_count: number; total_spend: number }
  >();
  for (const b of repeatRows) {
    if (!b.customers) continue;
    const existing = customerAgg.get(b.customer_id);
    if (existing) {
      existing.booking_count += 1;
      existing.total_spend += Number(b.price_charged);
    } else {
      customerAgg.set(b.customer_id, {
        customer_id: b.customer_id,
        name: b.customers.name,
        phone: b.customers.phone,
        booking_count: 1,
        total_spend: Number(b.price_charged),
      });
    }
  }
  const repeat_customers = [...customerAgg.values()]
    .filter((c) => c.booking_count > 1)
    .sort((a, b) => b.booking_count - a.booking_count);

  // Idle inventory — active items with no real booking in the last 90 days
  // (fixed window from today, independent of the report's own date range).
  // Always ALL bookings regardless of customer_type — any real usage, collab
  // or not, counts as "not idle."
  const cutoff = istDaysAgo(90);
  const { data: activeItems, error: itemsError } = await supabase
    .from("items")
    .select("id, item_code, name, category")
    .eq("is_active", true);
  if (itemsError) return res.status(500).json({ error: itemsError.message });

  const { data: recentBookings, error: recentError } = await supabase
    .from("bookings")
    .select("item_id")
    .neq("status", "cancelled")
    .gte("pickup_date", cutoff);
  if (recentError) return res.status(500).json({ error: recentError.message });

  const recentlyBookedIds = new Set((recentBookings ?? []).map((b) => b.item_id));
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
