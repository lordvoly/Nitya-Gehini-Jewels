import { apiFetch } from "./api";

export interface ShopSettings {
  id: true;
  name: string;
  address: string;
  phone: string;
  // The birthday/anniversary WhatsApp greeting's discount percentage —
  // editable here rather than hardcoded in the message template.
  occasion_discount_percent: number;
  updated_at: string;
}

export interface ShopSettingsPatch {
  name?: string;
  address?: string;
  phone?: string;
  occasion_discount_percent?: number;
}

export function fetchShopSettings() {
  return apiFetch<ShopSettings>("/api/shop-settings");
}

export function updateShopSettings(patch: ShopSettingsPatch) {
  return apiFetch<ShopSettings>("/api/shop-settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
