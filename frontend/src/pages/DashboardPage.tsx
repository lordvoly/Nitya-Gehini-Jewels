import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboardSummary, type DashboardSummary } from "../lib/dashboard";
import { useAuth } from "../lib/auth";
import { DashboardAlerts } from "../components/dashboard/DashboardAlerts";
import "../styles/shared.css";

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

  const { due_today, overdue, outstanding_balance, stats } = summary;
  const urgentOverdue = overdue.filter((b) => b.next_customer_waiting);
  const otherOverdue = overdue.filter((b) => !b.next_customer_waiting);

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
    </div>
  );
}
