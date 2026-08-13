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

export interface PnlCategoryTotal {
  category: string;
  amount: number;
}

// Scoped to the same [from, to] range as summary/most_booked_items —
// revenue is the same figure as summary.total_revenue, just surfaced again
// here alongside expenses/net for the P&L section.
export interface Pnl {
  revenue: number;
  expenses: number;
  net: number;
  by_category: PnlCategoryTotal[];
}

// A current-state snapshot, NOT scoped to the report's date range — same
// "not scoped to the date filter" treatment as repeat_customers.
export interface OutstandingDue {
  booking_id: string;
  booking_code: string;
  customer_name: string;
  balance_due: number;
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
  pnl: Pnl;
  outstanding_dues: OutstandingDue[];
}

export function fetchReports(params?: { from?: string; to?: string; includeCollabs?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.includeCollabs) qs.set("include_collabs", "true");
  const query = qs.toString();
  return apiFetch<ReportsResponse>(`/api/reports${query ? `?${query}` : ""}`);
}
