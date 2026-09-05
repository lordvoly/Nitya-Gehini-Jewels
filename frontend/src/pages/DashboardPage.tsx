import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchDashboardSummary, type DashboardSummary, type PickupDueBookingItem, type OccasionRow } from "../lib/dashboard";
import { useAuth } from "../lib/auth";
import { DashboardAlerts } from "../components/dashboard/DashboardAlerts";
import { DashboardSkeleton } from "../components/common/Skeleton";
import { useSlowLoadHint } from "../lib/useSlowLoadHint";
import { formatDateDisplay, addDaysToDateString, formatWeekdayDate } from "../lib/dates";
import { fetchShopSettings } from "../lib/shopSettings";
import { buildWhatsAppLink, buildOccasionMessage } from "../lib/whatsapp";
import "../styles/shared.css";

// Flattens an already pickup_date-ascending list into rows each carrying
// their own day label ("Tomorrow" or "Wed 19 Aug", never a raw ISO date)
// — This Week's tables show Day as an ordinary column now (one table per
// section, not a merged agenda), so there's no separate day-group header
// row to build, just this label attached per row. `today` is always the
// server's own echoed-back value (DashboardSummary.today), never computed
// locally, per this app's IST rule.
function withDayLabels<T extends { }>(rows: T[], dateOf: (row: T) => string, today: string): (T & { dayLabel: string })[] {
  const tomorrow = addDaysToDateString(today, 1);
  return rows.map((row) => {
    const date = dateOf(row);
    return { ...row, dayLabel: date === tomorrow ? "Tomorrow" : formatWeekdayDate(date) };
  });
}

// Prev/next arrows for a swipeable carousel table — the tbody itself is
// the real scroll container (overflow-x: auto + scroll-snap-type: x on
// .dashboard-carousel tbody), these buttons just call scrollBy() on it for
// mouse/keyboard users who wouldn't otherwise think to click-drag or
// trackpad-swipe a table sideways. Scrolls by exactly one card's width
// (the container's own clientWidth, since each card is now full-width —
// see .dashboard-carousel tr) rather than a fixed pixel guess, so it pages
// one-at-a-time correctly at any viewport size. Deliberately no disabled-
// at-the-ends tracking — scrollBy() already clamps harmlessly at either
// edge, and wiring up scroll-position state for that would be more code
// than the polish is worth (the dots below do carry real position state,
// since that's the whole point of them).
function CarouselNav({ targetRef }: { targetRef: RefObject<HTMLTableSectionElement> }) {
  function scroll(direction: 1 | -1) {
    const el = targetRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: "smooth" });
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

