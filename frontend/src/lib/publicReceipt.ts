import { apiFetch } from "./api";
import type { PickupPersonType } from "./bookings";

// Mirrors backend/src/routes/publicReceipt.ts's explicit whitelist exactly
// — this is a deliberately narrower shape than Booking (lib/bookings.ts),
// not a subset picked out of it client-side. No id, no notes, no payment
// history, no phone numbers; an FOC item's price_charged arrives already
// nulled out by the backend.
export interface PublicReceiptItem {
  item_code: string | null;
  name: string | null;
  type: "rental" | "sale";
  pickup_date: string;
  return_date: string | null;
  status: "booked" | "out" | "returned" | "cancelled";
  price_charged: number | null;
  is_foc: boolean;
  quantity_booked: number;
  components: string[];
  custom_addons: string[];
  // Only ever present for status === 'cancelled' — see BookingItem's own
  // cancellation_reason in lib/bookings.ts.
  cancellation_reason: string | null;
  deposit: { amount: number; refunded: boolean; refund_date: string | null } | null;
  // Only present once pickup is actually confirmed — see BookingItem's own
  // pickup_person_* fields in lib/bookings.ts. Unlike the customer's own
  // phone (deliberately excluded from this whole shape), the backend keeps
  // this one in — it's the paper trail this feature exists to put on the
  // invoice, not the customer's own contact info.
  pickup_person_type: PickupPersonType | null;
  pickup_person_name: string | null;
  pickup_person_phone: string | null;
}

export interface PublicReceipt {
  shop: { name: string; address: string | null; phone: string | null };
  booking_code: string;
  booking_date: string;
  customer_name: string | null;
  items: PublicReceiptItem[];
  total_paid: number;
  balance_due: number;
  price_charged: number;
}

// apiFetch attaches an auth header only when a Supabase session actually
// exists — for a signed-out visitor that resolves to no header at all, so
// this reuses the same client rather than a bespoke fetch call. The
// backend route ignores auth entirely either way.
export function fetchPublicReceipt(token: string) {
  return apiFetch<PublicReceipt>(`/api/public/receipt/${token}`);
}
