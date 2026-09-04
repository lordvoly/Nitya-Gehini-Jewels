import { apiFetch, ApiError } from "./api";
import type { PaymentMethod } from "./payments";
import type { CustomerType } from "./customers";

// ── Real types (Checkpoint b/§8 design) ─────────────────────────────────

export type BookingItemType = "rental" | "sale";
// Who physically collected the item at pickup — set on confirm-pickup,
// cleared on undo-pickup. 'self' needs no further detail; 'family'/'porter'
// carry a name+phone (see BookingItem's pickup_person_* fields below).
export type PickupPersonType = "self" | "family" | "porter";

export const PICKUP_PERSON_TYPES: PickupPersonType[] = ["self", "family", "porter"];

export const PICKUP_PERSON_TYPE_LABELS: Record<PickupPersonType, string> = {
  self: "Self",
  family: "Family",
  porter: "Porter",
};
export type BookingType = BookingItemType; // same meaning, now per-item
export type BookingItemStatus = "booked" | "out" | "returned" | "cancelled";
export type BookingComputedStatus = "active" | "completed" | "cancelled";

// BookingsList's category filter — item-status buckets, distinct from
// BookingComputedStatus (a per-booking rollup). "out" means explicitly
// confirmed (status='out', via Confirm Pickup) — mirrors the Items list's
// "Out" badge exactly. "needs_confirmation" is the separate, distinct
// bucket for a rental still 'booked' whose pickup_date has already
// passed but was never confirmed — mirrors the Items list's "Pickup
// Overdue — Not Confirmed" badge. A booking matches a bucket if ANY of its
// items does (except "cancelled", which is the whole booking's computed
// status).
export type BookingCategory = "all" | "out" | "needs_confirmation" | "booked" | "completed" | "cancelled";
// Which date field BookingsList's time-range filter/sort applies to —
// independent of category above.
export type BookingDateBasis = "pickup" | "booking";
export type BookingTimeRange = "all" | "week" | "month" | "3months" | "year";
// BookingsList's Type filter — a booking matches "rental"/"sale" if ANY of
// its items is that type, same per-item-OR reasoning as BookingCategory
// above; a mixed booking (one rental item + one sale item) matches both.
export type BookingTypeFilter = "all" | BookingItemType;

export interface BookingItemSummary {
  item_code: string;
  name: string;
  item_type: "set" | "single";
  components: string[] | null;
  tracking_type: "unique" | "quantity";
  // For the thumbnail on each booking-item row — same items.photos array
  // the Items list itself uses, embedded in the same query as everything
  // else here (see ITEMS_EMBED in bookings.ts), not a separate fetch.
  photos: string[];
}

export interface BookingCustomerSummary {
  name: string;
  phone: string;
  // Gates the FOC checkbox in BookingForm/EditBookingForm — was missing
  // from this embed until the FOC task added it, which left
  // EditBookingForm no way to know a booking's real customer category.
  customer_type: CustomerType;
}

// Every item_charges row raised against a booking_item, resolved or not —
// a permanent record (unlike pending_components below, which disappears
// the moment a charge IS raised) so "this booking once had a lost/damaged
// item" stays visible even once the charge is fully settled.
export interface BookingItemCharge {
  id: string;
  description: string;
  charge_amount: number;
  resolved: boolean;
  charged_at: string;
  resolved_at: string | null;
}

export interface BookingChainLink {
  id: string;
  // Only present on future_booking_items (the "next" direction) — that's
  // the one direction anything actually links out to today.
  booking_id?: string;
  booking_code: string;
  customer_name: string | null;
  pickup_date: string;
}

