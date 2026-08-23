import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchReports, type ReportsResponse } from "../lib/reports";
import { useSlowLoadHint } from "../lib/useSlowLoadHint";
import { ListPageSkeleton } from "../components/common/Skeleton";
import "../styles/shared.css";

export default function ReportsPage() {
  const location = useLocation();
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

  // Deep-link support for Dashboard's "Outstanding balance" card
  // (/reports#outstanding-dues-section) — scroll only after data has
  // rendered, since the target section doesn't exist in the DOM until then.
  useEffect(() => {
    if (!data || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data, location.hash]);

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

  const showSlowHint = useSlowLoadHint(loading && !data);

  if (loading && !data)
    return (
      <>
        <ListPageSkeleton />
        {showSlowHint && (
          <p className="wizard-hint slow-load-hint">
            Still loading. The server may be waking up after a period of inactivity, which can take up to a minute.
          </p>
        )}
      </>
    );
  if (error && !data) return <div className="page wizard-error">{error}</div>;
  if (!data) return null;

  const { summary, most_booked_items, repeat_customers, idle_inventory, pnl, outstanding_dues } = data;

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

      <div className="dashboard-section">
        <h2>Profit &amp; Loss</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">₹{pnl.revenue}</div>
            <div className="stat-label">Revenue</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">₹{pnl.expenses}</div>
            <div className="stat-label">Expenses</div>
          </div>
        </div>
        <div className="stat-card stat-card-wide">
          <div className="stat-value">₹{pnl.net}</div>
          <div className="stat-label">Net (revenue − expenses)</div>
        </div>
        {pnl.by_category.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {pnl.by_category.map((c) => (
                  <tr key={c.category}>
                    <td data-label="Category">{c.category}</td>
                    <td data-label="Amount">₹{c.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

      <div id="outstanding-dues-section" className="dashboard-section">
        <h2>Outstanding Dues</h2>
        <p className="wizard-hint">
          Every booking still owed money, regardless of when it was made — not scoped to the date range above.
        </p>
        {outstanding_dues.length === 0 ? (
          <div className="empty-state">
            <h3>Nothing outstanding</h3>
            <p>Every booking is fully paid.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Customer</th>
                  <th>Balance Due</th>
                </tr>
              </thead>
              <tbody>
                {outstanding_dues.map((d) => (
                  <tr key={d.booking_id}>
                    <td data-label="Booking">
                      <Link to={`/bookings?booking=${d.booking_id}`}>{d.booking_code}</Link>
                    </td>
                    <td data-label="Customer">{d.customer_name}</td>
                    <td data-label="Balance Due">₹{d.balance_due}</td>
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
