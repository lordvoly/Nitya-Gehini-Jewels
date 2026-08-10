import { Router } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase.js";

export const itemsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// GET /api/items — list, most recently added first. ?active_only=true
// restricts to is_active items — used by the booking item-picker, which
// must never offer a retired item. The general items management list
// calls this with no filter: retired items stay visible there (just
// visually marked) so they can be found and reactivated.
itemsRouter.get("/", async (req, res) => {
  let query = supabase.from("items").select("*").order("created_at", { ascending: false });
  if (req.query.active_only === "true") query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/items/next-code — the suggested next auto-generated code, to
// pre-fill the (editable) item_code field in the add-item wizard. Read-only
// preview, reserves nothing — POST / still retries on a real collision if
// the suggestion goes stale before submit. Registered before GET /:id so
// "next-code" isn't swallowed as an :id value.
itemsRouter.get("/next-code", async (_req, res) => {
  try {
    res.json({ item_code: await nextItemCode() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to compute next item code" });
  }
});

// GET /api/items/:id
itemsRouter.get("/:id", async (req, res) => {
  const { data, error } = await supabase.from("items").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// POST /api/items/photos — upload a single item photo to Storage, return its
// public URL. Goes through the backend (service role) rather than direct
// frontend-to-Supabase upload, so no Storage RLS policy is needed and the
// service role key never has to leave the backend.
itemsRouter.post("/photos", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No photo uploaded" });
  const ext = req.file.originalname.split(".").pop() || "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("item-photos").upload(path, req.file.buffer, {
    contentType: req.file.mimetype,
  });
  if (error) return res.status(500).json({ error: error.message });
  const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
  res.status(201).json({ url: data.publicUrl });
});

// Highest existing NGJ-XXXX code, not "whatever the most-recently-created
// item's code happens to be" — the latter broke as soon as a custom,
// non-numeric item_code could exist and be more recent than the last
// auto-generated one, since parsing its suffix as a number silently fell
// back to 0 and re-suggested an already-taken low code every time (spun
// through all 3 retries and failed). Filtering to the NGJ-% pattern first
// means custom codes can't perturb this at all. Lexical ordering matches
// numeric ordering here only because every generated code is zero-padded
// to the same width.
async function nextItemCode(): Promise<string> {
  const { data, error } = await supabase
    .from("items")
    .select("item_code")
    .ilike("item_code", "NGJ-%")
    .order("item_code", { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.item_code as string | undefined;
  const lastNum = last ? parseInt(last.slice(last.lastIndexOf("-") + 1), 10) || 0 : 0;
  return `NGJ-${String(lastNum + 1).padStart(4, "0")}`;
}

// POST /api/items — create (item intake flow). item_code defaults to
// server-generated (fast entry, retries on a rare unique-code collision
// from a concurrent insert) but the wizard pre-fills that suggestion into
// an editable field — if the operator sends their own non-empty item_code
// (whether left as the suggestion or typed over), that exact value is used
// and validated for uniqueness instead, since at that point it's an
// explicit choice, not something to silently swap out from under them.
itemsRouter.post("/", async (req, res) => {
  const { item_code: requestedCode, ...body } = req.body;
  const customCode = typeof requestedCode === "string" ? requestedCode.trim() : "";

  if (customCode) {
    const { data, error } = await supabase.from("items").insert({ ...body, item_code: customCode }).select().single();
    if (!error) return res.status(201).json(data);
    if (error.code === "23505") {
      return res.status(409).json({ error: "This item code is already in use — choose a different one." });
    }
    return res.status(400).json({ error: error.message });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const item_code = await nextItemCode();
    const { data, error } = await supabase
      .from("items")
      .insert({ ...body, item_code })
      .select()
      .single();
    if (!error) return res.status(201).json(data);
    if (error.code !== "23505") return res.status(400).json({ error: error.message });
  }
  res.status(500).json({ error: "Could not generate a unique item code, please retry" });
});

// PATCH /api/items/:id — update editable fields only (never status/quantity
// derived from bookings — those change via the bookings routes). item_code
// is editable here too, same as the create-time override: validated for
// uniqueness on save, friendly 409 on collision rather than a raw
// constraint error, since at edit time it's always an explicit choice
// (there's no "leave blank to auto-generate" fallback once an item exists).
itemsRouter.patch("/:id", async (req, res) => {
  const { data, error } = await supabase.from("items").update(req.body).eq("id", req.params.id).select().single();
  if (!error) return res.json(data);
  if (error.code === "23505") {
    return res.status(409).json({ error: "This item code is already in use — choose a different one." });
  }
  res.status(400).json({ error: error.message });
});

// DELETE /api/items/:id — items with booking history are protected by the
// items->bookings foreign key (no ON DELETE CASCADE), so this surfaces that
// as a clear message instead of a raw constraint error.
itemsRouter.delete("/:id", async (req, res) => {
  const { error } = await supabase.from("items").delete().eq("id", req.params.id);
  if (error) {
    if (error.code === "23503") {
      return res.status(409).json({ error: "This item has booking history and can't be deleted." });
    }
    return res.status(400).json({ error: error.message });
  }
  res.status(200).json({ ok: true });
});

// POST /api/items/:id/retire — hide from new bookings (the booking
// item-picker filters is_active=true) while keeping the item and its
// booking history exactly as-is. Not restricted to items blocked from
// deletion — retirement is a valid state for any item.
itemsRouter.post("/:id/retire", async (req, res) => {
  const { data, error } = await supabase
    .from("items")
    .update({ is_active: false })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/items/:id/reactivate
itemsRouter.post("/:id/reactivate", async (req, res) => {
  const { data, error } = await supabase
    .from("items")
    .update({ is_active: true })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
