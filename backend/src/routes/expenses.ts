import { Router } from "express";
import { supabase } from "../lib/supabase.js";

export const expensesRouter = Router();

// GET /api/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD — for P&L by period (Phase 2)
expensesRouter.get("/", async (req, res) => {
  let query = supabase.from("expenses").select("*").order("date", { ascending: false });
  if (typeof req.query.from === "string") query = query.gte("date", req.query.from);
  if (typeof req.query.to === "string") query = query.lte("date", req.query.to);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

expensesRouter.post("/", async (req, res) => {
  const { data, error } = await supabase.from("expenses").insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
