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
// booking_financials) and computed_status/*_item_count (from
// booking_status) are merged in server-side at read time — never stored,
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
