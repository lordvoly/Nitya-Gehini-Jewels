import { apiFetch, ApiError } from "./api";

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
  created_at: string;
  updated_at: string;
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
  return apiFetch<Booking[]>(`/api/bookings${qs ? `?${qs}` : ""}`);
}
