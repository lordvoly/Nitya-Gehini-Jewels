import { Router } from "express";
import { supabase } from "../lib/supabase.js";

export const paymentsRouter = Router();

// GET /api/payments?booking_id=...
paymentsRouter.get("/", async (req, res) => {
  let query = supabase.from("payments").select("*").order("payment_date", { ascending: false });
  if (typeof req.query.booking_id === "string") query = query.eq("booking_id", req.query.booking_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/payments — record a (possibly partial) payment against a booking
paymentsRouter.post("/", async (req, res) => {
  const { data, error } = await supabase.from("payments").insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
