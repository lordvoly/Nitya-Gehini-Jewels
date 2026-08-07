import { apiFetch } from "./api";

export interface ReportsSummary {
  total_bookings: number;
  rental_count: number;
  sale_count: number;
  total_revenue: number;
}

export interface MostBookedItem {
  item_id: string;
  item_code: string;
  name: string;
  booking_count: number;
}

export interface RepeatCustomer {
  customer_id: string;
  name: string;
  phone: string;
  booking_count: number;
  total_spend: number;
}

export interface IdleInventoryItem {
  id: string;
  item_code: string;
  name: string;
  category: string;
}

// What GET /api/reports returns. `period` echoes back the from/to actually
// used (defaulted server-side to this IST calendar month when omitted) so
// the frontend never has to compute "today"/"this month" itself — it just
// displays whatever the backend resolved.
export interface ReportsResponse {
  period: { from: string; to: string };
  include_collabs: boolean;
  summary: ReportsSummary;
  most_booked_items: MostBookedItem[];
  repeat_customers: RepeatCustomer[];
  idle_inventory: IdleInventoryItem[];
}

export function fetchReports(params?: { from?: string; to?: string; includeCollabs?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.includeCollabs) qs.set("include_collabs", "true");
  const query = qs.toString();
  return apiFetch<ReportsResponse>(`/api/reports${query ? `?${query}` : ""}`);
}