// Shared shell for every section below — heading + count + prev/next nav +
// a swipeable .data-table.dashboard-carousel, with one calm empty-state
// row (spanning every column) when there's nothing in it, rather than the
// whole section disappearing. Each of the 7 sections keeps its own real
// data source and its own specific columns (per explicit feedback:
// combining them into one merged "Today" table hid detail that mattered) —
// this only factors out the boilerplate shape they all share.
function CarouselTable({
  id,
  title,
  count,
  headers,
  emptyMessage,
  children,
}: {
  id: string;
  title: string;
  count: number;
  headers: string[];
  emptyMessage: string;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLTableSectionElement>(null);
  // Which card is currently in view, for the dot row below — the one
  // piece of real position state this carousel keeps (CarouselNav's own
  // prev/next buttons deliberately don't bother). Recomputed from the
  // scroll container's own scrollLeft rather than tracked through the nav
  // buttons/swipe separately, so it stays correct regardless of which of
  // the three ways (buttons, drag, touch swipe) the operator used to get
  // there. Exact by construction: every card is flex: 0 0 100% with no
  // gap between them (see shared.css), so each snap point sits at exactly
  // i * clientWidth.
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      const width = el!.clientWidth || 1;
      setActiveIndex(Math.round(el!.scrollLeft / width));
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  function goTo(i: number) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div id={id} className="dashboard-section">
      <div className="dashboard-carousel-heading">
        <h2>
          {title} ({count})
        </h2>
        {count > 1 && <CarouselNav targetRef={scrollRef} />}
      </div>
      <table className="data-table dashboard-carousel">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody ref={scrollRef}>
          {count === 0 ? (
            <tr className="dashboard-carousel-empty">
              <td colSpan={headers.length}>{emptyMessage}</td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
      {count > 1 && (
        <div className="dashboard-carousel-dots">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              type="button"
              className={i === activeIndex ? "dashboard-carousel-dot active" : "dashboard-carousel-dot"}
              aria-label={`Go to item ${i + 1} of ${count}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// The WhatsApp greeting action, shared by both Occasions tables — same
// wa.me pattern the invoice-share feature established, just with occasion-
// specific pre-filled text. A customer with no valid phone on file gets a
// genuinely disabled button with a reason in its title, never a broken link.
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

function occasionPill(type: OccasionRow["type"]) {
  return (
    <span className={`pill ${type === "birthday" ? "pill-active" : "pill-info"}`}>
      {type === "birthday" ? "Birthday" : "Anniversary"}
    </span>
  );
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
  const weekPickups = withDayLabels(pickups_due_this_week, (p: PickupDueBookingItem) => p.pickup_date, summary.today);
  const weekOccasions = withDayLabels(occasions_this_week, (o: OccasionRow) => o.date, summary.today);

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

      <CarouselTable
        id="pending-items-section"
        title="Items Pending"
        count={pending_items.length}
        headers={["Item", "Booking / Customer", "Missing", ""]}
        emptyMessage="Nothing flagged as still missing."
      >
        {pending_items.map((p) => (
          <tr key={`${p.booking_item_id}-${p.component_name}`}>
            <td data-label="Item">
              <Link to={`/items/${p.item_id}`}>
                {p.item_code} — {p.item_name}
              </Link>
            </td>
            <td data-label="Booking / Customer">
              {p.booking_code} · {p.customer_name}
            </td>
            <td data-label="Missing">
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
      </CarouselTable>

      <CarouselTable
        id="items-due-section"
        title="Today's Returns Due"
        count={due_today.length}
        headers={["Item", "Booking / Customer", ""]}
        emptyMessage="Nothing due back today."
      >
        {due_today.map((b) => (
          <tr key={b.id}>
            <td data-label="Item">
              <Link to={`/items/${b.item_id}`}>
                {b.items?.item_code} — {b.items?.name}
              </Link>
            </td>
            <td data-label="Booking / Customer">
              {b.bookings?.booking_code} · {b.customers?.name}
            </td>
            <td className="row-actions">
              <Link to={`/bookings?booking=${b.booking_id}`} className="btn-secondary btn-compact">
                View
              </Link>
            </td>
          </tr>
        ))}
      </CarouselTable>

      <CarouselTable
        id="overdue-section"
        title="Overdue Rentals"
        count={overdue.length}
        headers={["Item", "Booking / Customer", "Days Overdue", ""]}
        emptyMessage="Nothing overdue."
      >
        {[...urgentOverdue, ...otherOverdue].map((b) => {
          const days = Math.abs(b.days_until_return);
          return (
            <tr key={b.id}>
              <td data-label="Item">
                <Link to={`/items/${b.item_id}`}>
                  {b.items?.item_code} — {b.items?.name}
                </Link>
              </td>
              <td data-label="Booking / Customer">
                {b.booking_code} · {b.customers?.name}
              </td>
              <td data-label="Days Overdue">
                {days} day{days === 1 ? "" : "s"} overdue
                {b.next_customer_waiting && (
                  <span className="dashboard-table-urgent">
                    Next: {b.next_booking_code} — {b.next_customer_name} ({b.next_pickup_date})
                  </span>
                )}
              </td>
              <td className="row-actions">
                <Link to={`/bookings?booking=${b.booking_id}`} className="btn-secondary btn-compact">
                  View
                </Link>
              </td>
            </tr>
          );
        })}
      </CarouselTable>

      <CarouselTable
        id="pickups-due-section"
        title="Today's Pickups Due"
        count={pickups_due_today.length}
        headers={["Item", "Booking / Customer", ""]}
        emptyMessage="Nothing to prep for pickup today."
      >
        {pickups_due_today.map((p) => (
          <tr key={p.id}>
            <td data-label="Item">
              <Link to={`/items/${p.item_id}`}>
                {p.items?.item_code} — {p.items?.name}
              </Link>
            </td>
            <td data-label="Booking / Customer">
              {p.bookings?.booking_code} · {p.customers?.name ?? "—"}
            </td>
            <td className="row-actions">
              <Link to={`/bookings?booking=${p.booking_id}`} className="btn-secondary btn-compact">
                View
              </Link>
            </td>
          </tr>
        ))}
      </CarouselTable>

      <CarouselTable
        id="week-pickups-section"
        title="This Week's Pickups Due"
        count={weekPickups.length}
        headers={["Day", "Item", "Customer", ""]}
        emptyMessage="Nothing else due for pickup this week."
      >
        {weekPickups.map((p) => (
          <tr key={p.id}>
            <td data-label="Day">{p.dayLabel}</td>
            <td data-label="Item">
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
      </CarouselTable>

      <CarouselTable
        id="occasions-section"
        title="Today's Occasions"
        count={occasions_today.length}
        headers={["Type", "Customer", ""]}
        emptyMessage="No birthdays or anniversaries today."
      >
        {occasions_today.map((o) => (
          <tr key={`${o.customer_id}-${o.type}`}>
            <td data-label="Type">{occasionPill(o.type)}</td>
            <td data-label="Customer">{o.name}</td>
            <td className="row-actions">
              <GreetingAction occasion={o} shopName={shopName} discountPercent={occasionDiscountPercent} />
            </td>
          </tr>
        ))}
      </CarouselTable>

      <CarouselTable
        id="week-occasions-section"
        title="This Week's Occasions"
        count={weekOccasions.length}
        headers={["Day", "Type", "Customer", ""]}
        emptyMessage="No birthdays or anniversaries later this week."
      >
        {weekOccasions.map((o) => (
          <tr key={`${o.customer_id}-${o.type}`}>
            <td data-label="Day">{o.dayLabel}</td>
            <td data-label="Type">{occasionPill(o.type)}</td>
            <td data-label="Customer">{o.name}</td>
            <td className="row-actions">
              <GreetingAction occasion={o} shopName={shopName} discountPercent={occasionDiscountPercent} />
            </td>
          </tr>
        ))}
      </CarouselTable>
    </div>
  );
}
