import { Router } from "express";
import rateLimit from "express-rate-limit";
import { supabase } from "../lib/supabase.js";

export const publicReceiptRouter = Router();

// The one route in this app reachable with zero auth — no requireAuth
// anywhere in this file, and mounted in index.ts without it. Every other
// route is at least gated by a valid Supabase session before rate limiting
// would ever matter; this one isn't, so it gets its own dedicated limiter.
// 192 bits of token entropy makes brute-forcing the real threat model here
// impractical regardless — this is plain volume/DoS hygiene, not the
// primary defense.
const publicReceiptLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/public/receipt/:token — keyed by bookings.share_token (see
// 20260823010000_booking_share_token.sql), never by booking.id or the
// visible booking_code, so this can't be reached by editing the URL of
// any other page in the app. Returns a narrow, explicitly whitelisted
// subset of booking data — never the full row — so nothing beyond what's
// already printed on the staff-facing receipt (ReceiptPage.tsx) is
// exposed: no notes, no payment/audit history, no phone numbers, and an
// FOC item's price_charged (the untouched "what it would have cost"
// reference value — see BookingItem's own doc comment) is nulled out
// rather than forwarded to a link that could end up anywhere.
publicReceiptRouter.get("/receipt/:token", publicReceiptLimiter, async (req, res) => {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      `id, booking_code, booking_date,
       customers(name),
       booking_items(type, pickup_date, return_date, status, price_charged, is_foc,
                      deposit_amount, deposit_collected, deposit_refunded, deposit_refund_date,
                      custom_addons, quantity_booked, cancellation_reason,
                      items(item_code, name, item_type, components))`,
    )
    .eq("share_token", req.params.token)
    .maybeSingle();
  if (error) return res.status(500).json({ error: "Failed to load receipt" });
  if (!booking) return res.status(404).json({ error: "Receipt not found" });

  const [{ data: shop }, { data: financials }] = await Promise.all([
    supabase.from("shop_settings").select("name, address, phone").maybeSingle(),
    supabase.from("booking_financials").select("total_paid, balance_due, price_charged").eq("booking_id", booking.id).maybeSingle(),
  ]);

  const customer = Array.isArray(booking.customers) ? booking.customers[0] : booking.customers;

  res.json({
    shop: { name: shop?.name ?? "", address: shop?.address ?? null, phone: shop?.phone ?? null },
    booking_code: booking.booking_code,
    // The operator-editable "date the booking was actually made" — not
    // created_at, an untouched system timestamp that was never what this
    // field was meant to show (see ReceiptPage.tsx's matching fix).
    booking_date: booking.booking_date,
    customer_name: customer?.name ?? null,
    items: (booking.booking_items ?? []).map((bi) => {
      const item = Array.isArray(bi.items) ? bi.items[0] : bi.items;
      return {
        item_code: item?.item_code ?? null,
        name: item?.name ?? null,
        type: bi.type,
        pickup_date: bi.pickup_date,
        return_date: bi.return_date,
        status: bi.status,
        price_charged: bi.is_foc ? null : bi.price_charged,
        is_foc: bi.is_foc,
        quantity_booked: bi.quantity_booked,
        // The set's own reusable template — items.components — same field
        // BookingForm itself shows read-only at booking time.
        components: item?.item_type === "set" ? (item?.components ?? []) : [],
        custom_addons: bi.custom_addons ?? [],
        // Only ever set at cancellation time (see bookings.ts's cancel
        // endpoints), so this is naturally null for anything not cancelled
        // — no extra status check needed to keep it out of an active item's
        // response.
        cancellation_reason: bi.cancellation_reason ?? null,
        deposit: bi.deposit_collected
          ? { amount: bi.deposit_amount, refunded: bi.deposit_refunded, refund_date: bi.deposit_refund_date }
          : null,
      };
    }),
    total_paid: financials?.total_paid ?? 0,
    balance_due: financials?.balance_due ?? 0,
    price_charged: financials?.price_charged ?? 0,
  });
});
