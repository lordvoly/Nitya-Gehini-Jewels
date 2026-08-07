import { Router } from "express";
import { supabase } from "../lib/supabase.js";

export const customersRouter = Router();

const CUSTOMER_TYPES = ["regular", "influencer", "mua"] as const;
type CustomerType = (typeof CUSTOMER_TYPES)[number];

// Strips everything but digits, then keeps only the last 10 — so a leading
// country code (+91, 0091, a bare 91) doesn't make the same real number look
// like a different one. Indian mobile numbers are 10 digits; shorter/partial
// search terms are returned unchanged since slice(-10) is a no-op under 10
// chars, so this doesn't affect partial-phone search.
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

// GET /api/customers?search=... — matches name (substring, case-insensitive)
// OR phone (substring match against digits-only, so callers can search with
// or without spaces/dashes/+91). Two separate queries + merge, rather than a
// single .or() filter, so a search term containing a comma or parenthesis
// can't break PostgREST's filter syntax.
customersRouter.get("/", async (req, res) => {
  const term = typeof req.query.search === "string" ? req.query.search.trim() : "";

  if (!term) {
    const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  const digits = normalizePhone(term);
  const [byName, byPhone] = await Promise.all([
    supabase.from("customers").select("*").ilike("name", `%${term}%`),
    digits ? supabase.from("customers").select("*").ilike("phone", `%${digits}%`) : Promise.resolve({ data: [], error: null }),
  ]);
  if (byName.error) return res.status(500).json({ error: byName.error.message });
  if (byPhone.error) return res.status(500).json({ error: byPhone.error.message });

  const merged = new Map<string, (typeof byName.data)[number]>();
  for (const c of [...(byName.data ?? []), ...(byPhone.data ?? [])]) merged.set(c.id, c);
  const results = Array.from(merged.values()).sort((a, b) => (b.created_at as string).localeCompare(a.created_at));
  res.json(results);
});

customersRouter.get("/:id", async (req, res) => {
  const { data, error } = await supabase.from("customers").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// POST /api/customers — create, with atomic phone dedupe: if the (normalized)
// phone already exists, return 409 with the existing record instead of
// silently creating a duplicate or just erroring. Doing this as an
// insert-then-catch (rather than a separate pre-check GET) avoids a race
// between the check and the create.
customersRouter.post("/", async (req, res) => {
  const { name, phone, email, address, notes, customer_type } = req.body ?? {};
  if (!name?.trim() || !phone?.trim() || !address?.trim()) {
    return res.status(400).json({ error: "Name, phone, and address are required" });
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return res.status(400).json({ error: "Phone number is invalid" });
  }
  const type: CustomerType = CUSTOMER_TYPES.includes(customer_type) ? customer_type : "regular";

  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: name.trim(),
      phone: normalizedPhone,
      email: email?.trim() || null,
      address: address.trim(),
      notes: notes?.trim() || null,
      customer_type: type,
    })
    .select()
    .single();

  if (!error) return res.status(201).json(data);

  if (error.code === "23505") {
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", normalizedPhone)
      .single();
    return res.status(409).json({
      error: "A customer with this phone number already exists",
      existingCustomer,
    });
  }
  res.status(400).json({ error: error.message });
});

// PATCH /api/customers/:id — edit. The only way today to fix a customer's
// customer_type after the fact (e.g. an influencer/MUA that was added as
// "regular" before that distinction existed, or just tagged wrong) — there
// was no edit screen at all until this. Same phone-dedupe-on-conflict
// handling as create; updating a customer to their own unchanged phone
// naturally never collides since it's the same row.
customersRouter.patch("/:id", async (req, res) => {
  const { name, phone, email, address, notes, customer_type } = req.body ?? {};
  if (!name?.trim() || !phone?.trim() || !address?.trim()) {
    return res.status(400).json({ error: "Name, phone, and address are required" });
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return res.status(400).json({ error: "Phone number is invalid" });
  }
  const type: CustomerType = CUSTOMER_TYPES.includes(customer_type) ? customer_type : "regular";

  const { data, error } = await supabase
    .from("customers")
    .update({
      name: name.trim(),
      phone: normalizedPhone,
      email: email?.trim() || null,
      address: address.trim(),
      notes: notes?.trim() || null,
      customer_type: type,
    })
    .eq("id", req.params.id)
    .select()
    .single();

  if (!error) return res.json(data);

  if (error.code === "23505") {
    return res.status(409).json({ error: "A customer with this phone number already exists" });
  }
  res.status(400).json({ error: error.message });
});

// DELETE /api/customers/:id — customers with booking history are protected
// by the bookings->customers foreign key (no ON DELETE CASCADE), same as
// items; surfaces that as a clear message instead of a raw constraint error.
customersRouter.delete("/:id", async (req, res) => {
  const { error } = await supabase.from("customers").delete().eq("id", req.params.id);
  if (error) {
    if (error.code === "23503") {
      return res.status(409).json({ error: "This customer has booking history and can't be deleted." });
    }
    return res.status(400).json({ error: error.message });
  }
  res.status(200).json({ ok: true });
});
