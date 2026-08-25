import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { searchCustomers, getCustomerHistory } from "../lib/customersData.js";

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

// GET /api/customers?search=...&customer_type=... — search matches name
// (substring, case-insensitive) OR phone OR phone_secondary (substring
// match against digits-only, so callers can search with or without
// spaces/dashes/+91), via the shared searchCustomers()
// (backend/src/lib/customersData.ts) — also reused by the AI assistant's
// get_customer_history tool, so a name resolves to the same customer(s)
// everywhere in the app. phone_secondary is search-only here — it never
// participates in duplicate detection (see POST/PATCH below).
//
// customer_type composes as an AND with search, same pattern as bookings.ts's
// ?category=/?type= filters: fetch whichever result set search/no-search
// needs, then a plain JS .filter() over it — still fully server-side, just
// not expressed as a second SQL WHERE clause, consistent with how every
// other list filter in this app works.
customersRouter.get("/", async (req, res) => {
  const term = typeof req.query.search === "string" ? req.query.search.trim() : "";

  let result: Record<string, unknown>[];
  if (!term) {
    const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    result = data ?? [];
  } else {
    try {
      result = await searchCustomers(term);
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "Search failed" });
    }
  }

  const customerType = typeof req.query.customer_type === "string" ? req.query.customer_type : "";
  if (CUSTOMER_TYPES.includes(customerType as CustomerType)) {
    result = result.filter((c) => c.customer_type === customerType);
  }

  res.json(result);
});

// GET /api/customers/:id/revenue — this customer's all-time "Total
// Business" figure for CustomerDetail. Reuses getCustomerHistory (already
// backing the AI assistant's get_customer_history tool) rather than a new
// query — each booking's price_charged there already comes from
// booking_financials, which itself excludes cancelled items and zeroes out
// FOC ones (see 20260818000000_foc_items.sql), so a fully-cancelled
// booking already contributes ₹0 with no extra filtering needed here.
// This is total agreed value across every booking, not total_paid (cash
// actually collected so far) — a customer with an open balance still
// counts their full booking value here, same "earned" vs "received"
// distinction items.ts's own revenue route draws.
// Registered above GET /:id, same "specific route before general"
// convention used throughout this file and items.ts.
customersRouter.get("/:id/revenue", async (req, res) => {
  try {
    const history = await getCustomerHistory(req.params.id);
    const total_business = history.reduce((sum, b) => sum + b.price_charged, 0);
    res.json({ total_business, booking_count: history.length });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to compute customer revenue" });
  }
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
  const { name, phone, phone_secondary, email, address, notes, customer_type, date_of_birth, date_of_wedding } = req.body ?? {};
  if (!name?.trim() || !phone?.trim() || !address?.trim()) {
    return res.status(400).json({ error: "Name, phone, and address are required" });
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return res.status(400).json({ error: "Phone number is invalid" });
  }
  // Plain contact info, not a second identifier — unlike the primary phone,
  // an unparseable/empty value here just means "none given", not a 400.
  const normalizedPhoneSecondary = phone_secondary?.trim() ? normalizePhone(phone_secondary) || null : null;
  const type: CustomerType = CUSTOMER_TYPES.includes(customer_type) ? customer_type : "regular";

  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: name.trim(),
      phone: normalizedPhone,
      phone_secondary: normalizedPhoneSecondary,
      email: email?.trim() || null,
      address: address.trim(),
      notes: notes?.trim() || null,
      customer_type: type,
      // Plain optional reference dates, never collected before this
      // feature — same trim-or-null treatment as email, no format/range
      // validation beyond what the <input type="date"> already guarantees.
      date_of_birth: date_of_birth?.trim() || null,
      date_of_wedding: date_of_wedding?.trim() || null,
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
  const { name, phone, phone_secondary, email, address, notes, customer_type, date_of_birth, date_of_wedding } = req.body ?? {};
  if (!name?.trim() || !phone?.trim() || !address?.trim()) {
    return res.status(400).json({ error: "Name, phone, and address are required" });
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return res.status(400).json({ error: "Phone number is invalid" });
  }
  const normalizedPhoneSecondary = phone_secondary?.trim() ? normalizePhone(phone_secondary) || null : null;
  const type: CustomerType = CUSTOMER_TYPES.includes(customer_type) ? customer_type : "regular";

  const { data, error } = await supabase
    .from("customers")
    .update({
      name: name.trim(),
      phone: normalizedPhone,
      phone_secondary: normalizedPhoneSecondary,
      email: email?.trim() || null,
      address: address.trim(),
      notes: notes?.trim() || null,
      customer_type: type,
      date_of_birth: date_of_birth?.trim() || null,
      date_of_wedding: date_of_wedding?.trim() || null,
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
