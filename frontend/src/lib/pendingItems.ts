import { apiFetch } from "./api";

// A checklist entry (a set's own component, or a booking's one-off custom
// addon) left unchecked at return time with no item_charges row ever
// raised against it — the earlier, purely physical-custody stage that
// never became a financial matter. Distinct from ItemCharge
// (lib/itemCharges.ts) — once something IS charged for, it moves there
// instead and drops out of this list entirely.
export interface PendingItem {
  booking_id: string;
  booking_code: string;
  customer_id: string;
  customer_name: string;
  booking_item_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  component_name: string;
  actual_return_date: string | null;
  return_notes: string | null;
}

export function fetchPendingItems() {
  return apiFetch<PendingItem[]>("/api/pending-items");
}

// The item physically came back after all — flips just that one checklist
// entry back to true, no money involved.
export function resolvePendingItem(bookingId: string, bookingItemId: string, componentName: string) {
  return apiFetch(`/api/bookings/${bookingId}/items/${bookingItemId}/resolve-pending-item`, {
    method: "POST",
    body: JSON.stringify({ component_name: componentName }),
  });
}

// The shop has decided to stop chasing this and charge for it instead —
// moves it out of this list and into the ordinary Outstanding Charges one.
export function chargePendingItem(bookingId: string, bookingItemId: string, componentName: string, amount: number) {
  return apiFetch(`/api/bookings/${bookingId}/items/${bookingItemId}/charge-pending-item`, {
    method: "POST",
    body: JSON.stringify({ component_name: componentName, amount }),
  });
}
