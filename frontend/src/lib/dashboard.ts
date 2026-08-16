import { apiFetch } from "./api";
import type { BookingCustomerSummary, BookingItemSummary, BookingItemStatus, BookingItemType } from "./bookings";

// Both rows below are now booking_items-grain, not Booking-grain — "due
// today" / "overdue" are inherently per-item concepts once a family
// booking can have several items on different schedules (§8).

export interface DueTodayBookingItem {
  id: string;
  booking_id: string;
  item_id: string;
  quantity_booked: number;
  type: BookingItemType;
  pickup_date: string;
  return_date: string | null;
  actual_return_date: string | null;
  status: BookingItemStatus;
  price_charged: number;
  bookings: { booking_code: string; customer_id: string } | null;
  items: BookingItemSummary | null;
  customers: BookingCustomerSummary | null;
}

export interface OverdueBookingItem {
  id: string;
  booking_id: string;
  item_id: string;
  quantity_booked: number;
  type: BookingItemType;
  pickup_date: string;
  return_date: string | null;
  status: BookingItemStatus;
  booking_code: string;
  customer_id: string;
  items: { item_code: string; name: string } | null;
  customers: { name: string; phone: string } | null;
  balance_due: number;
  days_until_return: number;
  next_booking_code: string | null;
  next_customer_name: string | null;
  next_pickup_date: string | null;
  next_customer_waiting: boolean;
}

export interface DashboardStats {
  items_in_catalog: number;
  items_retired: number;
  items_out: number;
  // The subset of items_out that's a rental past its pickup_date but never
  // confirmed via Confirm Pickup — reported separately so the tile can show
  // a breakdown instead of one ambiguous combined number (see itemsData.ts
  // for why items_out itself still includes these).
  items_needs_confirmation: number;
  total_customers: number;
  bookings_this_week: number;
}

// "Prep in advance" rows — status='booked' only (not yet picked up/
// confirmed), both rental and sale, deliberately excluding the overdue/
// unconfirmed concept (a different, already-flagged idea for later). items
// carries photos (BookingItemSummary already includes it, from the recent
// Item Detail thumbnail work) for the row's thumbnail — same field, no new
// per-row fetch.
export interface PickupDueBookingItem {
  id: string;
  booking_id: string;
  item_id: string;
  quantity_booked: number;
  type: BookingItemType;
  pickup_date: string;
  status: BookingItemStatus;
  price_charged: number;
  bookings: { booking_code: string; customer_id: string } | null;
  items: BookingItemSummary | null;
  customers: BookingCustomerSummary | null;
}

export interface DashboardSummary {
  // Server IST date (see backend/src/routes/dashboard.ts) — used only to key
  // the once-per-day dashboard-popup dismissal, never computed locally.
  today: string;
  due_today: DueTodayBookingItem[];
  overdue: OverdueBookingItem[];
  pickups_due_today: PickupDueBookingItem[];
  // Strictly AFTER today through the end of the current calendar week (IST)
  // — today's own pickups are only in pickups_due_today, never duplicated
  // here.
  pickups_due_this_week: PickupDueBookingItem[];
  outstanding_balance: number;
  outstanding_balance_count: number;
  stats: DashboardStats;
}

export function fetchDashboardSummary() {
  return apiFetch<DashboardSummary>("/api/dashboard/summary");
}
