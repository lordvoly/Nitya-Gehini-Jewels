import { apiFetch, ApiError } from "./api";
import type { PaymentMethod } from "./payments";

// ── Real types (Checkpoint b/§8 design) ─────────────────────────────────

export type BookingItemType = "rental" | "sale";
export type BookingType = BookingItemType; // same meaning, now per-item
export type BookingItemStatus = "booked" | "out" | "returned" | "cancelled";
export type BookingComputedStatus = "active" | "completed" | "cancelled";

export interface BookingItemSummary {
  item_code: string;
  name: string;
  item_type: "set" | "single";
  components: string[] | null;
  tracking_type: "unique" | "quantity";
}

export interface BookingCustomerSummary {
  name: string;
  phone: string;
}

export interface BookingChainLink {
  id: string;
  booking_code: string;
  customer_name: string | null;
  pickup_date: string;
}

// One line item within a family booking. "When Returns" chain fields are
// only present on the GET /api/bookings/:id response, only for
// tracking_type = 'unique' items (§8 decision 5).
export interface BookingItem {
  id: string;
  booking_id: string;
  item_id: string;
  quantity_booked: number;
  type: BookingItemType;
  pickup_date: string;
  return_date: string | null;
  actual_return_date: string | null;
  status: BookingItemStatus;
  price_charged: number;
  deposit_amount: number;
  deposit_collected: boolean;
  deposit_refunded: boolean;
  deposit_refund_date: string | null;
  return_checklist: Record<string, boolean> | null;
  return_notes: string | null;
  custom_addons: string[];
  created_at: string;
  updated_at: string;
  items: BookingItemSummary | null;
  previous_booking_item?: BookingChainLink | null;
  future_booking_items?: BookingChainLink[];
  // Not a DB column — present only when the backend has a non-blocking
  // heads-up for the operator (e.g. an incomplete return checklist).
  warning?: string;
}

// The parent/family transaction. total_paid/balance_due (from
// booking_financials_v2) and computed_status/*_item_count (from
// booking_status_v2) are merged in server-side at read time — never stored,
// same rule as everywhere else in this app.
export interface Booking {
  id: string;
  booking_code: string;
  customer_id: string;
  gst_applicable: boolean;
  gst_invoice_number: string | null;
  hsn_code: string | null;
  tax_rate: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
}

export interface NewBooking {
  customer_id: string;
  gst_applicable: boolean;
  gst_invoice_number?: string | null;
  hsn_code?: string | null;
  tax_rate?: number | null;
  advance_amount?: number;
  advance_method?: PaymentMethod | null;
  items: NewBookingItem[];
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
}) {
  const qs = params ? new URLSearchParams(params as Record<string, string>).toString() : "";
  return apiFetch<Booking[]>(`/api/bookings${qs ? `?${qs}` : ""}`);
}

export function fetchBooking(id: string) {
  return apiFetch<Booking>(`/api/bookings/${id}`);
}

export interface ReturnPayload {
  return_checklist: Record<string, boolean> | null;
  return_notes: string | null;
  actual_return_date: string | null;
  deposit_refunded: boolean | null;
  deposit_refund_date: string | null;
}

