import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istToday } from "../lib/dates.js";

export const bookingsRouter = Router();

// GET /api/bookings?status=&item_id=&customer_id=
bookingsRouter.get("/", async (req, res) => {
  let query = supabase.from("bookings").select("*, booking_financials(*)").order("pickup_date", { ascending: false });
  if (typeof req.query.status === "string") query = query.eq("status", req.query.status);
  if (typeof req.query.item_id === "string") query = query.eq("item_id", req.query.item_id);
  if (typeof req.query.customer_id === "string") query = query.eq("customer_id", req.query.customer_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

bookingsRouter.get("/overdue", async (_req, res) => {
  const { data, error } = await supabase.from("overdue_rentals").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

bookingsRouter.get("/upcoming-returns", async (_req, res) => {
  const { data, error } = await supabase.from("upcoming_returns").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/bookings — create a rental or sale.
// TODO(Phase 1): conflict detection — for `unique` items, reject if an
// overlapping `booked`/`out` booking exists for the same item_id and date
// range; for `quantity` items, reject if quantity_booked exceeds
// (quantity_on_hand - sum of already-booked quantity in the overlapping range).
// price_charged must be taken from the request body (a snapshot), never
// re-read from items.rental_price/sale_price after creation.
bookingsRouter.post("/", async (req, res) => {
  const { data, error } = await supabase.from("bookings").insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// POST /api/bookings/:id/return — returns processing.
// TODO(Phase 1): populate return_checklist from the item's `components`,
// require every component confirmed before allowing status -> 'returned',
// set actual_return_date to istToday() unless explicitly overridden.
bookingsRouter.post("/:id/return", async (req, res) => {
  const { return_checklist, return_notes } = req.body;
  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "returned",
      actual_return_date: istToday(),
      return_checklist,
      return_notes,
    })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
