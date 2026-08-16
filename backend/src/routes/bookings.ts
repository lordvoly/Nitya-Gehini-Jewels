import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istToday, istRangeForPreset } from "../lib/dates.js";
import { recordPayment } from "../lib/payments.js";
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

interface ChainableBookingItem {
  id: string;
  item_id: string;
  pickup_date: string;
  type: string;
  status: string;
  items?: { tracking_type: string } | null;
}

interface BookingChainLink {
  id: string;
  booking_code: string | undefined;
  customer_name: string | null;
  pickup_date: string;
}

// Shared by GET / (list) and GET /:id (detail) — same per-item "When
// Returns" computation either way, just applied to a flat batch of items
// instead of one booking's items at a time, so a list page doesn't pay for
// N separate round-trips of booking-shaped Promise.all nesting. Only
// meaningful for tracking_type = 'unique' items; a 'quantity' item's chain
// is left empty (no single well-defined "next in line" when many bookings
// can be active on it at once) — see the fuller comment on GET /:id below.
async function attachChains<T extends ChainableBookingItem>(
  items: T[],
): Promise<
  (T & {
    previous_booking_item: BookingChainLink | null;
    future_booking_items: BookingChainLink[];
    // True only for a rental still sitting in 'booked' whose pickup_date
    // has already passed — i.e. date-inference's fallback answer for "is
    // this actually out" when nobody has explicitly confirmed pickup via
    // POST .../confirm-pickup. Once status flips to 'out' this is always
    // false, regardless of pickup_date — the explicit signal always wins
    // over the date-based fallback that produced it, per the task's
    // "date-based detection as a fallback for anything not yet confirmed"
    // instruction. Computed here (not stored) so it's identical wherever
    // this function's output is used — GET / and GET /:id both flow
    // through it, which is what keeps BookingsList/BookingDetail agreeing
    // with each other and with the Items page's own pickup_overdue set
    // (itemsData.ts's getItemAvailability(), computed the same way).
    pickup_overdue: boolean;
  })[]
> {
  const today = istToday();
  return Promise.all(
    items.map(async (bi) => {
      const pickup_overdue = bi.type === "rental" && bi.status === "booked" && bi.pickup_date <= today;

      if (bi.items?.tracking_type !== "unique") {
        return { ...bi, previous_booking_item: null, future_booking_items: [], pickup_overdue };
      }

      const { data: sequence, error: sequenceError } = await supabase
        .from("booking_sequence")
        .select("prev_booking_item_id, prev_booking_code, prev_customer_name, prev_pickup_date")
        .eq("booking_item_id", bi.id)
        .maybeSingle();
      if (sequenceError) throw sequenceError;

      const { data: itemChain, error: chainError } = await supabase
        .from("booking_items")
        .select("id, booking_id, pickup_date, bookings(booking_code, customers(name))")
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
              // The line item's own booking_id — lets a caller (e.g.
              // BookingsList's "Next: ..." line) link straight into that
              // future booking's detail view without a second lookup.
              booking_id: row.booking_id,
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
        pickup_overdue,
      };
    }),
  );
}

const BOOKING_LIST_SELECT = `*, customers(name, phone), booking_items(${BOOKING_ITEMS_EMBED})`;

