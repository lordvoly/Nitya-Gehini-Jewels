import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istToday } from "../lib/dates.js";
import type { AuthedRequest } from "../middleware/auth.js";

export const paymentsRouter = Router();

// Shared by GET / below and the AI assistant's get_booking_by_code tool —
// the exact same filtered query either way.
export async function getPaymentsForBooking(bookingId: string) {
  const { data, error } = await supabase.from("payments").select("*").eq("booking_id", bookingId).order("payment_date", { ascending: false });
  if (error) throw error;
  return data;
}

// GET /api/payments?booking_id=...
paymentsRouter.get("/", async (req, res) => {
  try {
    if (typeof req.query.booking_id === "string") {
      return res.json(await getPaymentsForBooking(req.query.booking_id));
    }
    const { data, error } = await supabase.from("payments").select("*").order("payment_date", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// POST /api/payments — record a (possibly partial) payment against a
// booking. Used both directly (the "Record Payment" action on Booking
// Detail) and internally by POST /api/bookings for an advance received at
// booking time. payment_date defaults to today in IST when omitted, the
// same left-blank-on-purpose pattern as actual_return_date on
// POST /api/bookings/:id/return.
//
// Always type='payment', always amount > 0 here — this is the one route a
// human fills in directly, and a manual entry should never be negative or
// a refund. The negative-amount/refund-type rows the lost-and-found and
// cancel-with-refund flows create are inserted directly by bookings.ts /
// itemCharges.ts via the service-role client, deliberately bypassing this
// route and its positivity check (same "internal insert, not an internal
// call to this route" pattern already used for the advance-at-booking-
// creation flow).
paymentsRouter.post("/", async (req: AuthedRequest, res) => {
  const { booking_id, amount, method, payment_date, notes } = req.body ?? {};
  if (!booking_id || amount == null || !method) {
    return res.status(400).json({ error: "booking_id, amount, and method are required" });
  }
  if (amount <= 0) {
    return res.status(400).json({ error: "amount must be greater than 0" });
  }
  const { data, error } = await supabase
    .from("payments")
    .insert({
      booking_id,
      amount,
      method,
      type: "payment",
      payment_date: payment_date || istToday(),
      notes: notes?.trim() || null,
      recorded_by: req.user?.id ?? null,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
