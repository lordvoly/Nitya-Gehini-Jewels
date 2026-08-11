import { useEffect, useState } from "react";
import { fetchReports, type ReportsResponse } from "../lib/reports";
import "../styles/shared.css";

export default function ReportsPage() {
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [includeCollabs, setIncludeCollabs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // First load: no from/to, so the backend picks "this month" (IST) for
  // us — we only ever display what it resolved, never compute it here.
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

  if (loading && !data) return <div className="page">Loading…</div>;
  if (error && !data) return <div className="page wizard-error">{error}</div>;
  if (!data) return null;

  const { summary, most_booked_items, repeat_customers, idle_inventory } = data;

  return (
    <div className="page">
      <h2>Reports</h2>

      <div className="button-grid date-range-row">
        <label className="field-label">
          From
          <input type="date" value={from ?? ""} onChange={(e) => handleFromChange(e.target.value)} />
        </label>
        <label className="field-label">
          To
          <input type="date" value={to ?? ""} onChange={(e) => handleToChange(e.target.value)} />
        </label>
      </div>

      {error && <p className="wizard-error">{error}</p>}
      {loading && <p className="wizard-hint">Refreshing…</p>}

      <div className="dashboard-section">
        <h2>Bookings This Period</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{summary.total_bookings}</div>
            <div className="stat-label">Total bookings</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {summary.rental_count} / {summary.sale_count}
            </div>
            <div className="stat-label">Rentals / Sales</div>
          </div>
        </div>
        <div className="stat-card stat-card-wide">
          <div className="stat-value">₹{summary.total_revenue}</div>
          <div className="stat-label">Total revenue (price charged)</div>
        </div>
        <p className="wizard-hint">
          Total bookings counts family transactions (one visit, however many items). Rentals/Sales counts
          individual items — a visit with one rental and one sale in the same booking adds 1 to both.
        </p>
      </div>

      <label className="field-label checkbox-row">
        <input
          type="checkbox"
          checked={includeCollabs}
          onChange={(e) => handleToggleCollabs(e.target.checked)}
        />
        Include influencer/MUA collabs
      </label>
      <p className="wizard-hint">
        Applies to Most-Booked Items and Repeat Customers only — revenue and idle inventory always include
        everything.
      </p>

      <div className="dashboard-section">
        <h2>Most-Booked Items</h2>
        {most_booked_items.length === 0 ? (
          <div className="empty-state">
            <h3>No bookings in this period</h3>
            <p>Try a wider date range.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Bookings</th>
                </tr>
              </thead>
              <tbody>
                {most_booked_items.map((i) => (
                  <tr key={i.item_id}>
                    <td data-label="Code">{i.item_code}</td>
                    <td data-label="Name">{i.name}</td>
                    <td data-label="Bookings">{i.booking_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="dashboard-section">
        <h2>Repeat Customers</h2>
        {repeat_customers.length === 0 ? (
          <div className="empty-state">
            <h3>No repeat customers yet</h3>
            <p>Customers with more than one booking will show up here.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Bookings</th>
                  <th>Total Spend</th>
                </tr>
              </thead>
              <tbody>
                {repeat_customers.map((c) => (
                  <tr key={c.customer_id}>
                    <td data-label="Name">{c.name}</td>
                    <td data-label="Phone">{c.phone}</td>
                    <td data-label="Bookings">{c.booking_count}</td>
                    <td data-label="Total Spend">₹{c.total_spend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="dashboard-section">
        <h2>Idle Inventory</h2>
        <p className="wizard-hint">Active items with no booking in the last 90 days.</p>
        {idle_inventory.length === 0 ? (
          <div className="empty-state">
            <h3>Nothing idle</h3>
            <p>Every active item has moved in the last 90 days.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {idle_inventory.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Code">{i.item_code}</td>
                    <td data-label="Name">{i.name}</td>
                    <td data-label="Category">{i.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
