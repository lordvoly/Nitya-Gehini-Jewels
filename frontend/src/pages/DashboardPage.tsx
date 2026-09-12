import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Link, useNavigate, type NavigateFunction } from "react-router-dom";
import { ChevronLeft, ChevronRight, Bell, Gift, ImageOff, Sparkles } from "lucide-react";
import {
  fetchDashboardSummary,
  type DashboardSummary,
  type PickupDueBookingItem,
  type PickupOverdueBookingItem,
  type OccasionRow,
  type OverdueBookingItem,
} from "../lib/dashboard";
import { buildDashboardOverview, firstName } from "../lib/dashboardGreeting";
import { useAuth } from "../lib/auth";
import { DashboardSkeleton } from "../components/common/Skeleton";
import { PhotoLightbox } from "../components/items/PhotoLightbox";
import { LogoIntroLoader } from "../components/common/LogoIntroLoader";
import { hasShownBootIntro, markBootIntroShown } from "../lib/appBootIntro";
import { useSlowLoadHint } from "../lib/useSlowLoadHint";
import { formatDateDisplay, addDaysToDateString, formatWeekdayDate } from "../lib/dates";
import { fetchShopSettings } from "../lib/shopSettings";
import { formatNumber } from "../lib/format";
import {
  buildWhatsAppLink,
  buildOccasionMessage,
  buildOverdueReminderMessage,
  buildOverdueBookingReminderMessage,
  buildPickupOverdueReminderMessage,
  buildPickupOverdueBookingReminderMessage,
  buildPickupDueBookingReminderMessage,
} from "../lib/whatsapp";
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

// Groups a flat list of per-item rows into one array per booking — the 5
// sections below are fundamentally per-booking-item events (one row per
// physical item), which meant a booking with several items due at once
// produced that many separate cards. Grouping collapses that into one
// card per booking listing every qualifying item together, without
// merging across sections — an item from the same booking with a
// genuinely different date still lands in whichever section its own date
// puts it in, same as before; nothing about the underlying per-item data
// changes; this only changes how it's grouped for display. Preserves the
// order each booking first appears in (the backend's own ordering).
function groupByBooking<T>(rows: T[], bookingIdOf: (row: T) => string): T[][] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = bookingIdOf(row);
    let group = map.get(key);
    if (!group) {
      group = [];
      map.set(key, group);
      order.push(key);
    }
    group.push(row);
  }
  return order.map((key) => map.get(key)!);
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
      <Gift size={14} strokeWidth={2} aria-hidden="true" />
      Send Greeting
    </a>
  ) : (
    <button className="btn-secondary btn-compact" disabled title={whatsapp.error}>
      <Gift size={14} strokeWidth={2} aria-hidden="true" />
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

// Makes an entire card row navigate to its booking, replacing the old
// per-row "View" button — the card itself IS the affordance now. Nested
// links (item name, customer name) still need their own onClick to call
// stopPropagation(), or a click on either would bubble up and re-navigate
// to the booking instead of following the more specific link. tabIndex +
// onKeyDown give the row the same Enter/Space activation a real link or
// button would have, since a <tr> has no native click semantics of its
// own.
function bookingRowProps(navigate: NavigateFunction, bookingId: string) {
  const go = () => navigate(`/bookings?booking=${bookingId}`);
  return {
    className: "dashboard-carousel-row-clickable",
    tabIndex: 0,
    onClick: go,
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    },
  };
}

