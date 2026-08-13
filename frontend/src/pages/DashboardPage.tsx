import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboardSummary, type DashboardSummary } from "../lib/dashboard";
import { DEMO_DASHBOARD_SUMMARY } from "../lib/demoData";
import { useAuth } from "../lib/auth";
import { DashboardAlerts } from "../components/dashboard/DashboardAlerts";

export default function DashboardPage() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch(() => setSummary(DEMO_DASHBOARD_SUMMARY))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const { due_today, overdue, outstanding_balance, stats } = summary;
  const urgentOverdue = overdue.filter((b) => b.next_customer_waiting);
  const otherOverdue = overdue.filter((b) => !b.next_customer_waiting);

  return (
    <div className="container-fluid p-0">
      {/* Page Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="h3 mb-1 fw-semibold text-dark">Dashboard Overview</h1>
          <p className="text-muted mb-0 small">
            Welcome back! Here is what's happening with your inventory and rentals today.
          </p>
        </div>
        <div className="d-flex gap-2">
          <Link to="/bookings" className="btn btn-primary d-inline-flex align-items-center gap-1">
            <i className="ti ti-plus"></i> New Booking
          </Link>
          <Link to="/items" className="btn btn-outline-secondary d-inline-flex align-items-center gap-1">
            <i className="ti ti-box"></i> Add Item
          </Link>
        </div>
      </div>

      {/* System Alerts */}
      <DashboardAlerts summary={summary} userId={session?.user.id ?? null} />

      {/* Stat Cards Grid */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <Link to="/items" className="text-decoration-none">
            <div className="card h-100 border-0 shadow-sm hover-shadow transition">
              <div className="card-body p-3 d-flex align-items-center justify-content-between">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Active Items</span>
                  <h2 className="mb-0 mt-1 fw-bold text-dark">{stats.total_active_items}</h2>
                </div>
                <div
                  className="icon-shape rounded-circle bg-primary-subtle text-primary p-3 d-flex align-items-center justify-content-center"
                  style={{ width: 50, height: 50 }}
                >
                  <i className="ti ti-box-seam fs-3"></i>
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <Link to="/items" className="text-decoration-none">
            <div className="card h-100 border-0 shadow-sm hover-shadow transition">
              <div className="card-body p-3 d-flex align-items-center justify-content-between">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Items Out</span>
                  <h2 className="mb-0 mt-1 fw-bold text-dark">{stats.items_out}</h2>
                </div>
                <div
                  className="icon-shape rounded-circle bg-warning-subtle text-warning p-3 d-flex align-items-center justify-content-center"
                  style={{ width: 50, height: 50 }}
                >
                  <i className="ti ti-truck fs-3"></i>
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <Link to="/customers" className="text-decoration-none">
            <div className="card h-100 border-0 shadow-sm hover-shadow transition">
              <div className="card-body p-3 d-flex align-items-center justify-content-between">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Total Customers</span>
                  <h2 className="mb-0 mt-1 fw-bold text-dark">{stats.total_customers}</h2>
                </div>
                <div
                  className="icon-shape rounded-circle bg-success-subtle text-success p-3 d-flex align-items-center justify-content-center"
                  style={{ width: 50, height: 50 }}
                >
                  <i className="ti ti-users fs-3"></i>
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <Link to="/bookings" className="text-decoration-none">
            <div className="card h-100 border-0 shadow-sm hover-shadow transition">
              <div className="card-body p-3 d-flex align-items-center justify-content-between">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Bookings This Week</span>
                  <h2 className="mb-0 mt-1 fw-bold text-dark">{stats.bookings_this_week}</h2>
                </div>
                <div
                  className="icon-shape rounded-circle bg-info-subtle text-info p-3 d-flex align-items-center justify-content-center"
                  style={{ width: 50, height: 50 }}
                >
                  <i className="ti ti-calendar-stats fs-3"></i>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Outstanding Balance Banner */}
      <div className="card border-0 shadow-sm bg-gradient mb-4" style={{ backgroundColor: "#fff5f2" }}>
        <div className="card-body p-4 d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <span className="text-uppercase text-muted fw-semibold small">Outstanding Balance (Active Bookings)</span>
            <h1 className="fw-bold text-primary mb-0 mt-1">₹{outstanding_balance.toLocaleString("en-IN")}</h1>
          </div>
          <Link to="/bookings" className="btn btn-primary d-flex align-items-center gap-1">
            <i className="ti ti-receipt-refund"></i> View Bookings
          </Link>
        </div>
      </div>

      {/* Returns & Overdue Sections */}
      <div className="row g-4">
        {/* Today's Returns */}
        <div className="col-12 col-lg-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white py-3 border-bottom d-flex align-items-center justify-content-between">
              <h5 className="mb-0 fw-semibold text-dark d-flex align-items-center gap-2">
                <i className="ti ti-calendar-due text-info"></i> Today's Returns Due
              </h5>
              <span className="badge bg-info-subtle text-info rounded-pill px-3 py-2">
                {due_today.length} items
              </span>
            </div>
            <div className="card-body p-3">
              {due_today.length === 0 ? (
                <div className="text-center py-4 text-muted small">
                  <i className="ti ti-circle-check fs-2 text-success mb-2 d-block"></i>
                  Nothing due back today.
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {due_today.map((b) => (
                    <Link
                      key={b.id}
                      to={`/bookings?booking=${b.booking_id}`}
                      className="list-group-item list-group-item-action p-3 rounded mb-2 border text-decoration-none"
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <span className="badge bg-light text-dark me-2 font-monospace">{b.bookings?.booking_code}</span>
                          <strong className="text-dark">{b.items?.name}</strong>
                          <span className="text-muted small ms-1">({b.items?.item_code})</span>
                        </div>
                        <i className="ti ti-chevron-right text-muted"></i>
                      </div>
                      <div className="text-muted small mt-1">
                        Customer: <span className="fw-medium text-dark">{b.customers?.name}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Overdue Rentals */}
        <div className="col-12 col-lg-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white py-3 border-bottom d-flex align-items-center justify-content-between">
              <h5 className="mb-0 fw-semibold text-dark d-flex align-items-center gap-2">
                <i className="ti ti-alert-triangle text-danger"></i> Overdue Rentals
              </h5>
              <span className="badge bg-danger-subtle text-danger rounded-pill px-3 py-2">
                {overdue.length} overdue
              </span>
            </div>
            <div className="card-body p-3">
              {overdue.length === 0 ? (
                <div className="text-center py-4 text-muted small">
                  <i className="ti ti-sparkles fs-2 text-success mb-2 d-block"></i>
                  All rentals are on schedule! Nothing overdue.
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {urgentOverdue.map((b) => (
                    <Link
                      key={b.id}
                      to={`/bookings?booking=${b.booking_id}`}
                      className="list-group-item list-group-item-action p-3 rounded mb-2 border border-danger-subtle bg-danger-subtle text-decoration-none"
                    >
                      <div className="d-flex justify-content-between align-items-start mb-1">
                        <span className="badge bg-danger text-white">
                          <i className="ti ti-user-exclamation me-1"></i> Next customer waiting
                        </span>
                        <span className="text-danger fw-semibold small">
                          {Math.abs(b.days_until_return)} day{Math.abs(b.days_until_return) === 1 ? "" : "s"} overdue
                        </span>
                      </div>
                      <div className="fw-semibold text-dark">
                        <span className="badge bg-white text-dark me-2 font-monospace border">{b.booking_code}</span>
                        {b.items?.name} ({b.items?.item_code})
                      </div>
                      <div className="text-muted small mt-1">Customer: {b.customers?.name}</div>
                      <div className="text-danger small mt-2 pt-2 border-top border-danger-subtle">
                        Next: {b.next_booking_code} — {b.next_customer_name} ({b.next_pickup_date})
                      </div>
                    </Link>
                  ))}

                  {otherOverdue.map((b) => (
                    <Link
                      key={b.id}
                      to={`/bookings?booking=${b.booking_id}`}
                      className="list-group-item list-group-item-action p-3 rounded mb-2 border text-decoration-none"
                    >
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <span className="badge bg-light text-dark me-2 font-monospace">{b.booking_code}</span>
                          <strong className="text-dark">{b.items?.name}</strong>
                          <span className="text-muted small ms-1">({b.items?.item_code})</span>
                        </div>
                        <span className="text-warning fw-semibold small">
                          {Math.abs(b.days_until_return)} day{Math.abs(b.days_until_return) === 1 ? "" : "s"} overdue
                        </span>
                      </div>
                      <div className="text-muted small mt-1">Customer: {b.customers?.name}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
