import { Router } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase.js";
import type { AuthedRequest } from "../middleware/auth.js";

export const meRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// GET /api/me — the caller's own app profile (id, role, name, email,
// photo_url). Not used to gate anything yet — exists so role-based UI (e.g.
// admin-only reports) is a small change later rather than a rewrite.
meRouter.get("/", (req: AuthedRequest, res) => {
  res.json(req.user);
});

// PATCH /api/me — self-service profile edit, always scoped to req.user.id
// (from the verified auth token, never a body param) so there is no way to
// target another user's row through this endpoint at all — not just
// checked, structurally impossible. role is deliberately never accepted
// here; role changes stay admin-only and aren't part of this endpoint.
meRouter.patch("/", async (req: AuthedRequest, res) => {
  const { name, photo_url } = req.body ?? {};
  const patch: Record<string, string | null> = {};
  if (typeof name === "string" && name.trim()) patch.name = name.trim();
  // Explicitly null (not just omitted) clears the photo — e.g. the profile
  // panel's PhotoPicker "remove" button, which has no upload of its own to
  // trigger POST /photo.
  if (photo_url === null) patch.photo_url = null;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const { data, error } = await supabase.from("users").update(patch).eq("id", req.user!.id).select("id, role, name, email, photo_url").single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/me/photo — upload a profile photo to Storage and record it
// against the caller's own row in one step (unlike item photos, which are
// only attached to the item when the surrounding form itself saves — a
// standalone avatar control has no separate "Save" step to wait for).
// Same backend-does-the-upload pattern as POST /api/items/photos: service
// role key never leaves the backend, no Storage RLS policy needed.
meRouter.post("/photo", upload.single("photo"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No photo uploaded" });
  const ext = req.file.originalname.split(".").pop() || "jpg";
  const path = `${req.user!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, req.file.buffer, {
    contentType: req.file.mimetype,
  });
  if (uploadError) return res.status(500).json({ error: uploadError.message });
  const { data: publicUrlData } = supabase.storage.from("profile-photos").getPublicUrl(path);

  const { data, error } = await supabase
    .from("users")
    .update({ photo_url: publicUrlData.publicUrl })
    .eq("id", req.user!.id)
    .select("id, role, name, email, photo_url")
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
