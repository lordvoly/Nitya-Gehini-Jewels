import { Router } from "express";
import { supabase } from "../lib/supabase.js";

export const itemsRouter = Router();

// GET /api/items — list, optionally filtered by category/status via query params
itemsRouter.get("/", async (req, res) => {
  const { data, error } = await supabase.from("items").select("*").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/items/:id
itemsRouter.get("/:id", async (req, res) => {
  const { data, error } = await supabase.from("items").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// POST /api/items — create (item intake flow)
itemsRouter.post("/", async (req, res) => {
  const { data, error } = await supabase.from("items").insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/items/:id — update editable fields only (never status/quantity
// derived from bookings — those change via the bookings routes)
itemsRouter.patch("/:id", async (req, res) => {
  const { data, error } = await supabase.from("items").update(req.body).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