// GET /api/bookings?item_id=&customer_id=&computed_status=&search=
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
  const term = typeof req.query.search === "string" ? req.query.search.trim() : "";

  let bookings: Record<string, unknown>[] | null;

  if (term) {
    // Same separate-queries-plus-merge pattern as customers.ts's search:
    // booking_code lives on bookings directly, but customer name lives on
    // the joined customers table, and a single request can't OR-filter
    // across a relationship boundary that way in PostgREST.
    const [byCode, matchingCustomers] = await Promise.all([
      supabase.from("bookings").select(BOOKING_LIST_SELECT).ilike("booking_code", `%${term}%`),
      supabase.from("customers").select("id").ilike("name", `%${term}%`),
    ]);
    if (byCode.error) return res.status(500).json({ error: byCode.error.message });
    if (matchingCustomers.error) return res.status(500).json({ error: matchingCustomers.error.message });

    const customerIds = (matchingCustomers.data ?? []).map((c) => c.id);
    const byCustomer = customerIds.length
      ? await supabase.from("bookings").select(BOOKING_LIST_SELECT).in("customer_id", customerIds)
      : { data: [] as Record<string, unknown>[], error: null };
    if (byCustomer.error) return res.status(500).json({ error: byCustomer.error.message });

    const merged = new Map<string, Record<string, unknown>>();
    for (const b of [...(byCode.data ?? []), ...(byCustomer.data ?? [])]) merged.set(b.id as string, b);
    bookings = Array.from(merged.values()).sort((a, b) => (b.created_at as string).localeCompare(a.created_at as string));
  } else {
    let query = supabase.from("bookings").select(BOOKING_LIST_SELECT).order("created_at", { ascending: false });
    if (typeof req.query.customer_id === "string") query = query.eq("customer_id", req.query.customer_id);
    if (typeof req.query.item_id === "string") query = query.eq("booking_items.item_id", req.query.item_id);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    bookings = data;
  }

  const ids = (bookings ?? []).map((b) => b.id as string);
  if (ids.length === 0) return res.json([]);

  // Same per-item "When Returns" chain GET /:id computes, now also on the
  // list so BookingsList's cards can show a one-line "Next: ..." per item
  // without a click-through — one flattened Promise.all across every
  // booking's items on the page, not a nested loop per booking.
  const chainsByItemId = new Map(
    (await attachChains((bookings ?? []).flatMap((b) => (b.booking_items ?? []) as ChainableBookingItem[]))).map((bi) => [
      bi.id,
      { previous_booking_item: bi.previous_booking_item, future_booking_items: bi.future_booking_items, pickup_overdue: bi.pickup_overdue },
    ]),
  );

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
    booking_items: ((b.booking_items ?? []) as ChainableBookingItem[]).map((bi) => ({
      ...bi,
      ...chainsByItemId.get(bi.id),
    })),
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

  // ?category=out|booked|needs_confirmation|completed|cancelled — a booking
  // matches if ANY of its items falls in that bucket (a family transaction
  // can have items in genuinely different states at once — one returned,
  // one still out). "cancelled" is the one exception: it's the whole
  // booking's computed status (every item cancelled), not a per-item OR,
  // since that's what "cancelled" already unambiguously means booking-wide
  // everywhere else in this app.
  //
  // "out" now means explicitly confirmed (status='out', set only by
  // POST .../confirm-pickup) — no longer pure pickup_date-vs-today
  // inference. "needs_confirmation" is the new, separate bucket for exactly
  // the case that inference used to silently fold into "out": a rental
  // still 'booked' whose pickup_date has already passed, i.e. bi.
  // pickup_overdue (computed once in attachChains() above and reused here,
  // not recomputed) — the no-show/missed-confirmation case this bucket
  // exists to surface on its own. "booked" is now strictly upcoming:
  // 'booked' status with a pickup_date still in the future. This is the
  // same three-way split itemsData.ts's getItemAvailability() uses for the
  // Items list's Out/Needs-Confirmation/Booked badges — computed here in JS
  // off the already-fetched booking_items rather than a second query, same
  // reasoning as the computed_status filter just above.
  interface CategoryBookingItem {
    type: string;
    status: string;
    pickup_date: string;
    pickup_overdue: boolean;
  }

  const category = typeof req.query.category === "string" ? req.query.category : "all";
  if (category !== "all") {
    result = result.filter((b) => {
      if (category === "cancelled") return b.computed_status === "cancelled";
      const items = (b.booking_items ?? []) as unknown as CategoryBookingItem[];
      if (category === "out") {
        return items.some((bi) => bi.type === "rental" && bi.status === "out");
      }
      if (category === "needs_confirmation") {
        return items.some((bi) => bi.pickup_overdue);
      }
      if (category === "booked") {
        return items.some((bi) => bi.type === "rental" && bi.status === "booked" && !bi.pickup_overdue);
      }
      if (category === "completed") {
        return items.some((bi) => bi.status !== "cancelled" && (bi.type === "sale" || bi.status === "returned"));
      }
      return true;
    });
  }

  // ?date_basis=pickup|booking (default pickup) + ?time_range=week|month|
  // 3months|year|all (default all) — independent of category above: this is
  // about which date field time-based filtering/sorting uses, not item
  // status. "All time" leaves both the result set and sort order completely
  // untouched (still created_at desc, the pre-existing default) regardless
  // of date_basis — sorting by a specific date field only becomes
  // meaningful once there's an actual window being filtered to, and
  // "everything" is still best served newest-created-first. This is also
  // what keeps a filter-untouched page load byte-for-byte identical to
  // this feature not existing at all.
  const dateBasis = req.query.date_basis === "booking" ? "booking" : "pickup";
  const range = typeof req.query.time_range === "string" ? istRangeForPreset(req.query.time_range) : null;
  if (range) {
    if (dateBasis === "booking") {
      result = result
        .filter((b) => {
          const bookingDate = (b as { booking_date?: unknown }).booking_date;
          return typeof bookingDate === "string" && bookingDate >= range.from && bookingDate <= range.to;
        })
        .sort((a, b) =>
          (b as unknown as { booking_date: string }).booking_date.localeCompare(
            (a as unknown as { booking_date: string }).booking_date,
          ),
        );
    } else {
      // Pickup-date mode: a multi-item booking matches if ANY item's pickup
      // falls in range; sorted by the latest such matching pickup_date
      // (the most recent/relevant pickup within the window), descending.
      result = result
        .map((b) => {
          const items = (b.booking_items ?? []) as unknown as CategoryBookingItem[];
          const matching = items.map((bi) => bi.pickup_date).filter((d) => d >= range.from && d <= range.to);
          return { booking: b, matchDate: matching.length > 0 ? matching.sort().at(-1)! : null };
        })
        .filter((x) => x.matchDate !== null)
        .sort((a, b) => (b.matchDate as string).localeCompare(a.matchDate as string))
        .map((x) => x.booking);
    }
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
// Shared by GET /:id below and the AI assistant's get_booking_by_code tool
// (which resolves booking_code -> id first, then calls this) — the exact
// same assembly either way: booking + items/chains + financials + status.
// Returns null when the booking doesn't exist, same as .maybeSingle()'s own
// "not found" shape, so callers can decide how to surface that themselves.
export async function getBookingDetail(id: string) {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(`*, customers(name, phone), booking_items(${BOOKING_ITEMS_EMBED})`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return null;

  const itemsWithChains = await attachChains((booking.booking_items ?? []) as ChainableBookingItem[]);

  const [{ data: financials, error: financialsError }, { data: status, error: statusError }] = await Promise.all([
    supabase.from("booking_financials").select("total_paid, balance_due, price_charged").eq("booking_id", id).maybeSingle(),
    supabase.from("booking_status").select("computed_status, active_item_count, resolved_item_count").eq("booking_id", id).maybeSingle(),
  ]);
  if (financialsError) throw financialsError;
  if (statusError) throw statusError;

  return {
    ...booking,
    booking_items: itemsWithChains,
    total_paid: financials?.total_paid ?? 0,
    balance_due: financials?.balance_due ?? 0,
    price_charged: financials?.price_charged ?? 0,
    computed_status: status?.computed_status ?? "cancelled",
    active_item_count: status?.active_item_count ?? 0,
    resolved_item_count: status?.resolved_item_count ?? 0,
  };
}

bookingsRouter.get("/:id", async (req, res) => {
  try {
    const booking = await getBookingDetail(req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
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
// excludeBookingItemId: when re-checking an existing booking_item being
// edited (PATCH /:bookingId/items/:itemId), that row is still sitting in the
// DB with its old dates/quantity during this check and would otherwise count
// against itself — for a unique item that's a false "overlapping booking"
// against its own current row, for a quantity item it's the row's own
// quantity double-counted as "already reserved". Applied as a query-level
// .neq() on every query below (not just the unique-item branch) so both
// tracking types get the same self-exclusion; omitted entirely (undefined)
// on creation/add-item calls, where there is no existing row to exclude.
async function checkItemConflict(
  input: NewBookingItemInput,
  excludeBookingItemId?: string,
): Promise<{ error: string; conflicts?: unknown[] } | null> {
  const { data: item, error: itemError } = await supabase.from("items").select("*").eq("id", input.item_id).single();
  if (itemError || !item) return { error: "Item not found" };

  const qty = input.quantity_booked ?? 1;

  if (item.tracking_type === "unique") {
    if (item.status !== "available") {
      return { error: `This item isn't available right now (status: ${item.status})` };
    }
    if (input.type === "rental") {
      let query = supabase
        .from("booking_items")
        .select("*, bookings(booking_code, customers(name))")
        .eq("item_id", input.item_id)
        .eq("type", "rental")
        .in("status", ACTIVE_STATUSES)
        .lt("pickup_date", input.return_date as string)
        .gt("return_date", input.pickup_date);
      if (excludeBookingItemId) query = query.neq("id", excludeBookingItemId);
      const { data: conflicts, error: conflictError } = await query;
      if (conflictError) throw conflictError;
      if (conflicts && conflicts.length > 0) {
        return { error: "This item is already booked for an overlapping date range", conflicts };
      }
    }
  } else {
    let salesQuery = supabase
      .from("booking_items")
      .select("quantity_booked")
      .eq("item_id", input.item_id)
      .eq("type", "sale")
      .in("status", ACTIVE_STATUSES);
    if (excludeBookingItemId) salesQuery = salesQuery.neq("id", excludeBookingItemId);
    const { data: activeSales, error: salesError } = await salesQuery;
    if (salesError) throw salesError;
    const alreadySold = sumQuantity(activeSales);

    let alreadyReservedForDates = 0;
    if (input.type === "rental") {
      let rentalQuery = supabase
        .from("booking_items")
        .select("quantity_booked")
        .eq("item_id", input.item_id)
        .eq("type", "rental")
        .in("status", ACTIVE_STATUSES)
        .lt("pickup_date", input.return_date as string)
        .gt("return_date", input.pickup_date);
      if (excludeBookingItemId) rentalQuery = rentalQuery.neq("id", excludeBookingItemId);
      const { data: overlappingRentals, error: rentalError } = await rentalQuery;
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
    advance_date,
    booking_date,
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
      // Left blank on purpose defaults to today in IST server-side — same
      // pattern as advance_date/payment_date above, rather than the
      // frontend computing "today" itself.
      p_booking_date: booking_date || istToday(),
    });

    if (!error) {
      let warning = warnings.length > 0 ? warnings.join(" ") : undefined;

      if (advanceAmount > 0) {
        const { error: paymentError } = await supabase.from("payments").insert({
          booking_id: (data as { id: string }).id,
          amount: advanceAmount,
          method: advance_method,
          // Same left-blank-on-purpose default as actual_return_date below
          // — the advance was often actually paid on a different day than
          // when the booking gets entered, so this is editable rather than
          // silently forced to "now".
          payment_date: advance_date || istToday(),
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
// schema. Only while the item is still booked/out (an already-returned
// item can't be retroactively un-booked).
//
// No longer blocks on a negative balance (refund infrastructure): if
// removing this item would leave the customer overpaid, the first call
// (without refund_amount) is rejected with the exact amount needed so the
// frontend can show/edit it; the confirming call (with refund_amount)
// records that as a real refund — payments row, type='refund', NEGATIVE
// amount, since actual money is leaving the shop (see the migration's
// sign-convention note) — before the item is cancelled.
bookingsRouter.post("/:bookingId/items/:itemId/cancel", async (req: AuthedRequest, res) => {
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
  const overpaid = totalPaid - newTotal;
  const requestedRefund = req.body?.refund_amount != null ? Number(req.body.refund_amount) : null;

  if (overpaid > 0 && requestedRefund == null) {
    return res.status(409).json({
      error: `Removing this item means refunding ₹${overpaid.toFixed(2)} already paid toward it.`,
      refund_amount_needed: Number(overpaid.toFixed(2)),
    });
  }

  if (requestedRefund != null && requestedRefund > 0) {
    const { error: refundError } = await supabase.from("payments").insert({
      booking_id: req.params.bookingId,
      amount: -requestedRefund,
      method: "other",
      type: "refund",
      payment_date: istToday(),
      notes: `Refund for removing item from booking`,
      recorded_by: req.user?.id ?? null,
    });
    if (refundError) return res.status(400).json({ error: `Refund couldn't be recorded: ${refundError.message}` });
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

// POST /api/bookings/:id/cancel — whole-booking cancel (§8 decision 6,
// finally built now that refund infrastructure exists). Loops the same
// mechanism the single-item remove endpoint uses across every still-active
// (booked/out) line item in one call — an already-returned item is
// already resolved and stays untouched, same restriction the single-item
// endpoint enforces. Takes ONE refund_amount for the whole booking rather
// than prompting per item: the frontend already has the booking's current
// total_paid loaded (via fetchBooking) and can pre-fill/edit it without a
// round-trip first, unlike the single-item flow where the "amount after
// removing just this one" isn't already sitting in state.
bookingsRouter.post("/:id/cancel", async (req: AuthedRequest, res) => {
  const { data: items, error: itemsError } = await supabase
    .from("booking_items")
    .select("id")
    .eq("booking_id", req.params.id)
    .in("status", ACTIVE_STATUSES);
  if (itemsError) return res.status(500).json({ error: itemsError.message });
  if (!items || items.length === 0) {
    return res.status(409).json({ error: "This booking has no active items to cancel" });
  }

  const refundAmount = req.body?.refund_amount != null ? Number(req.body.refund_amount) : 0;
  if (!(refundAmount >= 0)) {
    return res.status(400).json({ error: "refund_amount can't be negative" });
  }

  if (refundAmount > 0) {
    const { error: refundError } = await supabase.from("payments").insert({
      booking_id: req.params.id,
      amount: -refundAmount,
      method: "other",
      type: "refund",
      payment_date: istToday(),
      notes: "Refund for cancelling booking",
      recorded_by: req.user?.id ?? null,
    });
    if (refundError) return res.status(400).json({ error: `Refund couldn't be recorded: ${refundError.message}` });
  }

  const { error: cancelError } = await supabase
    .from("booking_items")
    .update({ status: "cancelled" })
    .in(
      "id",
      items.map((i) => i.id),
    );
  if (cancelError) return res.status(400).json({ error: cancelError.message });

  res.status(200).json({ ok: true, cancelled_item_count: items.length });
});

// PATCH /api/bookings/:id — parent-level fields only (customer_id, GST
// fields). Line-item fields are edited through the endpoint below.
bookingsRouter.patch("/:id", async (req, res) => {
  const { customer_id, gst_applicable, gst_invoice_number, hsn_code, tax_rate, booking_date } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (customer_id !== undefined) update.customer_id = customer_id;
  if (booking_date !== undefined) update.booking_date = booking_date;
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
    const conflict = await checkItemConflict(
      {
        type: bookingItem.type,
        item_id: bookingItem.item_id,
        quantity_booked: quantity_booked ?? bookingItem.quantity_booked,
        pickup_date: pickup_date ?? bookingItem.pickup_date,
        return_date: return_date ?? bookingItem.return_date,
        price_charged: price_charged ?? bookingItem.price_charged,
      },
      bookingItem.id,
    );
    if (conflict) {
      return res.status(409).json({ error: conflict.error, conflicts: conflict.conflicts });
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

// POST /api/bookings/:bookingId/items/:itemId/confirm-pickup — the first
// real, explicit status='out' transition this app has ever had. Until now
// "currently out" was pure inference (pickup_date <= today), which is what
// itemsData.ts/attachChains()'s pickup_overdue still falls back to for
// anything not yet confirmed — this endpoint is what actually clears that
// fallback for a given item by recording a real event: an operator
// confirming the item has genuinely left the shop (or, for a sale,
// genuinely changed hands) right now. Applies to both rental AND sale
// items — a sale has no return step, but "has the customer actually taken
// it yet" is still a real, useful question for one too.
//
// Deliberately does NOT flip items.status for a unique item (e.g. to
// 'rented_out') — same reasoning as booking creation already documented at
// length above POST / for rentals: a unique item can have several
// legitimate future non-overlapping bookings, and checkItemConflict only
// ever checks item.status === 'available'. Flipping it here would wrongly
// block every one of those future bookings the same way flipping it at
// creation would. Per-booking status (booking_items.status), not
// items.status, is what tracks whether a specific booking's item is out.
//
// Payment recording is optional and validated up front (amount+method
// together, before any write) — same "hard-validate before touching the
// DB" pattern POST / already uses for its advance payment, since an
// operator who typed in an amount should never have it silently dropped.
// The actual insert, once validated, is non-blocking on failure (same
// warning-not-rollback pattern as every other secondary write in this
// file) — the pickup confirmation itself already succeeded and shouldn't
// be undone by a payments-table hiccup.
bookingsRouter.post("/:bookingId/items/:itemId/confirm-pickup", async (req: AuthedRequest, res) => {
  const { data: bookingItem, error: fetchError } = await supabase
    .from("booking_items")
    .select("*")
    .eq("booking_id", req.params.bookingId)
    .eq("item_id", req.params.itemId)
    .single();
  if (fetchError || !bookingItem) return res.status(404).json({ error: "Booking item not found" });

  if (bookingItem.status !== "booked") {
    return res.status(409).json({ error: `This item is already '${bookingItem.status}' and can't be confirmed for pickup` });
  }

  const { amount, method, payment_date } = req.body ?? {};
  const paymentAmount = amount != null ? Number(amount) : 0;
  if (paymentAmount > 0 && !method) {
    return res.status(400).json({ error: "method is required when recording a payment" });
  }

  const { data, error } = await supabase
    .from("booking_items")
    .update({ status: "out", actual_pickup_date: istToday() })
    .eq("id", bookingItem.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  let warning: string | undefined;
  if (paymentAmount > 0) {
    try {
      await recordPayment({
        bookingId: req.params.bookingId,
        amount: paymentAmount,
        method,
        paymentDate: payment_date,
        notes: null,
        recordedBy: req.user?.id ?? null,
      });
    } catch {
      warning = "Pickup confirmed, but the payment couldn't be recorded — add it manually from the booking's detail page.";
    }
  }

  res.status(200).json({ ...data, warning });
});

// POST /api/bookings/:bookingId/items/:itemId/return — returns processing,
// now scoped to one booking_items row (§8 decision D) rather than a whole
// booking. Assumes an item appears at most once per booking — .single()
// below is a data-integrity backstop for that assumption, not just a
// convenience.
//
// Optional `charges: { description, amount }[]` — lost-and-found: one
// unresolved item_charges row plus one linked payments row per entry (see
// the sign-convention note at the top of the refund-infrastructure
// migration — a charge is a NEGATIVE payments.amount, since no cash
// actually changed hands yet; that's what makes balance_due reflect it
// immediately with zero changes to how balance_due itself is computed).
// Charges are processed after the return itself succeeds, same
// non-blocking-warning-on-secondary-failure pattern as the advance
// payment at booking creation — a failed charge insert doesn't undo an
// already-completed return.
bookingsRouter.post("/:bookingId/items/:itemId/return", async (req: AuthedRequest, res) => {
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

  const charges = Array.isArray(req.body?.charges) ? (req.body.charges as { description?: string; amount?: number }[]) : [];
  for (const charge of charges) {
    const description = charge.description?.trim();
    const amount = Number(charge.amount);
    if (!description || !(amount > 0)) continue; // silently skip a malformed entry rather than fail the whole return

    const { error: chargeInsertError } = await supabase.from("item_charges").insert({
      booking_item_id: bookingItem.id,
      description,
      charge_amount: amount,
      charged_at: effectiveReturnDate,
    });
    if (chargeInsertError) {
      warning = warning
        ? `${warning} Also, a charge for "${description}" couldn't be recorded — add it manually.`
        : `A charge for "${description}" couldn't be recorded — add it manually.`;
      continue;
    }

    const { error: chargePaymentError } = await supabase.from("payments").insert({
      booking_id: req.params.bookingId,
      amount: -amount,
      method: "other",
      type: "payment",
      payment_date: effectiveReturnDate,
      notes: `Lost/damaged: ${description}`,
      recorded_by: req.user?.id ?? null,
    });
    if (chargePaymentError) {
      warning = warning
        ? `${warning} Also, the charge for "${description}" was recorded but its balance adjustment failed — check Outstanding Charges.`
        : `The charge for "${description}" was recorded but its balance adjustment failed — check Outstanding Charges.`;
    }
  }

  res.status(200).json({ ...data, warning });
});
