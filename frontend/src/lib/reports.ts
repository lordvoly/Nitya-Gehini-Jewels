import { apiFetch } from "./api";
import type { PaymentMethod } from "./payments";

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

export type RevenueTrendGranularity = "day" | "week" | "month" | "year";

export interface RevenueTrendPoint {
  // The bucket's own start date (ISO) — a day bucket is itself, a week
  // bucket is its Monday, a month bucket is its 1st, a year bucket is its
  // Jan 1. Formatted into a display label client-side; the backend never
  // sends a separately-computed label.
  bucket: string;
  revenue: number;
}

export interface RevenueTrend {
  granularity: RevenueTrendGranularity;
  points: RevenueTrendPoint[];
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

export interface PaymentMethodTotal {
  method: PaymentMethod;
  amount: number;
  count: number;
}

// Genuine money received this period, split by how it came in — scoped by
// payment_date (when it was actually collected), not the same [from, to]
// meaning as pickup-date-scoped figures above, though it uses the same
// resolved period. Refunds and lost/damaged-item charge adjustments are
// excluded — see getPaymentMethodBreakdown's own comment in reportsData.ts.
export interface PaymentMethodBreakdown {
  total: number;
  by_method: PaymentMethodTotal[];
}

// A current-state snapshot, NOT scoped to the report's date range — same
// "not scoped to the date filter" treatment as repeat_customers.
export interface OutstandingDue {
  booking_id: string;
  booking_code: string;
  customer_id: string | null;
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
  revenue_trend: RevenueTrend;
  repeat_customers: RepeatCustomer[];
  idle_inventory: IdleInventoryItem[];
  pnl: Pnl;
  outstanding_dues: OutstandingDue[];
  payment_methods: PaymentMethodBreakdown;
}

// `range` (a quick-select preset) and `from`/`to` (the calendar pickers)
// are mutually exclusive on any one call — the caller picks one path, the
// backend resolves explicit from+to over range if somehow both are sent.
export function fetchReports(params?: { from?: string; to?: string; range?: string; includeCollabs?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.range) qs.set("range", params.range);
  if (params?.includeCollabs) qs.set("include_collabs", "true");
  const query = qs.toString();
  return apiFetch<ReportsResponse>(`/api/reports${query ? `?${query}` : ""}`);
}
