import { useEffect, useState } from "react";
import { fetchReports, type ReportsResponse } from "../lib/reports";

export default function ReportsPage() {
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [includeCollabs, setIncludeCollabs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReports()
      .then((res) => {
        setData(res);
        setFrom(res.period.from);
        setTo(res.period.to);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load reports"))
      .finally(() => setLoading(false));
  }, []);

  function refresh(nextFrom: string, nextTo: string, nextIncludeCollabs: boolean) {
    setLoading(true);
    setError(null);
    fetchReports({ from: nextFrom, to: nextTo, includeCollabs: nextIncludeCollabs })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load reports"))
      .finally(() => setLoading(false));
  }

  function handleFromChange(value: string) {
    setFrom(value);
    if (value && to) refresh(value, to, includeCollabs);
  }

  function handleToChange(value: string) {
    setTo(value);
    if (from && value) refresh(from, value, includeCollabs);
  }

  function handleToggleCollabs(checked: boolean) {
    setIncludeCollabs(checked);
    if (from && to) refresh(from, to, checked);
  }

  if (loading && !data) {
    return (
      <div className="d-flex align-items-center justify-content-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="alert alert-danger my-4 p-4 rounded-3 shadow-sm">
        <i className="ti ti-alert-triangle fs-4 me-2"></i>
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { summary, most_booked_items, repeat_customers, idle_inventory } = data;

  return (
    <div className="container-fluid p-0">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="h3 mb-1 fw-semibold text-dark">Reports & Analytics</h1>
          <p className="text-muted mb-0 small">Analyze revenue, top items, repeat customers, and idle inventory</p>
        </div>
      </div>

      {/* Date Filter & Collabs Bar */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3 d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <div className="d-flex align-items-center gap-2">
              <label className="form-label mb-0 fw-medium small text-muted">From:</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={from ?? ""}
                onChange={(e) => handleFromChange(e.target.value)}
              />
            </div>
            <div className="d-flex align-items-center gap-2">
              <label className="form-label mb-0 fw-medium small text-muted">To:</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={to ?? ""}
                onChange={(e) => handleToChange(e.target.value)}
              />
            </div>
          </div>

          <div className="form-check form-switch mb-0">
            <input
              type="checkbox"
              className="form-check-input cursor-pointer"
              id="collabSwitch"
              checked={includeCollabs}
              onChange={(e) => handleToggleCollabs(e.target.checked)}
            />
            <label className="form-check-label fw-medium small text-dark cursor-pointer" htmlFor="collabSwitch">
              Include Influencer / MUA Collabs
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 small mb-3">
          <i className="ti ti-alert-circle me-1"></i> {error}
        </div>
      )}

      {/* Metric Cards */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-md-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <span className="text-muted small text-uppercase fw-semibold">Total Revenue</span>
                <h2 className="mb-0 mt-1 fw-bold text-success">₹{summary.total_revenue.toLocaleString("en-IN")}</h2>
              </div>
              <div className="icon-shape rounded-circle bg-success-subtle text-success p-3">
                <i className="ti ti-currency-rupee fs-3"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-md-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <span className="text-muted small text-uppercase fw-semibold">Total Bookings</span>
                <h2 className="mb-0 mt-1 fw-bold text-dark">{summary.total_bookings}</h2>
              </div>
              <div className="icon-shape rounded-circle bg-primary-subtle text-primary p-3">
                <i className="ti ti-calendar-stats fs-3"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-md-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <span className="text-muted small text-uppercase fw-semibold">Rentals / Sales</span>
                <h2 className="mb-0 mt-1 fw-bold text-dark">
                  {summary.rental_count} <span className="text-muted fs-5">/</span> {summary.sale_count}
                </h2>
              </div>
              <div className="icon-shape rounded-circle bg-warning-subtle text-warning p-3">
                <i className="ti ti-tag fs-3"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reports Tables Grid */}
      <div className="row g-4 mb-4">
        {/* Most Booked Items */}
        <div className="col-12 col-lg-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white py-3 border-bottom">
              <h5 className="mb-0 fw-semibold text-dark d-flex align-items-center gap-2">
                <i className="ti ti-trophy text-warning"></i> Most-Booked Items
              </h5>
            </div>
            <div className="table-responsive">
              {most_booked_items.length === 0 ? (
                <div className="text-center py-4 text-muted small">No bookings in this period.</div>
              ) : (
                <table className="table align-middle text-nowrap table-hover mb-0">
                  <thead className="table-light">
                    <tr className="small text-muted text-uppercase">
                      <th>Code</th>
                      <th>Item Name</th>
                      <th className="text-end">Bookings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {most_booked_items.map((i) => (
                      <tr key={i.item_id}>
                        <td>
                          <span className="badge bg-light text-dark border font-monospace">{i.item_code}</span>
                        </td>
                        <td className="fw-semibold text-dark">{i.name}</td>
                        <td className="text-end font-monospace fw-bold text-primary">{i.booking_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Repeat Customers */}
        <div className="col-12 col-lg-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white py-3 border-bottom">
              <h5 className="mb-0 fw-semibold text-dark d-flex align-items-center gap-2">
                <i className="ti ti-users text-primary"></i> Repeat Customers
              </h5>
            </div>
            <div className="table-responsive">
              {repeat_customers.length === 0 ? (
                <div className="text-center py-4 text-muted small">No repeat customers in this period yet.</div>
              ) : (
                <table className="table align-middle text-nowrap table-hover mb-0">
                  <thead className="table-light">
                    <tr className="small text-muted text-uppercase">
                      <th>Customer</th>
                      <th>Bookings</th>
                      <th className="text-end">Total Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repeat_customers.map((c) => (
                      <tr key={c.customer_id}>
                        <td>
                          <div className="fw-semibold text-dark">{c.name}</div>
                          <span className="text-muted fs-7">{c.phone}</span>
                        </td>
                        <td className="font-monospace fw-semibold">{c.booking_count}</td>
                        <td className="text-end font-monospace fw-bold text-success">
                          ₹{c.total_spend.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Idle Inventory Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white py-3 border-bottom d-flex align-items-center justify-content-between">
          <div>
            <h5 className="mb-0 fw-semibold text-dark d-flex align-items-center gap-2">
              <i className="ti ti-clock-pause text-muted"></i> Idle Inventory (No booking in last 90 days)
            </h5>
          </div>
          <span className="badge bg-secondary-subtle text-secondary rounded-pill px-3 py-1">
            {idle_inventory.length} items
          </span>
        </div>
        <div className="table-responsive">
          {idle_inventory.length === 0 ? (
            <div className="text-center py-4 text-muted small">
              <i className="ti ti-sparkles text-success fs-3 d-block mb-1"></i> Every active item has been booked in the last 90 days!
            </div>
          ) : (
            <table className="table align-middle text-nowrap table-hover mb-0">
              <thead className="table-light">
                <tr className="small text-muted text-uppercase">
                  <th>Code</th>
                  <th>Item Name</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {idle_inventory.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <span className="badge bg-light text-dark border font-monospace">{i.item_code}</span>
                    </td>
                    <td className="fw-semibold text-dark">{i.name}</td>
                    <td>
                      <span className="badge bg-secondary-subtle text-secondary">{i.category}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