function stopRowClick(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

// One item line inside a booking's grouped "Items" cell. The code+name
// link (and the surrounding card's own click) still navigate to the item
// / booking respectively; only the thumbnail is different — a tap on it
// opens the photo in the shared PhotoLightbox quick-view rather than
// navigating anywhere (onViewPhotos), matching the Items list's thumbnail
// behaviour. Text sits left, the thumbnail (and Overdue's optional
// per-item Remind button) is pushed to the right edge so the row reads
// justified rather than clumped against the left. A placeholder tile
// (not a button) shows when the item has no photo. stopRowClick keeps a
// thumbnail tap from also firing the card's navigate-to-booking.
function DashboardItemRow({
  itemId,
  photos,
  code,
  name,
  children,
  action,
  onViewPhotos,
}: {
  itemId: string;
  photos?: string[] | null;
  code?: string | null;
  name?: string | null;
  children?: ReactNode;
  action?: ReactNode;
  onViewPhotos: (photos: string[]) => void;
}) {
  const photo = photos?.[0];
  return (
    <div className={action ? "dashboard-group-item dashboard-group-item-overdue" : "dashboard-group-item"}>
      <div className="dashboard-group-item-text">
        <Link to={`/items/${itemId}`} onClick={stopRowClick}>
          {code} — {name}
        </Link>
        {children}
      </div>
      <div className="dashboard-group-item-trailing">
        {photo ? (
          <button
            type="button"
            className="dashboard-group-thumb-btn"
            onClick={(e) => {
              stopRowClick(e);
              onViewPhotos(photos ?? []);
            }}
            aria-label={`View photo of ${name ?? "item"}`}
          >
            <img src={photo} alt="" className="dashboard-group-thumb" />
          </button>
        ) : (
          <span className="dashboard-group-thumb dashboard-group-thumb-placeholder" aria-hidden="true">
            <ImageOff size={15} strokeWidth={2} />
          </span>
        )}
        {action}
      </div>
    </div>
  );
}

// WhatsApp nudge, rendered as a real <a> (or a disabled <button> with the
// reason in its title when there's no valid phone) — same wa.me pattern as
// GreetingAction below. stopRowClick keeps a tap from also triggering the
// card's own navigate-to-booking click. `label` differs between the
// booking-level and per-item variants below.
function ReminderButton({ url, error, label }: { url?: string; error?: string; label: string }) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-compact btn-xs" onClick={stopRowClick}>
      <Bell size={12} strokeWidth={2} aria-hidden="true" />
      {label}
    </a>
  ) : (
    <button className="btn-secondary btn-compact btn-xs" disabled title={error} onClick={stopRowClick}>
      <Bell size={12} strokeWidth={2} aria-hidden="true" />
      {label}
    </button>
  );
}

// One reminder for the whole overdue booking — its message names every
// item in the group that's past its return date, so the operator sends a
// single nudge for the transaction rather than one per piece. Always
// shown, once, on the right of the booking's row.
function OverdueBookingReminderAction({ group, shopName }: { group: OverdueBookingItem[]; shopName: string }) {
  const first = group[0];
  const items = group.map((b) => ({ name: b.items?.name ?? "the item", daysOverdue: Math.abs(b.days_until_return) }));
  const message = buildOverdueBookingReminderMessage(first.customers?.name ?? "there", items, shopName);
  const whatsapp = buildWhatsAppLink(first.customers?.phone, message);
  return (
    <ReminderButton
      url={"url" in whatsapp ? whatsapp.url : undefined}
      error={"error" in whatsapp ? whatsapp.error : undefined}
      label="Send Reminder"
    />
  );
}

// Per-item nudge — rendered only when the overdue items in a booking have
// DIFFERENT return dates (so each is a genuinely separate deadline worth
// chasing on its own), letting the operator remind about just that one.
// When every overdue item shares one return date, the booking-level
// button above already says everything a per-item one would, so this is
// skipped. Its message names that single item.
function OverdueReminderAction({ booking, shopName }: { booking: OverdueBookingItem; shopName: string }) {
  const days = Math.abs(booking.days_until_return);
  const message = buildOverdueReminderMessage(booking.customers?.name ?? "there", booking.items?.name ?? "the item", days, shopName);
  const whatsapp = buildWhatsAppLink(booking.customers?.phone, message);
  return (
    <ReminderButton
      url={"url" in whatsapp ? whatsapp.url : undefined}
      error={"error" in whatsapp ? whatsapp.error : undefined}
      label="Remind"
    />
  );
}

// "Pickup Overdue" section — the exact same booking-level / per-item
// reminder pair as Overdue Rentals above, just for a rental that was
// never collected (message names the item(s) and how many days ago it was
// ready). Per-item buttons appear only when the booking's uncollected
// items have different pickup dates.
function PickupOverdueBookingReminderAction({ group, shopName }: { group: PickupOverdueBookingItem[]; shopName: string }) {
  const first = group[0];
  const items = group.map((p) => ({ name: p.items?.name ?? "the item", daysOverdue: p.days_overdue }));
  const message = buildPickupOverdueBookingReminderMessage(first.customers?.name ?? "there", items, shopName);
  const whatsapp = buildWhatsAppLink(first.customers?.phone, message);
  return (
    <ReminderButton
      url={"url" in whatsapp ? whatsapp.url : undefined}
      error={"error" in whatsapp ? whatsapp.error : undefined}
      label="Send Reminder"
    />
  );
}

function PickupOverdueReminderAction({ item, shopName }: { item: PickupOverdueBookingItem; shopName: string }) {
  const message = buildPickupOverdueReminderMessage(item.customers?.name ?? "there", item.items?.name ?? "the item", item.days_overdue, shopName);
  const whatsapp = buildWhatsAppLink(item.customers?.phone, message);
  return (
    <ReminderButton
      url={"url" in whatsapp ? whatsapp.url : undefined}
      error={"error" in whatsapp ? whatsapp.error : undefined}
      label="Remind"
    />
  );
}

