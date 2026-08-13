import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istToday } from "../lib/dates.js";
import type { AuthedRequest } from "../middleware/auth.js";

export const itemChargesRouter = Router();

// booking_item_id is a real FK (unlike the booking_financials/booking_status
// views elsewhere in this app), and so are booking_items' own FKs to items
// and bookings — so unlike those views, this is a genuine nested PostgREST
// embed in one request, not a separate-queries-plus-merge.
const CHARGE_EMBED = `*, booking_items(
  pickup_date,
  items(item_code, name),
  bookings(id, booking_code, customers(name))
)`;

// Shared by GET / below and the AI assistant's get_outstanding_charges tool
// — the exact same query either way, not a second reimplementation.
export async function getItemCharges(resolved: boolean) {
  const { data, error } = await supabase.from("item_charges").select(CHARGE_EMBED).eq("resolved", resolved).order("charged_at", { ascending: false });
  if (error) throw error;
  return data;
}

// GET /api/item-charges?resolved=false — the universal outstanding-charges
// view: every lost/damaged charge across every booking, not scoped to one
// booking. Defaults to resolved=false (the "still outstanding" set this
// view exists for) when the query param is omitted entirely; pass
// ?resolved=true explicitly to see the resolved history instead.
itemChargesRouter.get("/", async (req, res) => {
  const resolvedParam = typeof req.query.resolved === "string" ? req.query.resolved === "true" : false;
  try {
    res.json(await getItemCharges(resolvedParam));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// POST /api/item-charges/:id/resolve — settle an outstanding charge.
// Always writes a linked payments row (type='refund', POSITIVE amount —
// see the sign-convention note atop the refund-infrastructure migration:
// this is the one refund case that increases total_paid, since it's
// netting back out the charge's own negative payments row rather than
// representing real money leaving the shop) before flipping
// resolved/resolved_at, so refund_payment_id is never left dangling.
itemChargesRouter.post("/:id/resolve", async (req: AuthedRequest, res) => {
  const { data: charge, error: fetchError } = await supabase
    .from("item_charges")
    .select("*, booking_items(booking_id)")
    .eq("id", req.params.id)
    .single();
  if (fetchError || !charge) return res.status(404).json({ error: "Charge not found" });
  if (charge.resolved) return res.status(409).json({ error: "This charge is already resolved" });

  const refundAmount = Number(req.body?.refund_amount);
  if (!(refundAmount > 0)) {
    return res.status(400).json({ error: "refund_amount must be greater than 0" });
  }

  const bookingId = (charge.booking_items as { booking_id: string } | null)?.booking_id;
  if (!bookingId) return res.status(500).json({ error: "Charge is missing its parent booking" });

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      booking_id: bookingId,
      amount: refundAmount,
      method: "other",
      type: "refund",
      payment_date: istToday(),
      notes: `Resolved charge: ${charge.description}`,
      recorded_by: req.user?.id ?? null,
    })
    .select()
    .single();
  if (paymentError) return res.status(400).json({ error: paymentError.message });

  const { data, error } = await supabase
    .from("item_charges")
    .update({
      resolved: true,
      resolved_at: istToday(),
      refund_amount: refundAmount,
      refund_payment_id: payment.id,
    })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  res.status(200).json(data);
});
