import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboardSummary, type DashboardSummary } from "../lib/dashboard";
import "../styles/shared.css";

export default function DashboardPage() {
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
      <div className="stat-grid">
        <Link to="/items" className="stat-card">
          <div className="stat-value">{stats.total_active_items}</div>
          <div className="stat-label">Active items</div>
        </Link>
        <Link to="/items" className="stat-card">
          <div className="stat-value">{stats.items_out}</div>
          <div className="stat-label">Items out</div>
        </Link>
        <Link to="/customers" className="stat-card">
          <div className="stat-value">{stats.total_customers}</div>
          <div className="stat-label">Customers</div>
        </Link>
        <Link to="/bookings" className="stat-card">
          <div className="stat-value">{stats.bookings_this_week}</div>
          <div className="stat-label">Bookings this week</div>
        </Link>
      </div>

      <div className="stat-card stat-card-wide">
        <div className="stat-value">₹{outstanding_balance}</div>
        <div className="stat-label">Outstanding balance (active bookings)</div>
      </div>

      <div className="dashboard-section">
        <h2>Today's Returns Due ({due_today.length})</h2>
        {due_today.length === 0 && <p className="wizard-hint">Nothing due back today.</p>}
        {due_today.map((b) => (
          <Link key={b.id} to={`/bookings?booking=${b.id}`} className="found-panel dashboard-link">
            <p>
              <strong>{b.booking_code}</strong> — {b.items?.item_code} {b.items?.name} · {b.customers?.name}
            </p>
          </Link>
        ))}
      </div>

      <div className="dashboard-section">
        <h2>Overdue Rentals ({overdue.length})</h2>
        {overdue.length === 0 && <p className="wizard-hint">Nothing overdue.</p>}
        {urgentOverdue.map((b) => (
          <Link key={b.id} to={`/bookings?booking=${b.id}`} className="overdue-panel urgent dashboard-link">
            <p>
              <span className="badge-urgent">Next customer waiting</span>
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
          <Link key={b.id} to={`/bookings?booking=${b.id}`} className="overdue-panel dashboard-link">
            <p>
              <strong>{b.booking_code}</strong> — {b.items?.item_code} {b.items?.name} · {b.customers?.name} ·{" "}
              {Math.abs(b.days_until_return)} day{Math.abs(b.days_until_return) === 1 ? "" : "s"} overdue
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