// One line item within a family booking. "When Returns" chain fields are
// present on both GET /api/bookings and GET /api/bookings/:id — only for
// tracking_type = 'unique' items (§8 decision 5); a 'quantity' item always
// gets previous_booking_item: null / future_booking_items: [].
export interface BookingItem {
  id: string;
  booking_id: string;
  item_id: string;
  quantity_booked: number;
  type: BookingItemType;
  pickup_date: string;
  return_date: string | null;
  actual_pickup_date: string | null;
  actual_return_date: string | null;
  // Set only once confirm-pickup is actually submitted — null for anything
  // still 'booked' or undone via undo-pickup. name/phone are only ever
  // present alongside 'family'/'porter'; 'self' carries both as null.
  pickup_person_type: PickupPersonType | null;
  pickup_person_name: string | null;
  pickup_person_phone: string | null;
  status: BookingItemStatus;
  price_charged: number;
  // The real listed price stays here untouched even when is_foc is true —
  // it's a reference of what the item would have cost, never zeroed out.
  is_foc: boolean;
  deposit_amount: number;
  deposit_collected: boolean;
  deposit_refunded: boolean;
  deposit_refund_date: string | null;
  return_checklist: Record<string, boolean> | null;
  return_notes: string | null;
  custom_addons: string[];
  // Set only at the moment this item is cancelled (see the two cancel
  // endpoints in bookings.ts) — deliberately separate from the booking's
  // own `notes` field (internal-only, never shown on a receipt); this one
  // IS shown on the invoice for a cancelled item. Optional to provide, so
  // always null for anything not cancelled.
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  items: BookingItemSummary | null;
  previous_booking_item?: BookingChainLink | null;
  future_booking_items?: BookingChainLink[];
  // Computed server-side (bookings.ts's attachChains()), never stored —
  // true only for a rental still 'booked' whose pickup_date has already
  // passed. Always present on both GET /api/bookings and GET /:id.
  pickup_overdue: boolean;
  // Computed server-side (bookings.ts's attachPendingComponents()), never
  // stored — checklist entries left unchecked at return time with no
  // item_charges row raised against them. Empty unless status='returned'
  // and something's still genuinely outstanding. See lib/pendingItems.ts.
  pending_components: string[];
  // Computed server-side (bookings.ts's attachPendingComponents()), never
  // stored — every item_charges row for this line item, resolved or not.
  // See BookingItemCharge above for why this never goes away, unlike
  // pending_components.
  item_charges: BookingItemCharge[];
  // Not a DB column — present only when the backend has a non-blocking
  // heads-up for the operator (e.g. an incomplete return checklist).
  warning?: string;
}

// The parent/family transaction. total_paid/balance_due (from
// booking_financials) and computed_status/*_item_count (from
// booking_status) are merged in server-side at read time — never stored,
// same rule as everywhere else in this app.
export interface Booking {
  id: string;
  booking_code: string;
  // Unguessable identifier for the public /r/:token receipt view — never
  // the booking's own id and never the visible booking_code. See
  // 20260823010000_booking_share_token.sql.
  share_token: string;
  customer_id: string;
  gst_applicable: boolean;
  gst_invoice_number: string | null;
  hsn_code: string | null;
  tax_rate: number | null;
  created_by: string | null;
  // The date the booking was actually made — editable, distinct from
  // created_at (an untouched system timestamp). Defaults to today in IST
  // at creation but can be backdated/corrected afterward.
  booking_date: string;
  created_at: string;
  updated_at: string;
  // Free-text internal note on the whole transaction — editable at any
  // computed_status, never shown on the receipt/invoice (see ReceiptPage,
  // which never spreads this object). notes_updated_at is a dedicated
  // "last touched" timestamp, set only when notes itself changes — not the
  // generic updated_at above, which also moves on GST/booking_date edits.
  notes: string | null;
  notes_updated_at: string | null;
  customers: BookingCustomerSummary | null;
  booking_items: BookingItem[];
  total_paid: number;
  balance_due: number;
  price_charged: number;
  computed_status: BookingComputedStatus;
  active_item_count: number;
  resolved_item_count: number;
  warning?: string;
}

