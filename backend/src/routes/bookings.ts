import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istToday } from "../lib/dates.js";
import type { AuthedRequest } from "../middleware/auth.js";

export const bookingsRouter = Router();

// "Still consuming inventory" — excludes returned/cancelled. Now describes
// booking_items.status (booked/out/returned/cancelled), not bookings.status
// — the parent no longer has a status column at all (see PROJECT_PLAN_V2.md
// §8). Kept as the same exported name/shape since every consumer (dashboard,
// reports, tools) still wants exactly this list.
export const ACTIVE_STATUSES = ["booked", "out"];

const ITEMS_EMBED = "item_code, name, item_type, tracking_type, components";
const BOOKING_ITEMS_EMBED = `*, items(${ITEMS_EMBED})`;

// GET /api/bookings?item_id=&customer_id=&computed_status=
//
// booking_items.booking_id / .item_id are real FKs (unlike the old
// bookings.item_id, which pointed at a single item per row) — so, unlike
// booking_financials/booking_status below, the item nesting itself is a
// genuine PostgREST relationship embed, not a two-query merge.
// booking_financials/booking_status remain computed VIEWS with no real
// FK to bookings, so total_paid/balance_due/computed_status/*_item_count
// still need the same two-queries-plus-merge pattern used everywhere else
// in this codebase for that reason.
bookingsRouter.get("/", async (req, res) => {
  let query = supabase
    .from("bookings")
    .select(`*, customers(name, phone), booking_items(${BOOKING_ITEMS_EMBED})`)
    .order("created_at", { ascending: false });
  if (typeof req.query.customer_id === "string") query = query.eq("customer_id", req.query.customer_id);
  if (typeof req.query.item_id === "string") query = query.eq("booking_items.item_id", req.query.item_id);
  const { data: bookings, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const ids = (bookings ?? []).map((b) => b.id);
  if (ids.length === 0) return res.json([]);

  const [{ data: financials, error: financialsError }, { data: statuses, error: statusesError }] = await Promise.all([
    supabase.from("booking_financials").select("booking_id, total_paid, balance_due, price_charged").in("booking_id", ids),
    supabase
      .from("booking_status")
      .select("booking_id, computed_status, active_item_count, resolved_item_count")
      .in("booking_id", ids),
  ]);
  if (financialsError) return res.status(500).json({ error: financialsError.message });
  if (statusesError) return res.status(500).json({ error: statusesError.message });

  const financialsByBookingId = new Map((financials ?? []).map((f) => [f.booking_id, f]));
  const statusByBookingId = new Map((statuses ?? []).map((s) => [s.booking_id, s]));

  let result = bookings.map((b) => ({
    ...b,
    total_paid: financialsByBookingId.get(b.id)?.total_paid ?? 0,
    balance_due: financialsByBookingId.get(b.id)?.balance_due ?? 0,
    price_charged: financialsByBookingId.get(b.id)?.price_charged ?? 0,
    computed_status: statusByBookingId.get(b.id)?.computed_status ?? "cancelled",
    active_item_count: statusByBookingId.get(b.id)?.active_item_count ?? 0,
    resolved_item_count: statusByBookingId.get(b.id)?.resolved_item_count ?? 0,
  }));

  // computed_status lives on a merged-in view, not a real column, so it's
  // filtered here in JS after the merge rather than in the initial query.
  if (typeof req.query.computed_status === "string") {
    result = result.filter((b) => b.computed_status === req.query.computed_status);
  }

  res.json(result);
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

// GET /api/bookings/next-code — the suggested next auto-generated BK-000N,
// to pre-fill the (editable) booking_code field in BookingForm — same
// pattern as items.ts's next-code. Read-only preview, reserves nothing;
// POST / still retries on a real collision if the suggestion goes stale
// before submit. Registered before GET /:id so "next-code" isn't swallowed
// as an :id value (same reasoning as /overdue and /upcoming-returns above).
bookingsRouter.get("/next-code", async (_req, res) => {
  try {
    res.json({ booking_code: await nextBookingCode() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to compute next booking code" });
  }
});

// GET /api/bookings/:id — parent + nested line items, each carrying its own
// "When Returns" chain (previous_booking_item / future_booking_items),
// computed from booking_sequence keyed by booking_item_id — a 3-item
// family booking has three independent physical items, each with its own
// neighbors, so this is N independent chains, not one for the whole
// booking (§8 decision 5). Only meaningful for tracking_type = 'unique'
// items; a 'quantity' item's chain is left null (no single well-defined
// "next in line" when many bookings can be active on it at once).
bookingsRouter.get("/:id", async (req, res) => {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(`*, customers(name, phone), booking_items(${BOOKING_ITEMS_EMBED})`)
    .eq("id", req.params.id)
    .single();
  if (error || !booking) return res.status(404).json({ error: "Booking not found" });

  const items = (booking.booking_items ?? []) as Array<{
    id: string;
    item_id: string;
    pickup_date: string;
    items: { tracking_type: string } | null;
  }>;

  const itemsWithChains = await Promise.all(
    items.map(async (bi) => {
      if (bi.items?.tracking_type !== "unique") {
        return { ...bi, previous_booking_item: null, future_booking_items: [] };
      }

      const { data: sequence, error: sequenceError } = await supabase
        .from("booking_sequence")
        .select("prev_booking_item_id, prev_booking_code, prev_customer_name, prev_pickup_date")
        .eq("booking_item_id", bi.id)
        .maybeSingle();
      if (sequenceError) throw sequenceError;

      const { data: itemChain, error: chainError } = await supabase
        .from("booking_items")
        .select("id, pickup_date, bookings(booking_code, customers(name))")
        .eq("item_id", bi.item_id)
        .neq("status", "cancelled")
        .order("pickup_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (chainError) throw chainError;

      const currentIndex = (itemChain ?? []).findIndex((row) => row.id === bi.id);
      const futureBookingItems =
        currentIndex === -1
          ? []
          : (itemChain ?? []).slice(currentIndex + 1).map((row) => ({
              id: row.id,
              booking_code: (row as unknown as { bookings: { booking_code: string; customers: { name: string } | null } | null })
                .bookings?.booking_code,
              customer_name: (row as unknown as { bookings: { booking_code: string; customers: { name: string } | null } | null })
                .bookings?.customers?.name ?? null,
              pickup_date: row.pickup_date,
            }));

      return {
        ...bi,
        previous_booking_item: sequence?.prev_booking_item_id
          ? {
              id: sequence.prev_booking_item_id,
              booking_code: sequence.prev_booking_code,
              customer_name: sequence.prev_customer_name,
              pickup_date: sequence.prev_pickup_date,
            }
          : null,
        future_booking_items: futureBookingItems,
      };
    }),
  );

  const [{ data: financials, error: financialsError }, { data: status, error: statusError }] = await Promise.all([
    supabase.from("booking_financials").select("total_paid, balance_due, price_charged").eq("booking_id", req.params.id).maybeSingle(),
    supabase
      .from("booking_status")
      .select("computed_status, active_item_count, resolved_item_count")
      .eq("booking_id", req.params.id)
      .maybeSingle(),
  ]);
  if (financialsError) return res.status(500).json({ error: financialsError.message });
  if (statusError) return res.status(500).json({ error: statusError.message });

  res.json({
    ...booking,
    booking_items: itemsWithChains,
    total_paid: financials?.total_paid ?? 0,
    balance_due: financials?.balance_due ?? 0,
    price_charged: financials?.price_charged ?? 0,
    computed_status: status?.computed_status ?? "cancelled",
    active_item_count: status?.active_item_count ?? 0,
    resolved_item_count: status?.resolved_item_count ?? 0,
  });
});

async function nextBookingCode(): Promise<string> {
  const { data, error } = await supabase
    .from("bookings")
    .select("booking_code")
    .like("booking_code", "BK-%")
    .order("booking_code", { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.booking_code as string | undefined;
  const lastNum = last ? parseInt(last.slice(last.lastIndexOf("-") + 1), 10) || 0 : 0;
  return `BK-${String(lastNum + 1).padStart(4, "0")}`;
}

function sumQuantity(rows: { quantity_booked: number }[] | null | undefined): number {
  return (rows ?? []).reduce((sum, r) => sum + r.quantity_booked, 0);
}

interface NewBookingItemInput {
  type: "rental" | "sale";
  item_id: string;
  quantity_booked?: number;
  pickup_date: string;
  return_date?: string | null;
  price_charged: number;
  deposit_amount?: number;
  deposit_collected?: boolean;
  custom_addons?: string[];
}

interface ItemConflict {
  index: number;
  item_id: string;
  error: string;
  conflicts?: unknown[];
}

// Re-checks one requested line item for conflicts against booking_items —
// the same rules bookings.ts always enforced for a single-item booking,
// just parameterized so POST / (creation) and POST /:bookingId/items (add
// one item to an existing booking) can share it. Returns null when clear,
// or a message + optional structured conflicts when not. This is the
// application-level pre-check (§8 decision 1) — a fast-fail before ever
// calling the transactional RPC (for creation) or doing the plain insert
// (for add-item); create_booking_with_items also re-validates internally as
// a second, transaction-safe layer for the small race window this pre-check
// alone can't close.
async function checkItemConflict(
  input: NewBookingItemInput,
): Promise<{ error: string; conflicts?: unknown[] } | null> {
  const { data: item, error: itemError } = await supabase.from("items").select("*").eq("id", input.item_id).single();
  if (itemError || !item) return { error: "Item not found" };

  const qty = input.quantity_booked ?? 1;

  if (item.tracking_type === "unique") {
    if (item.status !== "available") {
      return { error: `This item isn't available right now (status: ${item.status})` };
    }
    if (input.type === "rental") {
      const { data: conflicts, error: conflictError } = await supabase
        .from("booking_items")
        .select("*, bookings(booking_code, customers(name))")
        .eq("item_id", input.item_id)
        .eq("type", "rental")
        .in("status", ACTIVE_STATUSES)
        .lt("pickup_date", input.return_date as string)
        .gt("return_date", input.pickup_date);
      if (conflictError) throw conflictError;
      if (conflicts && conflicts.length > 0) {
        return { error: "This item is already booked for an overlapping date range", conflicts };
      }
    }
  } else {
    const { data: activeSales, error: salesError } = await supabase
      .from("booking_items")
      .select("quantity_booked")
      .eq("item_id", input.item_id)
      .eq("type", "sale")
      .in("status", ACTIVE_STATUSES);
    if (salesError) throw salesError;
    const alreadySold = sumQuantity(activeSales);

    let alreadyReservedForDates = 0;
    if (input.type === "rental") {
      const { data: overlappingRentals, error: rentalError } = await supabase
        .from("booking_items")
        .select("quantity_booked")
        .eq("item_id", input.item_id)
        .eq("type", "rental")
        .in("status", ACTIVE_STATUSES)
        .lt("pickup_date", input.return_date as string)
        .gt("return_date", input.pickup_date);
      if (rentalError) throw rentalError;
      alreadyReservedForDates = sumQuantity(overlappingRentals);
    }

    const available = (item.quantity_on_hand ?? 0) - alreadySold - alreadyReservedForDates;
    if (qty > available) {
      return {
        error: `Only ${Math.max(available, 0)} available${input.type === "rental" ? " for these dates" : ""}, requested ${qty}`,
      };
    }
  }
  return null;
}

async function checkSameDayWarning(input: NewBookingItemInput): Promise<string | null> {
  if (input.type !== "rental") return null;
  const { data: sameDayReturns, error } = await supabase
    .from("booking_items")
    .select("*, bookings(booking_code)")
    .eq("item_id", input.item_id)
    .eq("type", "rental")
    .in("status", ACTIVE_STATUSES)
    .eq("return_date", input.pickup_date);
  if (error) throw error;
  if (sameDayReturns && sameDayReturns.length > 0) {
    return "This item has another booking returning today — confirm it's been checked in before handing it over.";
  }
  return null;
}

// POST /api/bookings — creates a family transaction with one or more line
// items in a single real database transaction (create_booking_with_items,
// see supabase/proposed/20260811_booking_items_restructure/
// 01c_create_booking_with_items_rpc.sql) — either every item lands, or
// none do. Conflict-checked here FIRST, before the RPC is ever called (no
// writes at all if anything conflicts) — the RPC re-checks internally too,
// as a transaction-safe safety net for the small gap between this check and
// the call.
bookingsRouter.post("/", async (req: AuthedRequest, res) => {
  const {
    customer_id,
    gst_applicable,
    gst_invoice_number,
    hsn_code,
    tax_rate,
    advance_amount,
    advance_method,
    items,
    booking_code: requestedBookingCode,
  } = req.body ?? {};
  // booking_code defaults to server-generated (fast entry, retries on a rare
  // collision) but BookingForm pre-fills that suggestion into an editable
  // field — same override pattern as items.ts's item_code. A non-empty
  // client-supplied value (whether left as the suggestion or typed over) is
  // an explicit choice: validated for uniqueness, one attempt, friendly 409
  // on collision rather than silently retried with a different code.
  const customBookingCode = typeof requestedBookingCode === "string" ? requestedBookingCode.trim() : "";

  if (!customer_id) return res.status(400).json({ error: "customer_id is required" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "At least one item is required" });
  }

  const lineItems = items as NewBookingItemInput[];
  for (let i = 0; i < lineItems.length; i++) {
    const it = lineItems[i];
    if (it.type !== "rental" && it.type !== "sale") {
      return res.status(400).json({ error: `Item ${i + 1}: type must be 'rental' or 'sale'` });
    }
    if (!it.item_id || !it.pickup_date) {
      return res.status(400).json({ error: `Item ${i + 1}: item_id and pickup_date are required` });
    }
    if (it.type === "rental" && !it.return_date) {
      return res.status(400).json({ error: `Item ${i + 1}: return_date is required for rentals` });
    }
    if (it.price_charged == null) {
      return res.status(400).json({ error: `Item ${i + 1}: price_charged is required` });
    }
  }

  const advanceAmount = advance_amount != null ? Number(advance_amount) : 0;
  if (advanceAmount > 0 && !advance_method) {
    return res.status(400).json({ error: "advance_method is required when recording an advance payment" });
  }

  // Every downstream per-item route (edit/cancel/return) looks a line item
  // up by (booking_id, item_id) and expects exactly one row back — the same
  // physical item can never appear twice in one family booking, or those
  // routes become ambiguous. The RPC only catches this incidentally (when
  // the duplicate would also fail its own date/quantity check), so it's
  // enforced explicitly here regardless of whether the two entries would
  // otherwise conflict. Reported through the same item_conflicts shape as
  // the checks below so the frontend surfaces it inline on the same row.
  const itemConflicts: ItemConflict[] = [];
  const warnings: string[] = [];
  const seenItemIds = new Set<string>();
  for (let i = 0; i < lineItems.length; i++) {
    if (seenItemIds.has(lineItems[i].item_id)) {
      itemConflicts.push({
        index: i,
        item_id: lineItems[i].item_id,
        error: "This item is already included elsewhere in this booking",
      });
      continue;
    }
    seenItemIds.add(lineItems[i].item_id);

    const conflict = await checkItemConflict(lineItems[i]);
    if (conflict) {
      itemConflicts.push({ index: i, item_id: lineItems[i].item_id, error: conflict.error, conflicts: conflict.conflicts });
    } else {
      const warning = await checkSameDayWarning(lineItems[i]);
      if (warning) warnings.push(warning);
    }
  }
  if (itemConflicts.length > 0) {
    return res.status(409).json({
      error: "One or more items have conflicts",
      item_conflicts: itemConflicts,
    });
  }

  const rpcItems = lineItems.map((it) => ({
    type: it.type,
    item_id: it.item_id,
    quantity_booked: it.quantity_booked ?? 1,
    pickup_date: it.pickup_date,
    return_date: it.type === "rental" ? it.return_date : null,
    price_charged: it.price_charged,
    deposit_amount: it.type === "rental" ? it.deposit_amount ?? 0 : 0,
    deposit_collected: it.type === "rental" ? it.deposit_collected ?? false : false,
    custom_addons: it.custom_addons ?? [],
  }));

  const maxAttempts = customBookingCode ? 1 : 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const booking_code = customBookingCode || (await nextBookingCode());
    const { data, error } = await supabase.rpc("create_booking_with_items", {
      p_booking_code: booking_code,
      p_customer_id: customer_id,
      p_gst_applicable: gst_applicable ?? false,
      p_gst_invoice_number: gst_applicable ? gst_invoice_number ?? null : null,
      p_hsn_code: gst_applicable ? hsn_code ?? null : null,
      p_tax_rate: gst_applicable ? tax_rate ?? null : null,
      p_created_by: req.user?.id ?? null,
      p_items: rpcItems,
    });

    if (!error) {
      let warning = warnings.length > 0 ? warnings.join(" ") : undefined;

      if (advanceAmount > 0) {
        const { error: paymentError } = await supabase.from("payments").insert({
          booking_id: (data as { id: string }).id,
          amount: advanceAmount,
          method: advance_method,
          payment_date: istToday(),
          recorded_by: req.user?.id ?? null,
        });
        if (paymentError) {
          warning = warning
            ? `${warning} Also, the advance payment couldn't be recorded — add it manually from the booking's detail page.`
            : "The booking was created but the advance payment couldn't be recorded — add it manually from the booking's detail page.";
        }
      }

      const bookingId = (data as { id: string }).id;
      const [{ data: full, error: fullError }, { data: financials, error: financialsError }, { data: status, error: statusError }] =
        await Promise.all([
          supabase
            .from("bookings")
            .select(`*, customers(name, phone), booking_items(${BOOKING_ITEMS_EMBED})`)
            .eq("id", bookingId)
            .single(),
          supabase.from("booking_financials").select("total_paid, balance_due, price_charged").eq("booking_id", bookingId).maybeSingle(),
          supabase
            .from("booking_status")
            .select("computed_status, active_item_count, resolved_item_count")
            .eq("booking_id", bookingId)
            .maybeSingle(),
        ]);
      if (fullError) return res.status(500).json({ error: fullError.message });
      if (financialsError) return res.status(500).json({ error: financialsError.message });
      if (statusError) return res.status(500).json({ error: statusError.message });

      return res.status(201).json({
        ...full,
        total_paid: financials?.total_paid ?? 0,
        balance_due: financials?.balance_due ?? 0,
        price_charged: financials?.price_charged ?? 0,
        computed_status: status?.computed_status ?? "cancelled",
        active_item_count: status?.active_item_count ?? 0,
        resolved_item_count: status?.resolved_item_count ?? 0,
        warning,
      });
    }

    // P0001 = the RPC's own RAISE EXCEPTION (a conflict slipped past the
    // pre-check above, or a same-item-twice-in-one-request case) — surface
    // its message as a clean 409, never the raw error/PL-pgSQL context.
    if (error.code === "P0001") {
      return res.status(409).json({ error: error.message });
    }
    // 23505 = booking_code collision. A custom code gets exactly one
    // attempt and a friendly message — same wording pattern as items.ts's
    // item_code collision — rather than being silently retried with a
    // different value out from under the operator's explicit choice. An
    // auto-generated code retries with a freshly generated one instead.
    if (error.code === "23505") {
      if (customBookingCode) {
        return res.status(409).json({ error: "This booking code is already in use — choose a different one." });
      }
      continue;
    }
    return res.status(400).json({ error: error.message });
  }
  res.status(500).json({ error: "Could not generate a unique booking code, please retry" });
});

// POST /api/bookings/:bookingId/items — add a single new item to an
// already-created booking (§8 decision 4, expanded scope). Same
// per-item conflict check as creation; a plain single-row insert is
// already atomic on its own, no RPC needed.
bookingsRouter.post("/:bookingId/items", async (req, res) => {
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", req.params.bookingId)
    .single();
  if (bookingError || !booking) return res.status(404).json({ error: "Booking not found" });

  const input = (req.body ?? {}) as NewBookingItemInput;
  if (input.type !== "rental" && input.type !== "sale") {
    return res.status(400).json({ error: "type must be 'rental' or 'sale'" });
  }
  if (!input.item_id || !input.pickup_date) {
    return res.status(400).json({ error: "item_id and pickup_date are required" });
  }
  if (input.type === "rental" && !input.return_date) {
    return res.status(400).json({ error: "return_date is required for rentals" });
  }
  if (input.price_charged == null) {
    return res.status(400).json({ error: "price_charged is required" });
  }

  // Same invariant as POST / (create): a physical item can only appear once
  // per family booking, since every per-item route below looks a line item
  // up by (booking_id, item_id) and expects exactly one row. Scoped to
  // non-cancelled rows — a cancelled line for this item doesn't block
  // re-adding it.
  const { data: existingForItem, error: existingError } = await supabase
    .from("booking_items")
    .select("id")
    .eq("booking_id", req.params.bookingId)
    .eq("item_id", input.item_id)
    .neq("status", "cancelled")
    .limit(1);
  if (existingError) return res.status(500).json({ error: existingError.message });
  if (existingForItem && existingForItem.length > 0) {
    return res.status(409).json({ error: "This item is already included in this booking" });
  }

  const conflict = await checkItemConflict(input);
  if (conflict) {
    return res.status(409).json({ error: conflict.error, conflicts: conflict.conflicts });
  }
  const warning = await checkSameDayWarning(input);

  const { data, error } = await supabase
    .from("booking_items")
    .insert({
      booking_id: req.params.bookingId,
      item_id: input.item_id,
      quantity_booked: input.quantity_booked ?? 1,
      type: input.type,
      pickup_date: input.pickup_date,
      return_date: input.type === "rental" ? input.return_date : null,
      price_charged: input.price_charged,
      deposit_amount: input.type === "rental" ? input.deposit_amount ?? 0 : 0,
      deposit_collected: input.type === "rental" ? input.deposit_collected ?? false : false,
      custom_addons: input.custom_addons ?? [],
    })
    .select(`*, items(${ITEMS_EMBED})`)
    .single();
  if (error) return res.status(400).json({ error: error.message });

  res.status(201).json({ ...data, warning });
});

// POST /api/bookings/:bookingId/items/:itemId/cancel — remove a line item
// (§8 decision 4). Never a hard delete — status -> 'cancelled', same
// "never destroy booking history" rule used everywhere else in this
// schema. Blocked if it would push balance_due negative (money already
// collected must still fit under the reduced total), and only while the
// item is still booked/out (an already-returned item can't be
// retroactively un-booked).
bookingsRouter.post("/:bookingId/items/:itemId/cancel", async (req, res) => {
  const { data: bookingItem, error: itemFetchError } = await supabase
    .from("booking_items")
    .select("*")
    .eq("booking_id", req.params.bookingId)
    .eq("item_id", req.params.itemId)
    .single();
  if (itemFetchError || !bookingItem) return res.status(404).json({ error: "Booking item not found" });

  if (!ACTIVE_STATUSES.includes(bookingItem.status)) {
    return res.status(409).json({ error: `This item is already '${bookingItem.status}' and can't be removed` });
  }

  const { data: siblings, error: siblingsError } = await supabase
    .from("booking_items")
    .select("id, price_charged, status")
    .eq("booking_id", req.params.bookingId)
    .neq("status", "cancelled");
  if (siblingsError) return res.status(500).json({ error: siblingsError.message });

  const newTotal = (siblings ?? [])
    .filter((s) => s.id !== bookingItem.id)
    .reduce((sum, s) => sum + Number(s.price_charged), 0);

  const { data: financials, error: financialsError } = await supabase
    .from("booking_financials")
    .select("total_paid")
    .eq("booking_id", req.params.bookingId)
    .maybeSingle();
  if (financialsError) return res.status(500).json({ error: financialsError.message });

  const totalPaid = Number(financials?.total_paid ?? 0);
  if (totalPaid > newTotal) {
    const overpaid = (totalPaid - newTotal).toFixed(2);
    return res.status(409).json({
      error: `Removing this item would mean refunding ₹${overpaid}, which isn't supported yet`,
    });
  }

  const { data, error } = await supabase
    .from("booking_items")
    .update({ status: "cancelled" })
    .eq("id", bookingItem.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  res.status(200).json(data);
});

// PATCH /api/bookings/:id — parent-level fields only (customer_id, GST
// fields). Line-item fields are edited through the endpoint below.
bookingsRouter.patch("/:id", async (req, res) => {
  const { customer_id, gst_applicable, gst_invoice_number, hsn_code, tax_rate } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (customer_id !== undefined) update.customer_id = customer_id;
  if (gst_applicable !== undefined) {
    update.gst_applicable = gst_applicable;
    update.gst_invoice_number = gst_applicable ? gst_invoice_number ?? null : null;
    update.hsn_code = gst_applicable ? hsn_code ?? null : null;
    update.tax_rate = gst_applicable ? tax_rate ?? null : null;
  }

  const { data, error } = await supabase.from("bookings").update(update).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(200).json(data);
});

// PATCH /api/bookings/:bookingId/items/:itemId — edit an existing line
// item's editable fields (§8 decision 4). Re-runs the same conflict check
// as creation whenever dates/quantity change. Blocked for a
// returned/cancelled item — nothing to conflict-check against, and it
// would rewrite history.
bookingsRouter.patch("/:bookingId/items/:itemId", async (req, res) => {
  const { data: bookingItem, error: fetchError } = await supabase
    .from("booking_items")
    .select("*")
    .eq("booking_id", req.params.bookingId)
    .eq("item_id", req.params.itemId)
    .single();
  if (fetchError || !bookingItem) return res.status(404).json({ error: "Booking item not found" });

  if (!ACTIVE_STATUSES.includes(bookingItem.status)) {
    return res.status(409).json({ error: `This item is already '${bookingItem.status}' and can't be edited` });
  }

  const { pickup_date, return_date, price_charged, quantity_booked, deposit_amount, deposit_collected, custom_addons } =
    req.body ?? {};

  const datesOrQuantityChanged =
    (pickup_date !== undefined && pickup_date !== bookingItem.pickup_date) ||
    (return_date !== undefined && return_date !== bookingItem.return_date) ||
    (quantity_booked !== undefined && quantity_booked !== bookingItem.quantity_booked);

  if (datesOrQuantityChanged) {
    const conflict = await checkItemConflict({
      type: bookingItem.type,
      item_id: bookingItem.item_id,
      quantity_booked: quantity_booked ?? bookingItem.quantity_booked,
      pickup_date: pickup_date ?? bookingItem.pickup_date,
      return_date: return_date ?? bookingItem.return_date,
      price_charged: price_charged ?? bookingItem.price_charged,
    });
    // The item's own current row would otherwise conflict with itself in
    // the overlap check above — exclude it before deciding to block.
    if (conflict?.conflicts) {
      const others = (conflict.conflicts as { id: string }[]).filter((c) => c.id !== bookingItem.id);
      if (others.length > 0) {
        return res.status(409).json({ error: conflict.error, conflicts: others });
      }
    } else if (conflict) {
      return res.status(409).json({ error: conflict.error });
    }
  }

  const update: Record<string, unknown> = {};
  if (pickup_date !== undefined) update.pickup_date = pickup_date;
  if (return_date !== undefined) update.return_date = return_date;
  if (price_charged !== undefined) update.price_charged = price_charged;
  if (quantity_booked !== undefined) update.quantity_booked = quantity_booked;
  if (deposit_amount !== undefined) update.deposit_amount = deposit_amount;
  if (deposit_collected !== undefined) update.deposit_collected = deposit_collected;
  if (custom_addons !== undefined) update.custom_addons = custom_addons;

  const { data, error } = await supabase.from("booking_items").update(update).eq("id", bookingItem.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(200).json(data);
});

// POST /api/bookings/:bookingId/items/:itemId/return — returns processing,
// now scoped to one booking_items row (§8 decision D) rather than a whole
// booking. Assumes an item appears at most once per booking — .single()
// below is a data-integrity backstop for that assumption, not just a
// convenience.
bookingsRouter.post("/:bookingId/items/:itemId/return", async (req, res) => {
  const { data: bookingItem, error: bookingError } = await supabase
    .from("booking_items")
    .select(`*, items(${ITEMS_EMBED})`)
    .eq("booking_id", req.params.bookingId)
    .eq("item_id", req.params.itemId)
    .single();
  if (bookingError || !bookingItem) return res.status(404).json({ error: "Booking item not found" });

  if (bookingItem.type !== "rental") {
    return res.status(400).json({ error: "Only rentals go through returns processing" });
  }
  if (!ACTIVE_STATUSES.includes(bookingItem.status)) {
    return res.status(409).json({ error: `This item is already '${bookingItem.status}' and can't be returned again` });
  }

  const item = bookingItem.items as { item_type: string; components: string[] | null; tracking_type: string } | null;
  const { return_notes, actual_return_date, deposit_refunded, deposit_refund_date } = req.body ?? {};

  const componentNames = item?.item_type === "set" ? item.components ?? [] : [];
  const addonNames = (bookingItem.custom_addons ?? []) as string[];
  const checklistNames = [...componentNames, ...addonNames];

  let return_checklist: Record<string, boolean> | null = null;
  let warning: string | undefined;
  if (checklistNames.length > 0) {
    const submitted = (req.body?.return_checklist ?? {}) as Record<string, boolean>;
    return_checklist = Object.fromEntries(checklistNames.map((name) => [name, submitted[name] === true]));
    const anyUnchecked = checklistNames.some((name) => !return_checklist![name]);
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
  if (bookingItem.deposit_collected) {
    updatePayload.deposit_refunded = deposit_refunded ?? false;
    updatePayload.deposit_refund_date = deposit_refunded ? deposit_refund_date || effectiveReturnDate : null;
  }

  const { data, error } = await supabase
    .from("booking_items")
    .update(updatePayload)
    .eq("id", bookingItem.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  if (item?.tracking_type === "unique") {
    await supabase.from("items").update({ status: "available" }).eq("id", req.params.itemId);
  }

  res.status(200).json({ ...data, warning });
});
