import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istToday } from "../lib/dates.js";
import type { AuthedRequest } from "../middleware/auth.js";

export const bookingsRouter = Router();

// "Still consuming inventory" — excludes returned/completed/cancelled.
export const ACTIVE_STATUSES = ["booked", "out"];

// GET /api/bookings?status=&item_id=&customer_id=
//
// booking_financials is a computed VIEW (bookings joined with a payments
// sum), not a table with a real foreign key to bookings, so PostgREST can't
// embed it via relationship syntax the way items/customers below are —
// that was tried in the original scaffold and just 500'd. total_paid/
// balance_due are fetched with a second query and merged by booking_id
// instead, the same two-queries-plus-merge pattern the customers search
// already uses. Never store these on the booking row itself — they must
// stay computed at read time.
bookingsRouter.get("/", async (req, res) => {
  let query = supabase
    .from("bookings")
    .select("*, items(item_code, name, item_type, components, tracking_type), customers(name, phone)")
    .order("pickup_date", { ascending: false });
  if (typeof req.query.status === "string") query = query.eq("status", req.query.status);
  if (typeof req.query.item_id === "string") query = query.eq("item_id", req.query.item_id);
  if (typeof req.query.customer_id === "string") query = query.eq("customer_id", req.query.customer_id);
  const { data: bookings, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const ids = (bookings ?? []).map((b) => b.id);
  if (ids.length === 0) return res.json(bookings);

  const { data: financials, error: financialsError } = await supabase
    .from("booking_financials")
    .select("booking_id, total_paid, balance_due")
    .in("booking_id", ids);
  if (financialsError) return res.status(500).json({ error: financialsError.message });

  const financialsByBookingId = new Map((financials ?? []).map((f) => [f.booking_id, f]));
  res.json(
    bookings.map((b) => ({
      ...b,
      total_paid: financialsByBookingId.get(b.id)?.total_paid ?? 0,
      balance_due: financialsByBookingId.get(b.id)?.balance_due ?? b.price_charged,
    })),
  );
});

bookingsRouter.get("/overdue", async (_req, res) => {
  const { data, error } = await supabase.from("overdue_rentals").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

bookingsRouter.get("/upcoming-returns", async (_req, res) => {
  const { data, error } = await supabase.from("upcoming_returns").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/bookings/:id — single booking detail, including the "When
// Returns" chain (next/previous booking for the same item) from the
// booking_sequence view. Registered after the literal /overdue and
// /upcoming-returns routes above so Express's registration-order matching
// doesn't let :id swallow those paths first.
bookingsRouter.get("/:id", async (req, res) => {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*, items(item_code, name, item_type, tracking_type), customers(name, phone)")
    .eq("id", req.params.id)
    .single();
  if (error || !booking) return res.status(404).json({ error: "Booking not found" });

  // maybeSingle, not single: a cancelled booking has no row in
  // booking_sequence at all (excluded from the sequence by design), so a
  // missing row here is an expected, non-error case.
  const { data: sequence, error: sequenceError } = await supabase
    .from("booking_sequence")
    .select("*")
    .eq("booking_id", req.params.id)
    .maybeSingle();
  if (sequenceError) return res.status(500).json({ error: sequenceError.message });

  res.json({
    ...booking,
    next_booking: sequence?.next_booking_id
      ? {
          id: sequence.next_booking_id,
          booking_code: sequence.next_booking_code,
          customer_name: sequence.next_customer_name,
          pickup_date: sequence.next_pickup_date,
        }
      : null,
    previous_booking: sequence?.prev_booking_id
      ? {
          id: sequence.prev_booking_id,
          booking_code: sequence.prev_booking_code,
          customer_name: sequence.prev_customer_name,
          pickup_date: sequence.prev_pickup_date,
        }
      : null,
  });
});

const CODE_PREFIX = { rental: "RNT", sale: "SALE" } as const;

async function nextBookingCode(type: "rental" | "sale"): Promise<string> {
  const prefix = CODE_PREFIX[type];
  const { data, error } = await supabase
    .from("bookings")
    .select("booking_code")
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.booking_code as string | undefined;
  const lastNum = last ? parseInt(last.slice(last.lastIndexOf("-") + 1), 10) || 0 : 0;
  return `${prefix}-${String(lastNum + 1).padStart(4, "0")}`;
}

function sumQuantity(rows: { quantity_booked: number }[] | null | undefined): number {
  return (rows ?? []).reduce((sum, r) => sum + r.quantity_booked, 0);
}

// POST /api/bookings — create a rental or sale, with conflict detection.
//
// `unique` items: item.status must be 'available' (mirrors the item
// picker's own filter, as a server-side backstop). Rentals additionally
// must not overlap an existing active (booked/out) rental's date range on
// that item — the item's status is deliberately NOT flipped to
// 'rented_out' on rental creation, since a unique item can legitimately
// have multiple non-overlapping future rentals; the date-overlap check is
// the real guard. A unique-item sale, by contrast, is permanent, so it
// does flip status to 'sold' below.
//
// `quantity` items: requested quantity_booked must not exceed
// quantity_on_hand minus (a) quantity already permanently consumed by
// active sales, and for rentals also (b) quantity reserved by other
// active rentals whose date range overlaps the requested one.
// quantity_on_hand itself is never decremented — "how much is left" is
// always computed from existing bookings at check time, the same way
// balances/overdue status are computed rather than stored elsewhere in
// this codebase.
bookingsRouter.post("/", async (req: AuthedRequest, res) => {
  const {
    type,
    item_id,
    quantity_booked,
    customer_id,
    pickup_date,
    return_date,
    price_charged,
    deposit_amount,
    deposit_collected,
    gst_applicable,
    gst_invoice_number,
    hsn_code,
    tax_rate,
  } = req.body ?? {};

  if (type !== "rental" && type !== "sale") {
    return res.status(400).json({ error: "type must be 'rental' or 'sale'" });
  }
  if (!item_id || !customer_id || !pickup_date) {
    return res.status(400).json({ error: "item_id, customer_id, and pickup_date are required" });
  }
  if (type === "rental" && !return_date) {
    return res.status(400).json({ error: "return_date is required for rentals" });
  }
  if (price_charged == null) {
    return res.status(400).json({ error: "price_charged is required" });
  }

  const { data: item, error: itemError } = await supabase.from("items").select("*").eq("id", item_id).single();
  if (itemError || !item) return res.status(400).json({ error: "Item not found" });

  const qty = quantity_booked ?? 1;

  if (item.tracking_type === "unique") {
    if (item.status !== "available") {
      return res.status(409).json({ error: `This item isn't available right now (status: ${item.status})` });
    }
    if (type === "rental") {
      // Strict inequality: a new booking's pickup_date landing exactly on an
      // existing booking's return_date is same-day turnover (returns in the
      // morning, goes back out that evening) — common in wedding season and
      // must succeed, not block. Only a genuine overlap is a hard conflict.
      const { data: conflicts, error: conflictError } = await supabase
        .from("bookings")
        .select("*, customers(name)")
        .eq("item_id", item_id)
        .eq("type", "rental")
        .in("status", ACTIVE_STATUSES)
        .lt("pickup_date", return_date)
        .gt("return_date", pickup_date);
      if (conflictError) return res.status(500).json({ error: conflictError.message });
      if (conflicts && conflicts.length > 0) {
        return res.status(409).json({
          error: "This item is already booked for an overlapping date range",
          conflicts,
        });
      }
    }
  } else {
    const { data: activeSales, error: salesError } = await supabase
      .from("bookings")
      .select("quantity_booked")
      .eq("item_id", item_id)
      .eq("type", "sale")
      .in("status", ACTIVE_STATUSES);
    if (salesError) return res.status(500).json({ error: salesError.message });
    const alreadySold = sumQuantity(activeSales);

    let alreadyReservedForDates = 0;
    if (type === "rental") {
      // Same strict-inequality boundary as the unique-item check above.
      const { data: overlappingRentals, error: rentalError } = await supabase
        .from("bookings")
        .select("quantity_booked")
        .eq("item_id", item_id)
        .eq("type", "rental")
        .in("status", ACTIVE_STATUSES)
        .lt("pickup_date", return_date)
        .gt("return_date", pickup_date);
      if (rentalError) return res.status(500).json({ error: rentalError.message });
      alreadyReservedForDates = sumQuantity(overlappingRentals);
    }

    const available = (item.quantity_on_hand ?? 0) - alreadySold - alreadyReservedForDates;
    if (qty > available) {
      return res.status(409).json({
        error: `Only ${Math.max(available, 0)} available${type === "rental" ? " for these dates" : ""}, requested ${qty}`,
      });
    }
  }

  // Not a conflict (see the strict-inequality checks above), but worth a
  // heads-up: this booking's pickup lands the same day another active
  // rental on this item is due back, so the operator should confirm the
  // check-in actually happened before handing this one over.
  let warning: string | undefined;
  if (type === "rental") {
    const { data: sameDayReturns, error: sameDayError } = await supabase
      .from("bookings")
      .select("booking_code")
      .eq("item_id", item_id)
      .eq("type", "rental")
      .in("status", ACTIVE_STATUSES)
      .eq("return_date", pickup_date);
    if (sameDayError) return res.status(500).json({ error: sameDayError.message });
    if (sameDayReturns && sameDayReturns.length > 0) {
      warning = "This item has another booking returning today — confirm it's been checked in before handing it over.";
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const booking_code = await nextBookingCode(type);
    const { data, error } = await supabase
      .from("bookings")
      .insert({
        booking_code,
        type,
        item_id,
        quantity_booked: qty,
        customer_id,
        pickup_date,
        return_date: type === "rental" ? return_date : null,
        price_charged,
        deposit_amount: deposit_amount ?? 0,
        deposit_collected: deposit_collected ?? false,
        gst_applicable: gst_applicable ?? false,
        gst_invoice_number: gst_applicable ? gst_invoice_number ?? null : null,
        hsn_code: gst_applicable ? hsn_code ?? null : null,
        tax_rate: gst_applicable ? tax_rate ?? null : null,
        created_by: req.user?.id ?? null,
      })
      .select()
      .single();

    if (!error) {
      if (type === "sale" && item.tracking_type === "unique") {
        await supabase.from("items").update({ status: "sold" }).eq("id", item_id);
      }
      // `warning` is undefined (dropped by JSON.stringify) when there's
      // nothing to flag — the response shape is unchanged in the common case.
      return res.status(201).json({ ...data, warning });
    }
    if (error.code !== "23505") return res.status(400).json({ error: error.message });
  }
  res.status(500).json({ error: "Could not generate a unique booking code, please retry" });
});

// POST /api/bookings/:id/return — returns processing. Only valid while the
// booking is still active (booked/out) — rejects double-processing.
//
// For a `set` item, return_checklist is normalized from the item's
// `components`: whatever the operator submits as checked stays checked,
// anything else (including components they never mention) is recorded
// false. If anything ends up unchecked and there's no return_notes
// explaining why, this returns a non-blocking `warning` rather than
// blocking — same pattern as the booking-creation same-day-turnover
// warning: the shop needs to be able to close out an incomplete return
// ("chasing the missing piece") rather than get stuck unable to record it
// at all.
//
// A `unique` item's status flips back to 'available' here. A `quantity`
// item needs no stock adjustment — availability is computed live from
// active (booked/out) bookings, so flipping this one's status to
// 'returned' already removes it from that count; see the POST / handler's
// comment for why quantity_on_hand itself is never decremented.
bookingsRouter.post("/:id/return", async (req, res) => {
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("*, items(item_type, components, tracking_type)")
    .eq("id", req.params.id)
    .single();
  if (bookingError || !booking) return res.status(404).json({ error: "Booking not found" });

  if (booking.type !== "rental") {
    return res.status(400).json({ error: "Only rentals go through returns processing" });
  }
  if (!ACTIVE_STATUSES.includes(booking.status)) {
    return res.status(409).json({ error: `This booking is already '${booking.status}' and can't be returned again` });
  }

  const item = booking.items as { item_type: string; components: string[] | null; tracking_type: string } | null;
  const { return_notes, actual_return_date, deposit_refunded, deposit_refund_date } = req.body ?? {};

  let return_checklist: Record<string, boolean> | null = null;
  let warning: string | undefined;
  if (item?.item_type === "set") {
    const components = item.components ?? [];
    const submitted = (req.body?.return_checklist ?? {}) as Record<string, boolean>;
    return_checklist = Object.fromEntries(components.map((name) => [name, submitted[name] === true]));
    const anyUnchecked = components.some((name) => !return_checklist![name]);
    if (anyUnchecked && !return_notes?.trim()) {
      warning =
        "One or more components weren't checked off and there's no return note explaining it — consider adding one.";
    }
  }

  const effectiveReturnDate = actual_return_date || istToday();
  const updatePayload: Record<string, unknown> = {
    status: "returned",
    actual_return_date: effectiveReturnDate,
    return_checklist,
    return_notes: return_notes?.trim() || null,
  };
  if (booking.deposit_collected) {
    updatePayload.deposit_refunded = deposit_refunded ?? false;
    updatePayload.deposit_refund_date = deposit_refunded ? deposit_refund_date || effectiveReturnDate : null;
  }

  const { data, error } = await supabase
    .from("bookings")
    .update(updatePayload)
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  if (item?.tracking_type === "unique") {
    await supabase.from("items").update({ status: "available" }).eq("id", booking.item_id);
  }

  res.status(200).json({ ...data, warning });
});