export interface NewBookingItem {
  type: BookingItemType;
  item_id: string;
  quantity_booked?: number;
  pickup_date: string;
  return_date?: string | null;
  price_charged: number;
  deposit_amount?: number;
  deposit_collected?: boolean;
  custom_addons?: string[];
  // Honored only when the booking's customer is MUA/Influencer — clamped
  // to false server-side otherwise, regardless of what's sent here.
  is_foc?: boolean;
}

export interface NewBooking {
  customer_id: string;
  gst_applicable: boolean;
  gst_invoice_number?: string | null;
  hsn_code?: string | null;
  tax_rate?: number | null;
  advance_amount?: number;
  advance_method?: PaymentMethod | null;
  // Left blank on purpose defaults to today in IST server-side (see
  // ReturnForm's actual_return_date for the same pattern) — the advance is
  // often actually paid on a different day than when the booking gets
  // entered.
  advance_date?: string | null;
  // Left blank on purpose defaults to today in IST server-side — same
  // pattern as advance_date above.
  booking_date?: string | null;
  items: NewBookingItem[];
  // Defaults to server-generated (BK-000N) when omitted/empty — an
  // explicit non-empty value is validated for uniqueness instead, same
  // editable-override pattern as items.ts's item_code.
  booking_code?: string | null;
}

export function fetchNextBookingCode() {
  return apiFetch<{ booking_code: string }>("/api/bookings/next-code");
}

export interface ItemConflict {
  index: number;
  item_id: string;
  error: string;
  conflicts?: unknown[];
}

// §8 decision 1: conflicts come back per-item-indexed, since a multi-item
// request can have more than one item conflict independently.
export type CreateBookingResult =
  | { type: "created"; booking: Booking }
  | { type: "conflict"; message: string; item_conflicts: ItemConflict[] };

export async function createBooking(input: NewBooking): Promise<CreateBookingResult> {
  try {
    const booking = await apiFetch<Booking>("/api/bookings", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { type: "created", booking };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const body = e.body as { error?: string; item_conflicts?: ItemConflict[] } | undefined;
      return { type: "conflict", message: body?.error ?? e.message, item_conflicts: body?.item_conflicts ?? [] };
    }
    throw e;
  }
}

export function fetchBookings(params?: {
  item_id?: string;
  customer_id?: string;
  computed_status?: BookingComputedStatus;
  search?: string;
  category?: BookingCategory;
  date_basis?: BookingDateBasis;
  time_range?: BookingTimeRange;
  type?: BookingTypeFilter;
}) {
  const qs = params ? new URLSearchParams(params as Record<string, string>).toString() : "";
  return apiFetch<Booking[]>(`/api/bookings${qs ? `?${qs}` : ""}`);
}

export function fetchBooking(id: string) {
  return apiFetch<Booking>(`/api/bookings/${id}`);
}

export interface ReturnCharge {
  description: string;
  amount: number;
}

export interface ReturnPayload {
  return_checklist: Record<string, boolean> | null;
  return_notes: string | null;
  actual_return_date: string | null;
  deposit_refunded: boolean | null;
  deposit_refund_date: string | null;
  // Lost-and-found: one item_charges + linked payments row per entry,
  // created server-side after the return itself succeeds.
  charges?: ReturnCharge[];
}

