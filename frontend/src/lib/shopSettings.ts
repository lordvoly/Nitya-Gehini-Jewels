import { apiFetch } from "./api";

export interface ShopSettings {
  id: true;
  name: string;
  address: string;
  phone: string;
  updated_at: string;
}

export interface ShopSettingsPatch {
  name?: string;
  address?: string;
  phone?: string;
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