// "Today's Pickups Due" — one "your order's ready today" nudge per
// booking. No per-item variant: every item in a group here shares the
// same pickup date (today), so the booking-level message covers it.
function PickupDueBookingReminderAction({ group, shopName }: { group: PickupDueBookingItem[]; shopName: string }) {
  const first = group[0];
  const names = group.map((p) => p.items?.name ?? "the item");
  const message = buildPickupDueBookingReminderMessage(first.customers?.name ?? "there", names, shopName);
  const whatsapp = buildWhatsAppLink(first.customers?.phone, message);
  return (
    <ReminderButton
      url={"url" in whatsapp ? whatsapp.url : undefined}
      error={"error" in whatsapp ? whatsapp.error : undefined}
      label="Send Reminder"
    />
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Non-null while a thumbnail's photo(s) are open in the shared
  // PhotoLightbox quick-view (opened from any section's item row).
  const [lightboxPhotos, setLightboxPhotos] = useState<string[] | null>(null);
  // Independent, non-blocking fetch — a fallback name/discount here just
  // makes a WhatsApp greeting generic for one render, whereas failing the
  // whole Dashboard load over a shop-settings hiccup would be a much
  // worse tradeoff for something this secondary.
  const [shopName, setShopName] = useState("the shop");
  const [occasionDiscountPercent, setOccasionDiscountPercent] = useState(10);
  // True only on the very first Dashboard mount of this app session (see
  // appBootIntro.ts) — logging in and landing here plays the intro;
  // navigating away to another tab and back does not. For that one
  // first-boot mount, stays true for up to 5s regardless of how long the
  // fetch itself actually takes — a fast (warm-backend) load never sees
  // the plain skeleton at all, since `loading` itself flips false and this
  // becomes moot; a slow (cold-start) load falls through to the regular
  // DashboardSkeleton once this expires, same as every other mount always
  // has.
  const [showIntro, setShowIntro] = useState(() => !hasShownBootIntro());

  useEffect(() => {
    markBootIntroShown();
  }, []);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!showIntro) return;
    const handle = setTimeout(() => setShowIntro(false), 5000);
    return () => clearTimeout(handle);
  }, [showIntro]);

  useEffect(() => {
    fetchShopSettings()
      .then((s) => {
        setShopName(s.name);
        setOccasionDiscountPercent(s.occasion_discount_percent);
      })
      .catch(() => {});
  }, []);

  const showSlowHint = useSlowLoadHint(loading);

  if (loading && showIntro) return <LogoIntroLoader />;

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
    pickups_overdue,
    pickups_due_today,
    pickups_due_this_week,
    occasions_today,
    occasions_this_week,
    outstanding_balance,
    pending_items,
    stats,
  } = summary;
  const weekPickups = withDayLabels(pickups_due_this_week, (p: PickupDueBookingItem) => p.pickup_date, summary.today);
  const weekOccasions = withDayLabels(occasions_this_week, (o: OccasionRow) => o.date, summary.today);

  const pendingItemGroups = groupByBooking(pending_items, (p) => p.booking_id);
  const dueTodayGroups = groupByBooking(due_today, (b) => b.booking_id);
  const pickupsOverdueGroups = groupByBooking(pickups_overdue, (p) => p.booking_id);
  const pickupsDueTodayGroups = groupByBooking(pickups_due_today, (p) => p.booking_id);
  const weekPickupGroups = groupByBooking(weekPickups, (p) => p.booking_id);
  // A group counts as urgent if ANY of its items does — sorted first as a
  // whole booking card, same "urgent bookings surface first" intent the
  // old flat urgentOverdue/otherOverdue split had, just applied per
  // booking now instead of per item.
  const overdueGroups = groupByBooking(overdue, (b) => b.booking_id).sort((a, b) => {
    const aUrgent = a.some((x) => x.next_customer_waiting) ? 0 : 1;
    const bUrgent = b.some((x) => x.next_customer_waiting) ? 0 : 1;
    return aUrgent - bUrgent;
  });

  return (
    <div className="page">
      <div className="dashboard-greeting">
        <div className="dashboard-greeting-badge">
          <Sparkles size={18} strokeWidth={2} aria-hidden="true" />
        </div>
        <div>
          <p className="dashboard-greeting-title">Hi {firstName(profile?.name ?? "there")} — here's your overview</p>
          <p className="dashboard-greeting-body">{buildDashboardOverview(summary)}</p>
        </div>
      </div>

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
          <div className="stat-value">₹{formatNumber(outstanding_balance)}</div>
          <div className="stat-label">Outstanding balance (active bookings)</div>
        </Link>
      </div>

      <CarouselTable
        id="pending-items-section"
        title="Items Pending"
        count={pendingItemGroups.length}
        headers={["Booking / Customer", "Missing"]}
        emptyMessage="Nothing flagged as still missing."
      >
        {pendingItemGroups.map((group) => {
          const first = group[0];
          return (
            <tr key={first.booking_id} {...bookingRowProps(navigate, first.booking_id)}>
              <td data-label="Booking / Customer">
                {first.booking_code} ·{" "}
                <Link to={`/customers?customer=${first.customer_id}`} onClick={stopRowClick}>
                  {first.customer_name}
                </Link>
              </td>
              <td data-label="Missing">
                {group.map((p) => (
                  <DashboardItemRow
                    key={`${p.booking_item_id}-${p.component_name}`}
                    itemId={p.item_id}
                    photos={p.item_photos}
                    code={p.item_code}
                    name={p.item_name}
                    onViewPhotos={setLightboxPhotos}
                  >
                    <div>
                      {p.component_name}
                      {p.actual_return_date ? ` · returned ${formatDateDisplay(p.actual_return_date)}` : ""}
                    </div>
                    {p.return_notes && <span className="dashboard-table-note">"{p.return_notes}"</span>}
                  </DashboardItemRow>
                ))}
              </td>
            </tr>
          );
        })}
      </CarouselTable>

      <CarouselTable
        id="items-due-section"
        title="Today's Returns Due"
        count={dueTodayGroups.length}
        headers={["Booking / Customer", "Items"]}
        emptyMessage="Nothing due back today."
      >
        {dueTodayGroups.map((group) => {
          const first = group[0];
          return (
            <tr key={first.booking_id} {...bookingRowProps(navigate, first.booking_id)}>
              <td data-label="Booking / Customer">
                {first.bookings?.booking_code} ·{" "}
                <Link to={`/customers?customer=${first.bookings?.customer_id}`} onClick={stopRowClick}>
                  {first.customers?.name}
                </Link>
              </td>
              <td data-label="Items">
                {group.map((b) => (
                  <DashboardItemRow
                    key={b.id}
                    itemId={b.item_id}
                    photos={b.items?.photos}
                    code={b.items?.item_code}
                    name={b.items?.name}
                    onViewPhotos={setLightboxPhotos}
                  />
                ))}
              </td>
            </tr>
          );
        })}
      </CarouselTable>

      <CarouselTable
        id="overdue-section"
        title="Overdue Rentals"
        count={overdueGroups.length}
        headers={["Booking / Customer", "Overdue Items"]}
        emptyMessage="Nothing overdue."
      >
        {overdueGroups.map((group) => {
          const first = group[0];
          // Per-item buttons appear only when this booking's overdue items
          // fall on different return dates — separate deadlines. All on one
          // date => a single universal reminder is enough.
          const mixedReturnDates = new Set(group.map((b) => b.return_date)).size > 1;
          return (
            <tr key={first.booking_id} {...bookingRowProps(navigate, first.booking_id)}>
              <td data-label="Booking / Customer">
                <div className="dashboard-booking-line">
                  <span>
                    {first.booking_code} ·{" "}
                    <Link to={`/customers?customer=${first.customer_id}`} onClick={stopRowClick}>
                      {first.customers?.name}
                    </Link>
                  </span>
                  <OverdueBookingReminderAction group={group} shopName={shopName} />
                </div>
              </td>
              <td data-label="Overdue Items">
                {group.map((b) => {
                  const days = Math.abs(b.days_until_return);
                  return (
                    <DashboardItemRow
                      key={b.id}
                      itemId={b.item_id}
                      photos={b.items?.photos}
                      code={b.items?.item_code}
                      name={b.items?.name}
                      onViewPhotos={setLightboxPhotos}
                      action={mixedReturnDates ? <OverdueReminderAction booking={b} shopName={shopName} /> : undefined}
                    >
                      <div>
                        {days} day{days === 1 ? "" : "s"} overdue
                        {b.next_customer_waiting && (
                          <span className="dashboard-table-urgent">
                            Next: {b.next_booking_code} — {b.next_customer_name} ({b.next_pickup_date})
                          </span>
                        )}
                      </div>
                    </DashboardItemRow>
                  );
                })}
              </td>
            </tr>
          );
        })}
      </CarouselTable>

      <CarouselTable
        id="pickups-overdue-section"
        title="Pickup Overdue"
        count={pickupsOverdueGroups.length}
        headers={["Booking / Customer", "Uncollected Items"]}
        emptyMessage="Nothing waiting to be picked up."
      >
        {pickupsOverdueGroups.map((group) => {
          const first = group[0];
          // Per-item buttons only when the uncollected items in this
          // booking were ready on different dates — separate nudges worth
          // sending. All ready the same day => the one booking-level
          // reminder covers it.
          const mixedPickupDates = new Set(group.map((p) => p.pickup_date)).size > 1;
          return (
            <tr key={first.booking_id} {...bookingRowProps(navigate, first.booking_id)}>
              <td data-label="Booking / Customer">
                <div className="dashboard-booking-line">
                  <span>
                    {first.bookings?.booking_code} ·{" "}
                    {first.customers ? (
                      <Link to={`/customers?customer=${first.bookings?.customer_id}`} onClick={stopRowClick}>
                        {first.customers.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </span>
                  <PickupOverdueBookingReminderAction group={group} shopName={shopName} />
                </div>
              </td>
              <td data-label="Uncollected Items">
                {group.map((p) => (
                  <DashboardItemRow
                    key={p.id}
                    itemId={p.item_id}
                    photos={p.items?.photos}
                    code={p.items?.item_code}
                    name={p.items?.name}
                    onViewPhotos={setLightboxPhotos}
                    action={mixedPickupDates ? <PickupOverdueReminderAction item={p} shopName={shopName} /> : undefined}
                  >
                    <div>
                      ready {p.days_overdue} day{p.days_overdue === 1 ? "" : "s"} ago
                    </div>
                  </DashboardItemRow>
                ))}
              </td>
            </tr>
          );
        })}
      </CarouselTable>

      <CarouselTable
        id="pickups-due-section"
        title="Today's Pickups Due"
        count={pickupsDueTodayGroups.length}
        headers={["Booking / Customer", "Items"]}
        emptyMessage="Nothing to prep for pickup today."
      >
        {pickupsDueTodayGroups.map((group) => {
          const first = group[0];
          return (
            <tr key={first.booking_id} {...bookingRowProps(navigate, first.booking_id)}>
              <td data-label="Booking / Customer">
                <div className="dashboard-booking-line">
                  <span>
                    {first.bookings?.booking_code} ·{" "}
                    {first.customers ? (
                      <Link to={`/customers?customer=${first.bookings?.customer_id}`} onClick={stopRowClick}>
                        {first.customers.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </span>
                  <PickupDueBookingReminderAction group={group} shopName={shopName} />
                </div>
              </td>
              <td data-label="Items">
                {group.map((p) => (
                  <DashboardItemRow
                    key={p.id}
                    itemId={p.item_id}
                    photos={p.items?.photos}
                    code={p.items?.item_code}
                    name={p.items?.name}
                    onViewPhotos={setLightboxPhotos}
                  />
                ))}
              </td>
            </tr>
          );
        })}
      </CarouselTable>

      <CarouselTable
        id="week-pickups-section"
        title="This Week's Pickups Due"
        count={weekPickupGroups.length}
        headers={["Booking / Customer", "Items"]}
        emptyMessage="Nothing else due for pickup this week."
      >
        {weekPickupGroups.map((group) => {
          const first = group[0];
          return (
            <tr key={first.booking_id} {...bookingRowProps(navigate, first.booking_id)}>
              <td data-label="Booking / Customer">
                {first.bookings?.booking_code} ·{" "}
                {first.customers ? (
                  <Link to={`/customers?customer=${first.bookings?.customer_id}`} onClick={stopRowClick}>
                    {first.customers.name}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              {/* Each item keeps its own day label here (not hoisted to a
                  shared column) — a booking with items on genuinely
                  different days within the week needs that visible per
                  item, exactly the case grouping-by-booking must not
                  obscure. */}
              <td data-label="Items">
                {group.map((p) => (
                  <DashboardItemRow
                    key={p.id}
                    itemId={p.item_id}
                    photos={p.items?.photos}
                    code={p.items?.item_code}
                    name={p.items?.name}
                    onViewPhotos={setLightboxPhotos}
                  >
                    <div>{p.dayLabel}</div>
                  </DashboardItemRow>
                ))}
              </td>
            </tr>
          );
        })}
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

      {lightboxPhotos && lightboxPhotos.length > 0 && (
        <PhotoLightbox photos={lightboxPhotos} startIndex={0} onClose={() => setLightboxPhotos(null)} />
      )}
    </div>
  );
}