export function processReturn(bookingId: string, bookingItemId: string, payload: ReturnPayload) {
  return apiFetch<BookingItem>(`/api/bookings/${bookingId}/items/${bookingItemId}/return`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Payment fields are all optional together — omit amount (or send 0) to
// confirm pickup with nothing collected right now. When amount > 0, method
// is required (validated server-side before anything is written).
// pickup_person_type is required (validated server-side); name/phone are
// required alongside it only for 'family'/'porter'.
export interface ConfirmPickupPayload {
  amount?: number;
  method?: PaymentMethod;
  payment_date?: string | null;
  pickup_person_type: PickupPersonType;
  pickup_person_name?: string;
  pickup_person_phone?: string;
}

export function confirmPickup(bookingId: string, bookingItemId: string, payload: ConfirmPickupPayload) {
  return apiFetch<BookingItem>(`/api/bookings/${bookingId}/items/${bookingItemId}/confirm-pickup`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Reverses an accidental confirm-pickup — see the backend route's comment
// for why this stays scoped to status only and never touches payments.
export function undoPickup(bookingId: string, bookingItemId: string) {
  return apiFetch<BookingItem>(`/api/bookings/${bookingId}/items/${bookingItemId}/undo-pickup`, {
    method: "POST",
  });
}

export function addBookingItem(bookingId: string, item: NewBookingItem) {
  return apiFetch<BookingItem>(`/api/bookings/${bookingId}/items`, {
    method: "POST",
    body: JSON.stringify(item),
  });
}

// Two-step by design: removing an item that would leave the customer
// overpaid no longer blocks outright — the first call (no refundAmount)
// comes back as "refund_needed" with the exact amount, so the caller can
// show/edit it before confirming with a second call that passes it. Any
// other error (already returned/cancelled, etc.) still throws normally.
export type CancelItemResult =
  | { type: "cancelled"; item: BookingItem }
  | { type: "refund_needed"; message: string; refundAmountNeeded: number };

export async function cancelBookingItem(
  bookingId: string,
  bookingItemId: string,
  refundAmount?: number,
  reason?: string,
  refundMethod?: string,
): Promise<CancelItemResult> {
  try {
    const item = await apiFetch<BookingItem>(`/api/bookings/${bookingId}/items/${bookingItemId}/cancel`, {
      method: "POST",
      body: JSON.stringify({
        ...(refundAmount != null ? { refund_amount: refundAmount } : {}),
        ...(reason ? { reason } : {}),
        ...(refundMethod ? { refund_method: refundMethod } : {}),
      }),
    });
    return { type: "cancelled", item };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const body = e.body as { error?: string; refund_amount_needed?: number } | undefined;
      if (body?.refund_amount_needed != null) {
        return { type: "refund_needed", message: body.error ?? e.message, refundAmountNeeded: body.refund_amount_needed };
      }
    }
    throw e;
  }
}

// Whole-booking cancel (§8 decision 6) — loops the same remove-item
// mechanism across every still-active line item server-side, one refund
// for the whole booking rather than per item. refundAmount is always
// caller-supplied (pre-filled from the already-loaded booking.total_paid,
// editable) — no probe-first round trip needed the way single-item
// removal has, since the frontend already has that number.
export function cancelBooking(bookingId: string, refundAmount: number, reason?: string, refundMethod?: string) {
  return apiFetch<{ ok: true; cancelled_item_count: number }>(`/api/bookings/${bookingId}/cancel`, {
    method: "POST",
    body: JSON.stringify({
      refund_amount: refundAmount,
      ...(reason ? { reason } : {}),
      ...(refundMethod ? { refund_method: refundMethod } : {}),
    }),
  });
}

export interface UpdateBookingInput {
  customer_id?: string;
  booking_code?: string;
  gst_applicable?: boolean;
  gst_invoice_number?: string | null;
  hsn_code?: string | null;
  tax_rate?: number | null;
  booking_date?: string;
  notes?: string | null;
}

export function updateBooking(id: string, patch: UpdateBookingInput) {
  return apiFetch<Booking>(`/api/bookings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export interface UpdateBookingItemInput {
  pickup_date?: string;
  return_date?: string | null;
  price_charged?: number;
  quantity_booked?: number;
  deposit_amount?: number;
  deposit_collected?: boolean;
  custom_addons?: string[];
  // Editable only while the booking is still active — locked once
  // Completed (backend enforces this, not just hidden in the UI).
  is_foc?: boolean;
}

export function updateBookingItem(bookingId: string, bookingItemId: string, patch: UpdateBookingItemInput) {
  return apiFetch<BookingItem>(`/api/bookings/${bookingId}/items/${bookingItemId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
