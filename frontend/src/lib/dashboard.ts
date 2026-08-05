import { apiFetch } from "./api";
import type { Booking, BookingCustomerSummary, BookingItemSummary } from "./bookings";

export interface DueTodayBooking extends Booking {
  items: BookingItemSummary | null;
  customers: BookingCustomerSummary | null;
}

export interface OverdueBooking extends Booking {
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
  total_active_items: number;
  items_out: number;
  total_customers: number;
  bookings_this_week: number;
}

export interface DashboardSummary {
  due_today: DueTodayBooking[];
  overdue: OverdueBooking[];
  outstanding_balance: number;
  stats: DashboardStats;
}

export function fetchDashboardSummary() {
  return apiFetch<DashboardSummary>("/api/dashboard/summary");
}