export function processReturn(bookingId: string, itemId: string, payload: ReturnPayload) {
  return apiFetch<BookingItem>(`/api/bookings/${bookingId}/items/${itemId}/return`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addBookingItem(bookingId: string, item: NewBookingItem) {
  return apiFetch<BookingItem>(`/api/bookings/${bookingId}/items`, {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function cancelBookingItem(bookingId: string, itemId: string) {
  return apiFetch<BookingItem>(`/api/bookings/${bookingId}/items/${itemId}/cancel`, {
    method: "POST",
  });
}

export interface UpdateBookingInput {
  customer_id?: string;
  gst_applicable?: boolean;
  gst_invoice_number?: string | null;
  hsn_code?: string | null;
  tax_rate?: number | null;
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
}

export function updateBookingItem(bookingId: string, itemId: string, patch: UpdateBookingItemInput) {
  return apiFetch<BookingItem>(`/api/bookings/${bookingId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// LEGACY BRIDGE — Checkpoint (b) only, DELETE IN CHECKPOINT (c).
// BookingForm.tsx, BookingsList.tsx, BookingDetail.tsx, ReturnForm.tsx, and
// BookingsPage.tsx still assume the pre-migration one-booking-equals-one-item
// shape — their real rewrite (repeatable line items, card-per-booking list,
// per-item chain/actions) is Checkpoint (c)'s job, not this one. These
// adapters flatten the new nested API onto that old shape so the app keeps
// building and working (single-item bookings only, exactly what those
// screens exposed before) in the meantime. Every export below exists only
// to keep those five files' *existing* code compiling unchanged — nothing
// here should gain new callers.
// ─────────────────────────────────────────────────────────────────────────

export type LegacyBookingItemStatus = BookingItemStatus | "completed";

export interface LegacyFlatBooking {
  id: string; // parent booking id — matches the old single-row id semantics
  booking_item_id: string; // the one underlying booking_items row
  booking_code: string;
  type: BookingItemType;
  item_id: string;
  quantity_booked: number;
  customer_id: string;
  pickup_date: string;
  return_date: string | null;
  actual_return_date: string | null;
  status: LegacyBookingItemStatus;
  price_charged: number;
  deposit_amount: number;
  deposit_collected: boolean;
  deposit_refunded: boolean;
  deposit_refund_date: string | null;
  gst_applicable: boolean;
  gst_invoice_number: string | null;
  hsn_code: string | null;
  tax_rate: number | null;
  return_checklist: Record<string, boolean> | null;
  return_notes: string | null;
  custom_addons: string[];
  created_at: string;
  updated_at: string;
  warning?: string;
}

export interface LegacyFlatBookingWithDetails extends LegacyFlatBooking {
  items: BookingItemSummary | null;
  customers: BookingCustomerSummary | null;
  total_paid: number;
  balance_due: number;
}

export interface LegacyFlatBookingDetail extends LegacyFlatBookingWithDetails {
  future_bookings: BookingChainLink[];
  previous_booking: BookingChainLink | null;
}

export interface ConflictingBooking {
  id: string;
  booking_code: string;
  pickup_date: string;
  return_date: string | null;
  customers?: { name: string } | null;
}

function flattenFirstItem(b: Booking): LegacyFlatBookingWithDetails | null {
  const bi = b.booking_items[0];
  if (!bi) return null;
  return {
    id: b.id,
    booking_item_id: bi.id,
    booking_code: b.booking_code,
    type: bi.type,
    item_id: bi.item_id,
    quantity_booked: bi.quantity_booked,
    customer_id: b.customer_id,
    pickup_date: bi.pickup_date,
    return_date: bi.return_date,
    actual_return_date: bi.actual_return_date,
    status: bi.status,
    price_charged: bi.price_charged,
    deposit_amount: bi.deposit_amount,
    deposit_collected: bi.deposit_collected,
    deposit_refunded: bi.deposit_refunded,
    deposit_refund_date: bi.deposit_refund_date,
    gst_applicable: b.gst_applicable,
    gst_invoice_number: b.gst_invoice_number,
    hsn_code: b.hsn_code,
    tax_rate: b.tax_rate,
    return_checklist: bi.return_checklist,
    return_notes: bi.return_notes,
    custom_addons: bi.custom_addons,
    created_at: bi.created_at,
    updated_at: bi.updated_at,
    items: bi.items,
    customers: b.customers,
    total_paid: b.total_paid,
    balance_due: b.balance_due,
  };
}

export type LegacyCreateBookingResult =
  | { type: "created"; booking: LegacyFlatBooking }
  | { type: "conflict"; message: string; conflicts: ConflictingBooking[] | null };

export interface NewLegacyBooking {
  type: BookingItemType;
  item_id: string;
  quantity_booked: number;
  customer_id: string;
  pickup_date: string;
  return_date: string | null;
  price_charged: number;
  deposit_amount: number;
  deposit_collected: boolean;
  gst_applicable: boolean;
  gst_invoice_number: string | null;
  hsn_code: string | null;
  tax_rate: number | null;
  advance_amount: number;
  advance_method: PaymentMethod | null;
  custom_addons: string[];
}

export async function createLegacyBooking(input: NewLegacyBooking): Promise<LegacyCreateBookingResult> {
  const result = await createBooking({
    customer_id: input.customer_id,
    gst_applicable: input.gst_applicable,
    gst_invoice_number: input.gst_invoice_number,
    hsn_code: input.hsn_code,
    tax_rate: input.tax_rate,
    advance_amount: input.advance_amount,
    advance_method: input.advance_method,
    items: [
      {
        type: input.type,
        item_id: input.item_id,
        quantity_booked: input.quantity_booked,
        pickup_date: input.pickup_date,
        return_date: input.return_date,
        price_charged: input.price_charged,
        deposit_amount: input.deposit_amount,
        deposit_collected: input.deposit_collected,
        custom_addons: input.custom_addons,
      },
    ],
  });
  if (result.type === "conflict") {
    const first = result.item_conflicts[0];
    return {
      type: "conflict",
      message: first?.error ?? result.message,
      conflicts: (first?.conflicts as ConflictingBooking[] | undefined) ?? null,
    };
  }
  const flat = flattenFirstItem(result.booking);
  if (!flat) throw new Error("Booking created with no items");
  return { type: "created", booking: { ...flat, warning: result.booking.warning } };
}

export function fetchLegacyBookings(): Promise<LegacyFlatBookingWithDetails[]> {
  return fetchBookings().then((bookings) =>
    bookings.map(flattenFirstItem).filter((b): b is LegacyFlatBookingWithDetails => b !== null),
  );
}

export async function fetchLegacyBooking(id: string): Promise<LegacyFlatBookingDetail> {
  const b = await fetchBooking(id);
  const flat = flattenFirstItem(b);
  if (!flat) throw new Error("Booking has no items");
  const bi = b.booking_items[0];
  return {
    ...flat,
    future_bookings: bi.future_booking_items ?? [],
    previous_booking: bi.previous_booking_item ?? null,
  };
}

export async function processLegacyReturn(
  booking: LegacyFlatBooking,
  payload: ReturnPayload,
): Promise<LegacyFlatBooking> {
  const updatedItem = await processReturn(booking.id, booking.booking_item_id, payload);
  return {
    ...booking,
    status: updatedItem.status,
    actual_return_date: updatedItem.actual_return_date,
    return_checklist: updatedItem.return_checklist,
    return_notes: updatedItem.return_notes,
    deposit_refunded: updatedItem.deposit_refunded,
    deposit_refund_date: updatedItem.deposit_refund_date,
    warning: updatedItem.warning,
  };
}
