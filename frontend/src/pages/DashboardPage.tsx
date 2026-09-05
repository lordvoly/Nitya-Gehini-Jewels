import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  fetchDashboardSummary,
  type DashboardSummary,
  type PickupDueBookingItem,
  type OccasionRow,
  type OverdueBookingItem,
} from "../lib/dashboard";
import type { PendingItem } from "../lib/pendingItems";
import { useAuth } from "../lib/auth";
import { DashboardAlerts } from "../components/dashboard/DashboardAlerts";
import { DashboardSkeleton } from "../components/common/Skeleton";
import { useSlowLoadHint } from "../lib/useSlowLoadHint";
import { formatDateDisplay, addDaysToDateString, formatWeekdayDate } from "../lib/dates";
import { fetchShopSettings } from "../lib/shopSettings";
import { buildWhatsAppLink, buildOccasionMessage } from "../lib/whatsapp";
import "../styles/shared.css";

// Groups an already pickup_date-ascending list into per-day buckets, each
// labeled "Tomorrow" or "Wed 19 Aug" — never a raw ISO date. `today` is
// always the server's own echoed-back value (DashboardSummary.today),
// never computed locally, per this app's IST rule; "tomorrow" is pure
// date-math on that same server-provided anchor, not a fresh "now".
function groupPickupsByDay(pickups: PickupDueBookingItem[], today: string) {
  const tomorrow = addDaysToDateString(today, 1);
  const groups = new Map<string, PickupDueBookingItem[]>();
  for (const p of pickups) {
    const list = groups.get(p.pickup_date) ?? [];
    list.push(p);
    groups.set(p.pickup_date, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      label: date === tomorrow ? "Tomorrow" : formatWeekdayDate(date),
      items,
    }));
}

// Same day-grouping shape as groupPickupsByDay above, kept as its own
// small parallel function rather than a shared generic — OccasionRow and
// PickupDueBookingItem key their date under different field names
// (date vs. pickup_date), and this app's own convention elsewhere already
// favors a second small function over reshaping a working one.
function groupOccasionsByDay(occasions: OccasionRow[], today: string) {
  const tomorrow = addDaysToDateString(today, 1);
  const groups = new Map<string, OccasionRow[]>();
  for (const o of occasions) {
    const list = groups.get(o.date) ?? [];
    list.push(o);
    groups.set(o.date, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      label: date === tomorrow ? "Tomorrow" : formatWeekdayDate(date),
      items,
    }));
}

