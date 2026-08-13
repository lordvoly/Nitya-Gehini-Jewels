import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireRole, type AuthedRequest } from "../middleware/auth.js";

export const shopSettingsRouter = Router();

// GET /api/shop-settings — any authenticated user, not just admin: receipts
// need to read this regardless of who's printing one.
shopSettingsRouter.get("/", async (_req, res) => {
  const { data, error } = await supabase.from("shop_settings").select("*").single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/shop-settings — admin only. Single row (id = true), so this
// always updates that one row rather than taking an :id param.
shopSettingsRouter.patch("/", requireRole("admin"), async (req: AuthedRequest, res) => {
  const { name, address, phone } = req.body ?? {};
  const patch: Record<string, string> = {};
  if (typeof name === "string") patch.name = name.trim();
  if (typeof address === "string") patch.address = address.trim();
  if (typeof phone === "string") patch.phone = phone.trim();

  const { data, error } = await supabase.from("shop_settings").update(patch).eq("id", true).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
