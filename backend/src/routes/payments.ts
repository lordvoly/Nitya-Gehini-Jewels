import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istToday } from "../lib/dates.js";
import type { AuthedRequest } from "../middleware/auth.js";

export const paymentsRouter = Router();

// GET /api/payments?booking_id=...
paymentsRouter.get("/", async (req, res) => {
  let query = supabase.from("payments").select("*").order("payment_date", { ascending: false });
  if (typeof req.query.booking_id === "string") query = query.eq("booking_id", req.query.booking_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/payments — record a (possibly partial) payment against a
// booking. Used both directly (the "Record Payment" action on Booking
// Detail) and internally by POST /api/bookings for an advance received at
// booking time. payment_date defaults to today in IST when omitted, the
// same left-blank-on-purpose pattern as actual_return_date on
// POST /api/bookings/:id/return.
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
      payment_date: payment_date || istToday(),
      notes: notes?.trim() || null,
      recorded_by: req.user?.id ?? null,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