// Merges the two independently-day-grouped lists above into one
// chronological agenda — a pickup and an occasion landing on the same day
// share that day's bucket, sorted by date, rather than pickups and
// occasions living in two separate tables the operator has to cross-
// reference by eye.
function mergeWeekByDay(
  pickupGroups: ReturnType<typeof groupPickupsByDay>,
  occasionGroups: ReturnType<typeof groupOccasionsByDay>,
) {
  const byDate = new Map<string, { date: string; label: string; pickups: PickupDueBookingItem[]; occasions: OccasionRow[] }>();
  for (const g of pickupGroups) {
    const entry = byDate.get(g.date) ?? { date: g.date, label: g.label, pickups: [], occasions: [] };
    entry.pickups = g.items;
    byDate.set(g.date, entry);
  }
  for (const g of occasionGroups) {
    const entry = byDate.get(g.date) ?? { date: g.date, label: g.label, pickups: [], occasions: [] };
    entry.occasions = g.items;
    byDate.set(g.date, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export default function DashboardPage() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Independent, non-blocking fetch — a fallback name/discount here just
  // makes a WhatsApp greeting generic for one render, whereas failing the
  // whole Dashboard load over a shop-settings hiccup would be a much
  // worse tradeoff for something this secondary.
  const [shopName, setShopName] = useState("the shop");
  const [occasionDiscountPercent, setOccasionDiscountPercent] = useState(10);
  // The two carousel tables' own scroll containers (their <tbody>), for
  // CarouselNav's prev/next buttons to scrollBy() on.
  const todayScrollRef = useRef<HTMLTableSectionElement>(null);
  const weekScrollRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchShopSettings()
      .then((s) => {
        setShopName(s.name);
        setOccasionDiscountPercent(s.occasion_discount_percent);
      })
      .catch(() => {});
  }, []);

  const showSlowHint = useSlowLoadHint(loading);

  if (loading)
    return (
      <>
        <DashboardSkeleton />
        {showSlowHint && (
          <p className="wizard-hint slow-load-hint">
            Still loading. The server may be waking up after a period of inactivity, which can take up to a minute.
          </p>
        )}
      </>
    );
  if (error || !summary) return <div className="page wizard-error">{error ?? "Failed to load dashboard"}</div>;

  const {
    due_today,
    overdue,
    pickups_due_today,
    pickups_due_this_week,
    occasions_today,
    occasions_this_week,
    outstanding_balance,
    pending_items,
    stats,
  } = summary;
  const urgentOverdue = overdue.filter((b) => b.next_customer_waiting);
  const otherOverdue = overdue.filter((b) => !b.next_customer_waiting);
  const weekPickupGroups = groupPickupsByDay(pickups_due_this_week, summary.today);
  const weekOccasionGroups = groupOccasionsByDay(occasions_this_week, summary.today);
  const weekDays = mergeWeekByDay(weekPickupGroups, weekOccasionGroups);

  const todayRowCount =
    overdue.length + due_today.length + pickups_due_today.length + pending_items.length + occasions_today.length;
  const weekRowCount = pickups_due_this_week.length + occasions_this_week.length;

  return (
    <div className="page">
      <DashboardAlerts summary={summary} userId={session?.user.id ?? null} />

      <div className="stat-grid">
        <div className="stat-card">
          <Link to="/items?filter=active" className="stat-card-link">
            <div className="stat-value">{stats.items_in_catalog}</div>
            <div className="stat-label">Items in Catalog</div>
          </Link>
          {stats.items_retired > 0 && (
            <Link to="/items?filter=retired" className="stat-subnote">
              ({stats.items_retired} retired)
            </Link>
          )}
        </div>
        <div className="stat-card">
          <Link to="/items?filter=out" className="stat-card-link">
            <div className="stat-value">{stats.items_out}</div>
            <div className="stat-label">Items out</div>
          </Link>
          {stats.items_needs_confirmation > 0 && (
            <Link to="/items?filter=needs_confirmation" className="stat-subnote">
              ({stats.items_needs_confirmation} needs confirmation)
            </Link>
          )}
        </div>
        <Link to="/customers" className="stat-card">
          <div className="stat-value">{stats.total_customers}</div>
          <div className="stat-label">Customers</div>
        </Link>
        <Link to="/bookings" className="stat-card">
          <div className="stat-value">{stats.bookings_this_week}</div>
          <div className="stat-label">Bookings this week</div>
        </Link>
      </div>

      <div id="outstanding-balance-section">
        <Link to="/reports#outstanding-dues-section" className="stat-card stat-card-wide">
          <div className="stat-value">₹{outstanding_balance}</div>
          <div className="stat-label">Outstanding balance (active bookings)</div>
        </Link>
      </div>

      {/* "Today" — every same-day-urgent signal (overdue, returns due,
          pickups due, missing-item follow-ups) as one structured table
          instead of four separate panel-stacked sections. Sorted by
          urgency, not by which data source it came from: overdue-with-
          next-customer-waiting first, then other overdue, then today's
          returns/pickups, then open missing-item follow-ups. The table
          itself always renders (never disappears) — a quiet day just
          shows one calm empty-state row, so the page's structure stays
          the same whether today is busy or not. */}
      <div id="items-due-section" className="dashboard-section">
        <div className="dashboard-carousel-heading">
          <h2>Today ({todayRowCount})</h2>
          {todayRowCount > 1 && <CarouselNav targetRef={todayScrollRef} />}
        </div>
        <table className="data-table dashboard-carousel">
          <thead>
            <tr>
              <th>Type</th>
              <th>Item</th>
              <th>Booking / Customer</th>
              <th>Detail</th>
              <th></th>
            </tr>
          </thead>
          <tbody ref={todayScrollRef}>
            {todayRowCount === 0 && (
              <tr className="dashboard-carousel-empty">
                <td colSpan={5}>Nothing needs attention today.</td>
              </tr>
            )}
              {urgentOverdue.map((b) => (
                <OverdueRow key={`overdue-${b.id}`} overdue={b} />
              ))}
              {otherOverdue.map((b) => (
                <OverdueRow key={`overdue-${b.id}`} overdue={b} />
              ))}
              {due_today.map((b) => (
                <tr key={`due-${b.id}`}>
                  <td data-label="Type">
                    <span className="pill pill-active">Return Due</span>
                  </td>
                  <td data-label="Item">
                    <Link to={`/items/${b.item_id}`}>
                      {b.items?.item_code} — {b.items?.name}
                    </Link>
                  </td>
                  <td data-label="Booking / Customer">
                    {b.bookings?.booking_code} · {b.customers?.name}
                  </td>
                  <td data-label="Detail">Due today</td>
                  <td className="row-actions">
                    <Link to={`/bookings?booking=${b.booking_id}`} className="btn-secondary btn-compact">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {pickups_due_today.map((p) => (
                <tr key={`pickup-${p.id}`}>
                  <td data-label="Type">
                    <span className="pill pill-info">Pickup</span>
                  </td>
                  <td data-label="Item">
                    <Link to={`/items/${p.item_id}`}>
                      {p.items?.item_code} — {p.items?.name}
                    </Link>
                  </td>
                  <td data-label="Booking / Customer">
                    {p.bookings?.booking_code} · {p.customers?.name ?? "—"}
                  </td>
                  <td data-label="Detail">Due today</td>
                  <td className="row-actions">
                    <Link to={`/bookings?booking=${p.booking_id}`} className="btn-secondary btn-compact">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {pending_items.map((p) => (
                <tr key={`pending-${p.booking_item_id}-${p.component_name}`}>
                  <td data-label="Type">
                    <span className="pill pill-attention">Missing Item</span>
                  </td>
                  <td data-label="Item">
                    <Link to={`/items/${p.item_id}`}>
                      {p.item_code} — {p.item_name}
                    </Link>
                  </td>
                  <td data-label="Booking / Customer">
                    {p.booking_code} · {p.customer_name}
                  </td>
                  <td data-label="Detail">
                    {p.component_name}
                    {p.actual_return_date ? ` · returned ${formatDateDisplay(p.actual_return_date)}` : ""}
                    {p.return_notes && <span className="dashboard-table-note">"{p.return_notes}"</span>}
                  </td>
                  <td className="row-actions">
                    <Link to={`/bookings?booking=${p.booking_id}`} className="btn-secondary btn-compact">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {occasions_today.map((o) => (
                <tr key={`today-occasion-${o.customer_id}-${o.type}`}>
                  <td data-label="Type">
                    <span className={`pill ${o.type === "birthday" ? "pill-active" : "pill-info"}`}>
                      {o.type === "birthday" ? "Birthday" : "Anniversary"}
                    </span>
                  </td>
                  <td data-label="Item">—</td>
                  <td data-label="Booking / Customer">{o.name}</td>
                  <td data-label="Detail">Today</td>
                  <td className="row-actions">
                    <GreetingAction occasion={o} shopName={shopName} discountPercent={occasionDiscountPercent} />
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      </div>

      {/* "This Week" — this week's pickups and occasions merged into one
          day-by-day agenda instead of two separately-headed sections, each
          split again into "today"/"this week". Today's own pickups are
          deliberately not repeated here (they're in the Today table
          above) — pickups_due_this_week already excludes today. */}
      <div id="pickups-due-section" className="dashboard-section">
        <div className="dashboard-carousel-heading">
          <h2>This Week ({weekRowCount})</h2>
          {weekRowCount > 1 && <CarouselNav targetRef={weekScrollRef} />}
        </div>
        <table className="data-table dashboard-carousel">
          <thead>
            <tr>
              <th>Day</th>
              <th>Type</th>
              <th>Item / Occasion</th>
              <th>Customer</th>
              <th></th>
            </tr>
          </thead>
          <tbody ref={weekScrollRef}>
            {weekRowCount === 0 && (
              <tr className="dashboard-carousel-empty">
                <td colSpan={5}>Nothing coming up this week.</td>
              </tr>
            )}
              {weekDays.map((day) => (
                <Fragment key={day.date}>
                  {day.pickups.map((p) => (
                    <tr key={`week-pickup-${p.id}`}>
                      <td data-label="Day">{day.label}</td>
                      <td data-label="Type">
                        <span className="pill pill-neutral">Pickup</span>
                      </td>
                      <td data-label="Item / Occasion">
                        <Link to={`/items/${p.item_id}`}>
                          {p.items?.item_code} — {p.items?.name}
                        </Link>
                      </td>
                      <td data-label="Customer">{p.customers?.name ?? "—"}</td>
                      <td className="row-actions">
                        <Link to={`/bookings?booking=${p.booking_id}`} className="btn-secondary btn-compact">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {day.occasions.map((o) => (
                    <WeekOccasionRow
                      key={`week-occasion-${o.customer_id}-${o.type}`}
                      dayLabel={day.label}
                      occasion={o}
                      shopName={shopName}
                      discountPercent={occasionDiscountPercent}
                    />
                  ))}
                </Fragment>
              ))}
            </tbody>
        </table>
      </div>
    </div>
  );
}

// One overdue rental's row — same for both the "next customer waiting"
// case and the plain-overdue case, differing only in the Detail cell.
// Urgency here is communicated the way this app already does it elsewhere
// (a pill inside the cell, e.g. bookingItemStatusPill's own "Pickup
// Overdue" pill), not a separate visual language just for this table.
function OverdueRow({ overdue }: { overdue: OverdueBookingItem }) {
  const days = Math.abs(overdue.days_until_return);
  return (
    <tr>
      <td data-label="Type">
        <span className="pill pill-attention">Overdue</span>
      </td>
      <td data-label="Item">
        <Link to={`/items/${overdue.item_id}`}>
          {overdue.items?.item_code} — {overdue.items?.name}
        </Link>
      </td>
      <td data-label="Booking / Customer">
        {overdue.booking_code} · {overdue.customers?.name}
      </td>
      <td data-label="Detail">
        {days} day{days === 1 ? "" : "s"} overdue
        {overdue.next_customer_waiting && (
          <span className="dashboard-table-urgent">
            Next: {overdue.next_booking_code} — {overdue.next_customer_name} ({overdue.next_pickup_date})
          </span>
        )}
      </td>
      <td className="row-actions">
        <Link to={`/bookings?booking=${overdue.booking_id}`} className="btn-secondary btn-compact">
          View
        </Link>
      </td>
    </tr>
  );
}

// Prev/next arrows for a swipeable carousel table — the tbody itself is
// the real scroll container (overflow-x: auto + scroll-snap-type: x on
// .dashboard-carousel tbody), these buttons just call scrollBy() on it for
// mouse/keyboard users who wouldn't otherwise think to click-drag or
// trackpad-swipe a table sideways. Deliberately no disabled-at-the-ends
// tracking — scrollBy() already clamps harmlessly at either edge, and
// wiring up scroll-position state for this would be more code than the
// polish is worth.
function CarouselNav({ targetRef }: { targetRef: RefObject<HTMLTableSectionElement> }) {
  function scroll(direction: 1 | -1) {
    targetRef.current?.scrollBy({ left: direction * 270, behavior: "smooth" });
  }
  return (
    <div className="dashboard-carousel-nav">
      <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)}>
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <button type="button" aria-label="Scroll right" onClick={() => scroll(1)}>
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

// The WhatsApp greeting action, shared by This Week's occasion rows and
// Today's Occasions table below — same wa.me pattern the invoice-share
// feature established, just with occasion-specific pre-filled text. A
// customer with no valid phone on file gets a genuinely disabled button
// with a reason in its title, never a broken link.
function GreetingAction({
  occasion,
  shopName,
  discountPercent,
}: {
  occasion: OccasionRow;
  shopName: string;
  discountPercent: number;
}) {
  const message = buildOccasionMessage(occasion.type, occasion.name, shopName, discountPercent);
  const whatsapp = buildWhatsAppLink(occasion.phone, message);
  return "url" in whatsapp ? (
    <a href={whatsapp.url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-compact">
      Send Greeting
    </a>
  ) : (
    <button className="btn-secondary btn-compact" disabled title={whatsapp.error}>
      Send Greeting
    </button>
  );
}

function WeekOccasionRow({
  dayLabel,
  occasion,
  shopName,
  discountPercent,
}: {
  dayLabel: string;
  occasion: OccasionRow;
  shopName: string;
  discountPercent: number;
}) {
  return (
    <tr>
      <td data-label="Day">{dayLabel}</td>
      <td data-label="Type">
        <span className={`pill ${occasion.type === "birthday" ? "pill-active" : "pill-info"}`}>
          {occasion.type === "birthday" ? "Birthday" : "Anniversary"}
        </span>
      </td>
      <td data-label="Item / Occasion">—</td>
      <td data-label="Customer">{occasion.name}</td>
      <td className="row-actions">
        <GreetingAction occasion={occasion} shopName={shopName} discountPercent={discountPercent} />
      </td>
    </tr>
  );
}
