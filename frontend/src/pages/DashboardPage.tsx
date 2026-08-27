import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ImageOff } from "lucide-react";
import { fetchDashboardSummary, type DashboardSummary, type PickupDueBookingItem, type OccasionRow } from "../lib/dashboard";
import type { PendingItem } from "../lib/pendingItems";
import { useAuth } from "../lib/auth";
import { DashboardAlerts } from "../components/dashboard/DashboardAlerts";
import { DashboardSkeleton } from "../components/common/Skeleton";
import { useSlowLoadHint } from "../lib/useSlowLoadHint";
import { formatDateDisplay, addDaysToDateString, formatWeekdayDate } from "../lib/dates";
import { fetchShopSettings } from "../lib/shopSettings";
import { buildWhatsAppLink, buildOccasionMessage } from "../lib/whatsapp";
import "../styles/shared.css";

// One card per physical item due for pickup — thumbnail+name link to the
// item's own detail page (Feature A/B convention), booking code links to
// the booking, same "everything links out, nothing duplicates an action"
// rule the rest of the Dashboard already follows. Not a single big Link
// like Returns Due's rows, since this row needs two different link
// destinations at once.
function PickupRow({ pickup }: { pickup: PickupDueBookingItem }) {
  return (
    <div className="found-panel dashboard-pickup-row">
      <Link to={`/items/${pickup.item_id}`} className="line-item-thumb-link" aria-label={`View ${pickup.items?.name}`}>
        {pickup.items?.photos?.[0] ? (
          <img src={pickup.items.photos[0]} alt="" className="line-item-thumb" />
        ) : (
          <span className="line-item-thumb line-item-thumb-placeholder" aria-hidden="true">
            <ImageOff size={16} strokeWidth={2} />
          </span>
        )}
      </Link>
      <div className="dashboard-pickup-info">
        <Link to={`/items/${pickup.item_id}`} className="dashboard-row-title">
          {pickup.items?.item_code} — {pickup.items?.name}
        </Link>
        <p className="dashboard-row-meta">
          {pickup.customers?.name ?? "—"} ·{" "}
          <Link to={`/bookings?booking=${pickup.booking_id}`}>{pickup.bookings?.booking_code}</Link> ·{" "}
          {formatDateDisplay(pickup.pickup_date)}
        </p>
      </div>
    </div>
  );
}

// One row per missing-and-never-charged-for component — a single Link
// (like Returns Due's rows) straight to the booking, since there's only
// one meaningful destination here, not two like PickupRow's thumbnail vs.
// booking split.
function PendingItemRow({ pending }: { pending: PendingItem }) {
  return (
    <Link to={`/bookings?booking=${pending.booking_id}`} className="overdue-panel dashboard-link">
      <p className="dashboard-row-title">
        {pending.component_name} — {pending.item_code} · {pending.item_name}
      </p>
      <p className="dashboard-row-meta">
        {pending.booking_code} · {pending.customer_name}
        {pending.actual_return_date ? ` · returned ${formatDateDisplay(pending.actual_return_date)}` : ""}
      </p>
      {pending.return_notes && <p className="dashboard-row-meta">"{pending.return_notes}"</p>}
    </Link>
  );
}

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

