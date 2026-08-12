import { apiFetch } from "./api";

// Nested straight through booking_items' own real FKs to items/bookings/
// customers (a genuine PostgREST embed, not a separate-queries-merge —
// unlike booking_financials/booking_status elsewhere in this app, nothing
// here is a computed view).
export interface ItemChargeBookingItem {
  pickup_date: string;
  items: { item_code: string; name: string } | null;
  bookings: { id: string; booking_code: string; customers: { name: string } | null } | null;
}

export interface ItemCharge {
  id: string;
  booking_item_id: string;
  description: string;
  charge_amount: number;
  charged_at: string;
  resolved: boolean;
  resolved_at: string | null;
  refund_amount: number | null;
  refund_payment_id: string | null;
  created_at: string;
  updated_at: string;
  booking_items: ItemChargeBookingItem | null;
}

// resolved defaults to false server-side when omitted — this is the
// "still outstanding, across every booking" universal view.
export function fetchItemCharges(resolved = false) {
  return apiFetch<ItemCharge[]>(`/api/item-charges?resolved=${resolved}`);
}

export function resolveItemCharge(id: string, refundAmount: number) {
  return apiFetch<ItemCharge>(`/api/item-charges/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ refund_amount: refundAmount }),
  });
}
