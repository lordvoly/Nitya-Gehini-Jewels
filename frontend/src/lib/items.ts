import { apiFetch } from "./api";

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
  created_at: string;
  updated_at: string;
}

export interface NewItem {
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

export function fetchItems() {
  return apiFetch<Item[]>("/api/items");
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

export async function uploadItemPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("photo", file);
  const { url } = await apiFetch<{ url: string }>("/api/items/photos", {
    method: "POST",
    body: form,
  });
  return url;
}
