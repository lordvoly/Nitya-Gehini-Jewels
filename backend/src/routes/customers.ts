import { Router } from "express";
import { supabase } from "../lib/supabase.js";

export const customersRouter = Router();

// GET /api/customers?phone=... — used for the phone-dedupe check on create
customersRouter.get("/", async (req, res) => {
  let query = supabase.from("customers").select("*").order("name");
  if (typeof req.query.phone === "string") {
    query = query.eq("phone", req.query.phone);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

customersRouter.get("/:id", async (req, res) => {
  const { data, error } = await supabase.from("customers").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

customersRouter.post("/", async (req, res) => {
  const { data, error } = await supabase.from("customers").insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
