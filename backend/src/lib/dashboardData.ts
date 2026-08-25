import { supabase } from "./supabase.js";
import { istToday, istWeekEnd, istDaysAhead } from "./dates.js";
import { ACTIVE_STATUSES } from "../routes/bookings.js";

// Shared by dashboard.ts (GET /api/dashboard/summary, which also adds the
// stats tiles on top of this) and the AI assistant's get_daily_briefing
// tool — the exact same due-today/overdue/outstanding-balance queries the
// Dashboard popups already use, not a second reimplementation.
export async function getDailyBriefingData() {
  // Today's returns due: return_date = today (IST), still active. Distinct
  // from upcoming_returns (return_date >= today) and overdue_rentals
  // (return_date < today) — this is exactly "due today", regardless of
  // whether it was ever formally checked out.
  const { data: dueTodayRows, error: dueTodayError } = await supabase
    .from("booking_items")
    .select("*, bookings(booking_code, customer_id), items(item_code, name, tracking_type)")
    .eq("type", "rental")
    .in("status", ACTIVE_STATUSES)
    .eq("return_date", istToday())
    .order("id");
  if (dueTodayError) throw dueTodayError;

  const dueTodayCustomerIds = [...new Set((dueTodayRows ?? []).map((r) => (r as unknown as { bookings: { customer_id: string } }).bookings.customer_id))];
  const { data: dueTodayCustomers, error: dueTodayCustomersError } = dueTodayCustomerIds.length
    ? await supabase.from("customers").select("id, name, phone").in("id", dueTodayCustomerIds)
    : { data: [], error: null };
  if (dueTodayCustomersError) throw dueTodayCustomersError;
  const dueTodayCustomersById = new Map((dueTodayCustomers ?? []).map((c) => [c.id, c]));
  const due_today = (dueTodayRows ?? []).map((r) => {
    const row = r as unknown as { bookings: { booking_code: string; customer_id: string } };
    return { ...r, customers: dueTodayCustomersById.get(row.bookings.customer_id) ?? null };
  });

  // Overdue rentals, including the next_customer_waiting urgency flag —
  // overdue_rentals has no real FK for items/customers (it's a view), so
  // batch-fetch and merge by id, same two-queries-plus-merge pattern used
  // elsewhere.
  const { data: overdueRows, error: overdueError } = await supabase.from("overdue_rentals").select("*").order("return_date");
  if (overdueError) throw overdueError;

  const itemIds = [...new Set((overdueRows ?? []).map((r) => r.item_id))];
  const customerIds = [...new Set((overdueRows ?? []).map((r) => r.customer_id))];
  const [{ data: overdueItems, error: overdueItemsError }, { data: overdueCustomers, error: overdueCustomersError }] = await Promise.all([
    itemIds.length ? supabase.from("items").select("id, item_code, name").in("id", itemIds) : Promise.resolve({ data: [], error: null }),
    customerIds.length ? supabase.from("customers").select("id, name, phone").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (overdueItemsError) throw overdueItemsError;
  if (overdueCustomersError) throw overdueCustomersError;

  const itemsById = new Map((overdueItems ?? []).map((i) => [i.id, i]));
  const customersById = new Map((overdueCustomers ?? []).map((c) => [c.id, c]));
  const overdue = (overdueRows ?? []).map((r) => ({
    ...r,
    items: itemsById.get(r.item_id) ?? null,
    customers: customersById.get(r.customer_id) ?? null,
  }));

  // Outstanding balance: sum of booking_financials.balance_due over
  // bookings whose computed status is 'active' — preserves the exact old
  // semantics (booked/out-equivalent only, not completed/cancelled), just
  // re-derived through booking_status instead of a stored column.
  const { data: activeStatusRows, error: activeStatusError } = await supabase
    .from("booking_status")
    .select("booking_id")
    .eq("computed_status", "active");
  if (activeStatusError) throw activeStatusError;
  const activeIds = (activeStatusRows ?? []).map((b) => b.booking_id);
  let outstanding_balance = 0;
  let outstanding_balance_count = 0;
  if (activeIds.length) {
    const { data: financials, error: financialsError } = await supabase.from("booking_financials").select("balance_due").in("booking_id", activeIds);
    if (financialsError) throw financialsError;
    // Filtered to strictly positive balances — a booking sitting at exactly
    // 0 (the common case) or, in a rare overpaid-and-not-yet-refunded edge
    // case, negative, isn't "owed" and shouldn't count as a due booking.
    const dueFinancials = (financials ?? []).filter((f) => Number(f.balance_due) > 0);
    outstanding_balance = dueFinancials.reduce((sum, f) => sum + Number(f.balance_due), 0);
    outstanding_balance_count = dueFinancials.length;
  }

  return {
    today: istToday(),
    due_today,
    overdue,
    outstanding_balance,
    outstanding_balance_count,
  };
}

const PICKUP_SELECT = "*, bookings(booking_code, customer_id), items(item_code, name, item_type, tracking_type, components, photos)";

// The one shared primitive behind every "what's going out" view — the
// Dashboard's fixed today/this-week windows below AND the AI assistant's
// flexible get_upcoming_pickups(days_ahead) both call this, rather than
// either reimplementing the query. Only status='booked' — an item already
// 'out' has already been picked up and needs no further prep; a cancelled
// one was never really due. No type filter: applies to both rental and
// sale line items, since a sale customer collecting their purchase still
// needs it prepped and ready, same as a rental customer. Deliberately
// excludes the overdue/unconfirmed concept (pickup_date in the past, still
// 'booked') — that's a different, already-flagged idea for later, not
// folded in here. Bounds are both inclusive.
async function getPickupsInRange(fromDate: string, toDate: string) {
  const { data: rows, error } = await supabase
    .from("booking_items")
    .select(PICKUP_SELECT)
    .eq("status", "booked")
    .gte("pickup_date", fromDate)
    .lte("pickup_date", toDate)
    .order("pickup_date")
    .order("id");
  if (error) throw error;

  const customerIds = [
    ...new Set((rows ?? []).map((r) => (r as unknown as { bookings: { customer_id: string } | null }).bookings?.customer_id)),
  ].filter((id): id is string => !!id);
  const { data: customers, error: customersError } = customerIds.length
    ? await supabase.from("customers").select("id, name, phone").in("id", customerIds)
    : { data: [], error: null };
  if (customersError) throw customersError;
  const customersById = new Map((customers ?? []).map((c) => [c.id, c]));

  return (rows ?? []).map((r) => {
    const row = r as unknown as { bookings: { customer_id: string } | null };
    return { ...r, customers: row.bookings ? (customersById.get(row.bookings.customer_id) ?? null) : null };
  });
}

// Deliberately separate from getDailyBriefingData() above rather than
// folded into it — that function's shape is shared with the AI assistant's
// get_daily_briefing tool, and this is a new, distinct concern ("what to
// prep for" vs. "what's due back") with no reason to touch that existing
// contract.
export async function getUpcomingPickupsData() {
  const today = istToday();
  const weekEnd = istWeekEnd();

  const [pickups_due_today, pickups_due_this_week] = await Promise.all([
    getPickupsInRange(today, today),
    // Strictly AFTER today through the end of this calendar week — today's
    // own pickups are already covered by pickups_due_today and must not
    // also appear here. getPickupsInRange's own bounds are inclusive on
    // both ends, so "after today" is expressed as istDaysAhead(1), not a
    // second exclusive-vs-inclusive variant of the shared query.
    getPickupsInRange(istDaysAhead(1), weekEnd),
  ]);

  return { pickups_due_today, pickups_due_this_week };
}

// The AI assistant's flexible counterpart — "next N days" rather than the
// Dashboard's fixed today/this-week windows, but the exact same underlying
// query (getPickupsInRange) either way. Mirrors get_upcoming_returns'
// existing days_ahead parameter shape.
export async function getUpcomingPickupsForDays(daysAhead: number) {
  return getPickupsInRange(istToday(), istDaysAhead(daysAhead));
}

// ── Upcoming Occasions (birthdays / wedding anniversaries) ────────────────

export interface OccasionRow {
  customer_id: string;
  name: string;
  phone: string;
  type: "birthday" | "anniversary";
  // This YEAR's real calendar occurrence (e.g. a 1990 date_of_birth still
  // reports today's actual year here) — matches what the day-grouping on
  // the Dashboard needs, distinct from the stored date_of_birth/
  // date_of_wedding itself.
  date: string;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Every real calendar date from `from` through `to`, inclusive — both are
// already-resolved IST YYYY-MM-DD strings (istToday()/istWeekEnd()/
// istDaysAhead()), so plain UTC-anchored Date stepping here can't drift a
// day the way it would if this were parsing a genuinely timezone-sensitive
// instant (it isn't — these are calendar dates, not moments).
function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return dates;
}

function monthDay(dateStr: string): string {
  return dateStr.slice(5, 10); // "MM-DD"
}

// Which "MM-DD" keys count as occurring on this real candidate date —
// normally just its own, except Feb 28 in a non-leap year, which also
// absorbs any Feb-29 birthday/anniversary. There's no real Feb 29 to land
// on in a non-leap year, so it's observed the day before rather than
// silently skipped for three years out of four (the more common
// convention; "roll to Mar 1" would work just as well, but one had to be
// picked — this is that choice, made explicit rather than left as an
// accidental gap).
function occasionKeysFor(candidateDate: string): string[] {
  const [yearStr, mm, dd] = candidateDate.split("-");
  const keys = [`${mm}-${dd}`];
  if (mm === "02" && dd === "28" && !isLeapYear(Number(yearStr))) {
    keys.push("02-29");
  }
  return keys;
}

type OccasionCustomer = { id: string; name: string; phone: string; date_of_birth: string | null; date_of_wedding: string | null };

// Month+day match only, recurring yearly — never the exact stored date (a
// customer born in 1990 still has a "birthday" every single year). Walks
// the range day by day (at most 7 candidate dates for the Dashboard's own
// windows) rather than a single SQL predicate, since PostgREST has no
// clean way to express "month/day matches, ignore year" as a filter —
// same fetch-then-filter-in-JS approach Reports already uses for anything
// this app has no precedent for as a parameterized SQL view/function.
function occasionsInRange(customers: OccasionCustomer[], fromDate: string, toDate: string): OccasionRow[] {
  const rows: OccasionRow[] = [];
  for (const candidateDate of enumerateDates(fromDate, toDate)) {
    const keys = occasionKeysFor(candidateDate);
    for (const c of customers) {
      if (c.date_of_birth && keys.includes(monthDay(c.date_of_birth))) {
        rows.push({ customer_id: c.id, name: c.name, phone: c.phone, type: "birthday", date: candidateDate });
      }
      if (c.date_of_wedding && keys.includes(monthDay(c.date_of_wedding))) {
        rows.push({ customer_id: c.id, name: c.name, phone: c.phone, type: "anniversary", date: candidateDate });
      }
    }
  }
  return rows;
}

// Today's + this week's birthdays/anniversaries — mirrors
// getUpcomingPickupsData's exact today/this-week split (today's own
// occasions never duplicate into the this-week list).
export async function getUpcomingOccasionsData() {
  const today = istToday();
  const weekEnd = istWeekEnd();

  const { data: customers, error } = await supabase.from("customers").select("id, name, phone, date_of_birth, date_of_wedding");
  if (error) throw error;
  const withDates = (customers ?? []).filter((c) => c.date_of_birth || c.date_of_wedding);

  return {
    occasions_today: occasionsInRange(withDates, today, today),
    occasions_this_week: occasionsInRange(withDates, istDaysAhead(1), weekEnd),
  };
}
