import { apiFetch, ApiError } from "./api";
import type { PaymentMethod } from "./payments";

export type BookingType = "rental" | "sale";
export type BookingStatus = "booked" | "out" | "returned" | "completed" | "cancelled";

export interface Booking {
  id: string;
  booking_code: string;
  type: BookingType;
  item_id: string;
  quantity_booked: number;
  customer_id: string;
  pickup_date: string;
  return_date: string | null;
  actual_return_date: string | null;
  status: BookingStatus;
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
  // Free-text extras added at booking time, separate from and never
  // modifying the item's own components template. Combined with
  // items.components (for set items) into return_checklist at return time.
  custom_addons: string[];
  created_at: string;
  updated_at: string;
  // Not a DB column — present only when the backend has a non-blocking
  // heads-up for the operator (e.g. same-day turnover on this item).
  warning?: string;
}

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

// What GET /api/bookings actually returns — the plain fields plus the
// item/customer embeds needed to display a list without N+1 fetches, plus
// total_paid/balance_due merged in from the booking_financials view
// (computed at read time server-side, never stored on the booking).
export interface BookingWithDetails extends Booking {
  items: BookingItemSummary | null;
  customers: BookingCustomerSummary | null;
  total_paid: number;
  balance_due: number;
}

export interface ConflictingBooking {
  id: string;
  booking_code: string;
  pickup_date: string;
  return_date: string | null;
  customers?: { name: string } | null;
}

export interface NewBooking {
  type: BookingType;
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
  // Optional advance received at booking time — not a separate concept from
  // a normal payment, just recorded as one (in the same payments table) once
  // the booking itself has saved. Zero/omitted records nothing.
  advance_amount: number;
  advance_method: PaymentMethod | null;
  // Optional free-text extras for this booking only — never written to
  // items.components. Empty by default.
  custom_addons: string[];
}

export type CreateBookingResult =
  | { type: "created"; booking: Booking }
  | { type: "conflict"; message: string; conflicts: ConflictingBooking[] | null };

// Conflict detection (overlapping unique-item rental, oversold quantity)
// happens server-side and comes back as a 409 with a message — and for
// unique-item date conflicts, the conflicting booking(s) themselves — so
// the form can show *why*, not just fail silently.
export async function createBooking(input: NewBooking): Promise<CreateBookingResult> {
  try {
    const booking = await apiFetch<Booking>("/api/bookings", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { type: "created", booking };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const body = e.body as { error?: string; conflicts?: ConflictingBooking[] } | undefined;
      return { type: "conflict", message: body?.error ?? e.message, conflicts: body?.conflicts ?? null };
    }
    throw e;
  }
}

export function fetchBookings(params?: { item_id?: string; customer_id?: string; status?: string }) {
  const qs = params ? new URLSearchParams(params).toString() : "";
  return apiFetch<BookingWithDetails[]>(`/api/bookings${qs ? `?${qs}` : ""}`);
}

export interface ReturnPayload {
  return_checklist: Record<string, boolean> | null;
  return_notes: string | null;
  actual_return_date: string | null;
  deposit_refunded: boolean | null;
  deposit_refund_date: string | null;
}

export function processReturn(bookingId: string, payload: ReturnPayload) {
  return apiFetch<Booking>(`/api/bookings/${bookingId}/return`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface BookingChainLink {
  id: string;
  booking_code: string;
  customer_name: string;
  pickup_date: string;
}

// What GET /api/bookings/:id returns — the booking plus the "When Returns"
// chain for the same item, fully computed server-side each time, never
// stored. previous_booking is the single immediate-previous booking;
// future_bookings is the FULL forward chain (every later, non-cancelled
// booking on this item, in pickup_date order) — not just the immediate
// next — so an empty array is a meaningful "nothing booked ahead", not a
// loading state.
export interface BookingDetail extends Booking {
  items: BookingItemSummary | null;
  customers: BookingCustomerSummary | null;
  future_bookings: BookingChainLink[];
  previous_booking: BookingChainLink | null;
  // Merged in from booking_financials, same as BookingWithDetails above —
  // computed at read time, never stored.
  total_paid: number;
  balance_due: number;
}

export function fetchBooking(id: string) {
  return apiFetch<BookingDetail>(`/api/bookings/${id}`);
}
