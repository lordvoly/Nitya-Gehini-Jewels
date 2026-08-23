import { apiFetch } from "./api";

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
  custom_addons: string[];
  deposit: { amount: number; refunded: boolean; refund_date: string | null } | null;
}

export interface PublicReceipt {
  shop: { name: string; address: string | null; phone: string | null };
  booking_code: string;
  created_at: string;
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