// One row per birthday/anniversary — WhatsApp greeting button reuses the
// exact wa.me pattern the invoice-share feature already established
// (buildWhatsAppLink), just with occasion-specific pre-filled text instead
// of a receipt link. Primary phone only, same as buildWhatsAppLink's own
// default. A customer with no valid phone on file gets a genuinely
// disabled button with a reason in its title, never a broken link — same
// treatment ReceiptPage's own WhatsApp button already uses.
function OccasionRowItem({
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
  return (
    <div className="found-panel dashboard-occasion-row">
      <div className="dashboard-occasion-info">
        <p className="dashboard-row-title">{occasion.name}</p>
        <span className={`pill ${occasion.type === "birthday" ? "pill-active" : "pill-info"}`}>
          {occasion.type === "birthday" ? "Birthday" : "Anniversary"}
        </span>
      </div>
      {"url" in whatsapp ? (
        <a href={whatsapp.url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-compact">
          Send Greeting
        </a>
      ) : (
        <button className="btn-secondary btn-compact" disabled title={whatsapp.error}>
          Send Greeting
        </button>
      )}
    </div>
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
  const weekPickupGroups = groupPickupsByDay(pickups_due_this_week, summary.today);
  const weekOccasionGroups = groupOccasionsByDay(occasions_this_week, summary.today);

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

      {pending_items.length > 0 && (
        <div id="pending-items-section">
          <div className="dashboard-section">
            <h2>Items Pending ({pending_items.length})</h2>
            <p className="wizard-hint">
              Flagged as still missing when a return was processed — not yet formally charged for.
            </p>
            {pending_items.map((p) => (
              <PendingItemRow key={`${p.booking_item_id}-${p.component_name}`} pending={p} />
            ))}
          </div>
        </div>
      )}

      <div id="items-due-section">
        <div className="dashboard-section">
          <h2>Today's Returns Due ({due_today.length})</h2>
          {due_today.length === 0 && <p className="wizard-hint">Nothing due back today.</p>}
          {due_today.map((b) => (
            <Link key={b.id} to={`/bookings?booking=${b.booking_id}`} className="found-panel dashboard-link">
              <p className="dashboard-row-title">
                {b.items?.item_code} — {b.items?.name}
              </p>
              <p className="dashboard-row-meta">
                {b.bookings?.booking_code} · {b.customers?.name}
              </p>
            </Link>
          ))}
        </div>

        <div className="dashboard-section">
          <h2>Overdue Rentals ({overdue.length})</h2>
          {overdue.length === 0 && <p className="wizard-hint">Nothing overdue.</p>}
          {urgentOverdue.map((b) => (
            <Link key={b.id} to={`/bookings?booking=${b.booking_id}`} className="overdue-panel urgent dashboard-link">
              <p>
                <span className="pill pill-attention">Next customer waiting</span>
              </p>
              <p className="dashboard-row-title">
                {b.items?.item_code} — {b.items?.name}
              </p>
              <p className="dashboard-row-meta">
                {b.booking_code} · {b.customers?.name} · {Math.abs(b.days_until_return)} day
                {Math.abs(b.days_until_return) === 1 ? "" : "s"} overdue
              </p>
              <p className="dashboard-row-meta">
                Next: {b.next_booking_code} — {b.next_customer_name} ({b.next_pickup_date})
              </p>
            </Link>
          ))}
          {otherOverdue.map((b) => (
            <Link key={b.id} to={`/bookings?booking=${b.booking_id}`} className="overdue-panel dashboard-link">
              <p className="dashboard-row-title">
                {b.items?.item_code} — {b.items?.name}
              </p>
              <p className="dashboard-row-meta">
                {b.booking_code} · {b.customers?.name} · {Math.abs(b.days_until_return)} day
                {Math.abs(b.days_until_return) === 1 ? "" : "s"} overdue
              </p>
            </Link>
          ))}
        </div>
      </div>

      <div id="pickups-due-section">
        <div className="dashboard-section">
          <h2>Today's Pickups Due ({pickups_due_today.length})</h2>
          {pickups_due_today.length === 0 && <p className="wizard-hint">Nothing to prep for pickup today.</p>}
          {pickups_due_today.map((p) => (
            <PickupRow key={p.id} pickup={p} />
          ))}
        </div>

        <div className="dashboard-section">
          <h2>This Week's Pickups Due ({pickups_due_this_week.length})</h2>
          {pickups_due_this_week.length === 0 && <p className="wizard-hint">Nothing else due for pickup this week.</p>}
          {weekPickupGroups.map((group) => (
            <div key={group.date}>
              <p className="dashboard-day-group-label">{group.label}</p>
              {group.items.map((p) => (
                <PickupRow key={p.id} pickup={p} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div id="occasions-section">
        <div className="dashboard-section">
          <h2>Today's Occasions ({occasions_today.length})</h2>
          {occasions_today.length === 0 && <p className="wizard-hint">No birthdays or anniversaries today.</p>}
          {occasions_today.map((o) => (
            <OccasionRowItem
              key={`${o.customer_id}-${o.type}`}
              occasion={o}
              shopName={shopName}
              discountPercent={occasionDiscountPercent}
            />
          ))}
        </div>

        <div className="dashboard-section">
          <h2>This Week's Occasions ({occasions_this_week.length})</h2>
          {occasions_this_week.length === 0 && <p className="wizard-hint">No birthdays or anniversaries later this week.</p>}
          {weekOccasionGroups.map((group) => (
            <div key={group.date}>
              <p className="dashboard-day-group-label">{group.label}</p>
              {group.items.map((o) => (
                <OccasionRowItem
                  key={`${o.customer_id}-${o.type}`}
                  occasion={o}
                  shopName={shopName}
                  discountPercent={occasionDiscountPercent}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
