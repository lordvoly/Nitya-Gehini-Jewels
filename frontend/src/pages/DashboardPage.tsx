import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboardSummary, type DashboardSummary, type PickupDueBookingItem } from "../lib/dashboard";
import { useAuth } from "../lib/auth";
import { DashboardAlerts } from "../components/dashboard/DashboardAlerts";
import { formatDateDisplay, addDaysToDateString, formatWeekdayDate } from "../lib/dates";
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
            🖼️
          </span>
        )}
      </Link>
      <div className="dashboard-pickup-info">
        <Link to={`/items/${pickup.item_id}`}>
          {pickup.items?.item_code} — {pickup.items?.name}
        </Link>
        <p>
          {pickup.customers?.name ?? "—"} ·{" "}
          <Link to={`/bookings?booking=${pickup.booking_id}`}>{pickup.bookings?.booking_code}</Link> ·{" "}
          {formatDateDisplay(pickup.pickup_date)}
        </p>
      </div>
    </div>
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

export default function DashboardPage() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page">Loading…</div>;
  if (error || !summary) return <div className="page wizard-error">{error ?? "Failed to load dashboard"}</div>;

  const { due_today, overdue, pickups_due_today, pickups_due_this_week, outstanding_balance, stats } = summary;
  const urgentOverdue = overdue.filter((b) => b.next_customer_waiting);
  const otherOverdue = overdue.filter((b) => !b.next_customer_waiting);
  const weekPickupGroups = groupPickupsByDay(pickups_due_this_week, summary.today);

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

      <div id="items-due-section">
        <div className="dashboard-section">
          <h2>Today's Returns Due ({due_today.length})</h2>
          {due_today.length === 0 && <p className="wizard-hint">Nothing due back today.</p>}
          {due_today.map((b) => (
            <Link key={b.id} to={`/bookings?booking=${b.booking_id}`} className="found-panel dashboard-link">
              <p>
                <strong>{b.bookings?.booking_code}</strong> — {b.items?.item_code} {b.items?.name} · {b.customers?.name}
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
              <p>
                <strong>{b.booking_code}</strong> — {b.items?.item_code} {b.items?.name} · {b.customers?.name} ·{" "}
                {Math.abs(b.days_until_return)} day{Math.abs(b.days_until_return) === 1 ? "" : "s"} overdue
              </p>
              <p>
                Next: {b.next_booking_code} — {b.next_customer_name} ({b.next_pickup_date})
              </p>
            </Link>
          ))}
          {otherOverdue.map((b) => (
            <Link key={b.id} to={`/bookings?booking=${b.booking_id}`} className="overdue-panel dashboard-link">
              <p>
                <strong>{b.booking_code}</strong> — {b.items?.item_code} {b.items?.name} · {b.customers?.name} ·{" "}
                {Math.abs(b.days_until_return)} day{Math.abs(b.days_until_return) === 1 ? "" : "s"} overdue
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
    </div>
  );
}
