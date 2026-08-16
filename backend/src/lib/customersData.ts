import { supabase } from "./supabase.js";

// Strips everything but digits, then keeps only the last 10 — so a leading
// country code (+91, 0091, a bare 91) doesn't make the same real number look
// like a different one. Indian mobile numbers are 10 digits; shorter/partial
// search terms are returned unchanged since slice(-10) is a no-op under 10
// chars, so this doesn't affect partial-phone search.
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

// Extracted out of GET /api/customers?search= — the exact same
// name/phone/phone_secondary lookup CustomersList and BookingForm's
// CustomerPicker already use (and now the AI assistant's
// get_customer_history tool), so a customer resolves the same way no
// matter which of those three callers is asking. Separate queries + merge,
// not one .or() filter, so a term containing a comma or parenthesis can't
// break PostgREST's filter syntax.
export async function searchCustomers(term: string) {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const digits = normalizePhone(trimmed);
  const [byName, byPhone, byPhoneSecondary] = await Promise.all([
    supabase.from("customers").select("*").ilike("name", `%${trimmed}%`),
    digits ? supabase.from("customers").select("*").ilike("phone", `%${digits}%`) : Promise.resolve({ data: [], error: null }),
    digits ? supabase.from("customers").select("*").ilike("phone_secondary", `%${digits}%`) : Promise.resolve({ data: [], error: null }),
  ]);
  if (byName.error) throw byName.error;
  if (byPhone.error) throw byPhone.error;
  if (byPhoneSecondary.error) throw byPhoneSecondary.error;

  const merged = new Map<string, (typeof byName.data)[number]>();
  for (const c of [...(byName.data ?? []), ...(byPhone.data ?? []), ...(byPhoneSecondary.data ?? [])]) merged.set(c.id, c);
  return Array.from(merged.values()).sort((a, b) => (b.created_at as string).localeCompare(a.created_at));
}

interface HistoryBookingItem {
  item_code: string | null;
  name: string | null;
  type: "rental" | "sale";
  status: string;
  pickup_date: string;
  return_date: string | null;
}

export interface CustomerHistoryBooking {
  booking_id: string;
  booking_code: string;
  created_at: string;
  // Computed from booking_items via the booking_status view (never a
  // stored column) — 'active'/'completed'/'cancelled', the same three
  // values BookingsList's own status logic already resolves to.
  computed_status: "active" | "completed" | "cancelled";
  price_charged: number;
  total_paid: number;
  balance_due: number;
  items: HistoryBookingItem[];
}

// For the AI assistant's get_customer_history tool: every one of one
// customer's bookings, each labeled with its real computed status and its
// booking_financials figures — booking_status/booking_financials are both
// views with no real FK to bookings, so batch-fetch + merge by booking_id,
// the same pattern used everywhere else in this app for that reason (see
// getDailyBriefingData, getOutstandingDues). No proration needed here,
// unlike get_financial_summary/get_item_revenue — this is every one of the
// customer's own bookings in full, not a date- or item-sliced subset of a
// booking shared with other customers.
export async function getCustomerHistory(customerId: string): Promise<CustomerHistoryBooking[]> {
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id, booking_code, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (bookingsError) throw bookingsError;
  const bookingIds = (bookings ?? []).map((b) => b.id);
  if (bookingIds.length === 0) return [];

  const [statusResult, financialsResult, itemsResult] = await Promise.all([
    supabase.from("booking_status").select("booking_id, computed_status").in("booking_id", bookingIds),
    supabase.from("booking_financials").select("booking_id, price_charged, total_paid, balance_due").in("booking_id", bookingIds),
    supabase.from("booking_items").select("booking_id, type, status, pickup_date, return_date, items(item_code, name)").in("booking_id", bookingIds),
  ]);
  if (statusResult.error) throw statusResult.error;
  if (financialsResult.error) throw financialsResult.error;
  if (itemsResult.error) throw itemsResult.error;

  const statusByBooking = new Map((statusResult.data ?? []).map((s) => [s.booking_id, s.computed_status as CustomerHistoryBooking["computed_status"]]));
  const financialsByBooking = new Map((financialsResult.data ?? []).map((f) => [f.booking_id, f]));
  const itemsByBooking = new Map<string, HistoryBookingItem[]>();
  for (const row of itemsResult.data ?? []) {
    const item = row.items as unknown as { item_code: string; name: string } | null;
    const list = itemsByBooking.get(row.booking_id) ?? [];
    list.push({ item_code: item?.item_code ?? null, name: item?.name ?? null, type: row.type, status: row.status, pickup_date: row.pickup_date, return_date: row.return_date });
    itemsByBooking.set(row.booking_id, list);
  }

  return (bookings ?? []).map((b) => {
    const fin = financialsByBooking.get(b.id);
    return {
      booking_id: b.id,
      booking_code: b.booking_code,
      created_at: b.created_at,
      computed_status: statusByBooking.get(b.id) ?? "active",
      price_charged: Number(fin?.price_charged ?? 0),
      total_paid: Number(fin?.total_paid ?? 0),
      balance_due: Number(fin?.balance_due ?? 0),
      items: itemsByBooking.get(b.id) ?? [],
    };
  });
}
