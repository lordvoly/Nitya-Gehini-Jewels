import { apiFetch } from "./api";
import type { BookingItemStatus, BookingItemType } from "./bookings";

export type ItemCategory = "Bridal Set" | "Party Wear" | "Individual" | "American Diamond" | "Temple" | "Other";
export type ItemType = "set" | "single";
export type TrackingType = "unique" | "quantity";
export type ItemStatus = "available" | "rented_out" | "sold" | "in_maintenance";

export const ITEM_CATEGORIES: ItemCategory[] = [
  "Bridal Set",
  "Party Wear",
  "Individual",
  "American Diamond",
  "Temple",
  "Other",
];

export const ITEM_STATUSES: ItemStatus[] = ["available", "rented_out", "sold", "in_maintenance"];

export interface Item {
  id: string;
  item_code: string;
  name: string;
  category: ItemCategory;
  item_type: ItemType;
  components: string[] | null;
  tracking_type: TrackingType;
  quantity_on_hand: number | null;
  status: ItemStatus;
  rental_price: number | null;
  sale_price: number | null;
  security_deposit_default: number | null;
  current_location: string | null;
  photos: string[];
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Computed live from active rental booking_items, never stored (a unique
  // item's own `status` is deliberately never flipped for rentals or on
  // pickup confirmation — see backend/src/lib/itemsData.ts). Only
  // GET /api/items (the list) includes these; single-item write responses
  // (create/update/retire/reactivate) don't recompute them, so treat a
  // missing value as "false" rather than as an authoritative answer.
  // Mutually exclusive per active rental: currently_out means pickup was
  // explicitly confirmed (Confirm Pickup); pickup_overdue means pickup day
  // has already arrived but nobody confirmed it yet — a distinct "needs a
  // look" state, not folded into currently_out; currently_booked means
  // it's reserved but pickup day hasn't arrived. An item with more than one
  // active rental could show more than one of these at once.
  currently_out?: boolean;
  pickup_overdue?: boolean;
  currently_booked?: boolean;
}

export interface NewItem {
  // Optional: the add-item wizard pre-fills this with the server-suggested
  // next code but lets it be edited. Omitted/empty falls back to the
  // backend's own auto-generation (see items.ts's POST / handler).
  item_code?: string | null;
  name: string;
  category: ItemCategory;
  item_type: ItemType;
  components: string[] | null;
  tracking_type: TrackingType;
  quantity_on_hand: number | null;
  status: ItemStatus;
  rental_price: number | null;
  sale_price: number | null;
  security_deposit_default: number | null;
  current_location: string | null;
  photos: string[];
  notes: string | null;
}

// activeOnly: true is for the booking item-picker, which must never offer a
// retired item. The general items management list calls this with no
// argument — retired items stay visible there (just visually marked).
export function fetchItems(opts?: { activeOnly?: boolean }) {
  return apiFetch<Item[]>(`/api/items${opts?.activeOnly ? "?active_only=true" : ""}`);
}

export function fetchItem(id: string) {
  return apiFetch<Item>(`/api/items/${id}`);
}

// One row per booking this item has ever appeared in — active AND
// cancelled (Item Detail's history table, unlike the "When Returns" chain
// used elsewhere, which deliberately excludes cancelled rows). pickup_date/
// return_date are the planned dates on that line item, not necessarily
// when it actually happened.
export interface ItemHistoryRow {
  id: string;
  type: BookingItemType;
  status: BookingItemStatus;
  pickup_date: string;
  return_date: string | null;
  price_charged: number;
  is_foc: boolean;
  booking_id: string;
  booking_code: string | null;
  customer_name: string | null;
  pickup_overdue: boolean;
}

export function fetchItemHistory(id: string) {
  return apiFetch<ItemHistoryRow[]>(`/api/items/${id}/history`);
}

// The suggested next auto-generated code — used to pre-fill the (editable)
// item_code field in the add-item wizard. Doesn't reserve anything.
export function fetchNextItemCode() {
  return apiFetch<{ item_code: string }>("/api/items/next-code");
}

export function createItem(item: NewItem) {
  return apiFetch<Item>("/api/items", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function updateItem(id: string, item: NewItem) {
  return apiFetch<Item>(`/api/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(item),
  });
}

export function deleteItem(id: string) {
  return apiFetch<{ ok: true }>(`/api/items/${id}`, { method: "DELETE" });
}

export function retireItem(id: string) {
  return apiFetch<Item>(`/api/items/${id}/retire`, { method: "POST" });
}

export function reactivateItem(id: string) {
  return apiFetch<Item>(`/api/items/${id}/reactivate`, { method: "POST" });
}

export async function uploadItemPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("photo", file);
  const { url } = await apiFetch<{ url: string }>("/api/items/photos", {
    method: "POST",
    body: form,
  });
  return url;
}
