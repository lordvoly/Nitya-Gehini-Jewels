import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchReports, type ReportsResponse } from "../lib/reports";
import { PAYMENT_METHOD_LABELS } from "../lib/payments";
import { formatDateDisplay } from "../lib/dates";
import { useSlowLoadHint } from "../lib/useSlowLoadHint";
import { ListPageSkeleton } from "../components/common/Skeleton";
import { MostBookedBarChart } from "../components/reports/MostBookedBarChart";
import { RevenueTrendChart } from "../components/reports/RevenueTrendChart";
import "../styles/shared.css";

type RangePreset = "week" | "month" | "3months" | "6months" | "year" | "lifetime";

const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "week", label: "Past Week" },
  { value: "month", label: "Past Month" },
  { value: "3months", label: "Past 3 Months" },
  { value: "6months", label: "Past 6 Months" },
  { value: "year", label: "Past Year" },
  { value: "lifetime", label: "Lifetime" },
];

export default function ReportsPage() {
  const location = useLocation();
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [includeCollabs, setIncludeCollabs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which quick-select pill (if any) produced the currently-shown period —
  // null means "custom", i.e. the calendar pickers were edited directly
  // and no longer match any preset's resolved range. Tracked here rather
  // than inferred from period.from/to, since a preset's own resolved
  // dates could coincidentally match hand-picked ones.
  const [activePreset, setActivePreset] = useState<RangePreset | null>("month");
  // Which side of the Payment Methods section is showing — client-side
  // only, since both breakdowns already come back in the same response
  // (no reason to round-trip to the backend just to flip this).
  const [paymentMethodsView, setPaymentMethodsView] = useState<"received" | "refunded">("received");

  // First load: explicitly request the "Past Month" preset (the new
  // default, replacing the old "this calendar month" one) so activePreset
  // starts correctly highlighted — we still only ever display whatever
  // period the backend actually resolved, never compute it here.
  useEffect(() => {
    fetchReports({ range: "month" })
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

  function handlePresetClick(preset: RangePreset) {
    setActivePreset(preset);
    setLoading(true);
    setError(null);
    fetchReports({ range: preset, includeCollabs })
      .then((res) => {
        setData(res);
        setFrom(res.period.from);
        setTo(res.period.to);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load reports"))
      .finally(() => setLoading(false));
  }

  function handleFromChange(value: string) {
    setFrom(value);
    setActivePreset(null);
    if (value && to) refresh(value, to, includeCollabs);
  }

  function handleToChange(value: string) {
    setTo(value);
    setActivePreset(null);
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

  const { summary, most_booked_items, revenue_trend, repeat_customers, idle_inventory, pnl, outstanding_dues, payment_methods, refund_methods } = data;
  const shownBreakdown = paymentMethodsView === "received" ? payment_methods : refund_methods;

  const sections = [
    { id: "overview-section", label: "Overview" },
    { id: "revenue-trend-section", label: "Revenue Trend" },
    { id: "pnl-section", label: "P&L" },
    { id: "payment-methods-section", label: "Payment Methods" },
    { id: "most-booked-section", label: "Most-Booked" },
    { id: "repeat-customers-section", label: "Repeat Customers" },
    { id: "idle-inventory-section", label: "Idle Inventory" },
    { id: "outstanding-dues-section", label: "Outstanding Dues" },
  ];
  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="page">
      <h2>Reports</h2>

      <nav className="report-nav" aria-label="Jump to report section">
        {sections.map((s) => (
          <button key={s.id} type="button" className="report-nav-pill" onClick={() => jumpTo(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="filter-pill-row" aria-label="Quick date range">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={activePreset === p.value ? "filter-pill active" : "filter-pill"}
            onClick={() => handlePresetClick(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

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
      <p className="wizard-hint">
        Pick a quick range above, or set exact dates here — editing either field switches to a custom range.
      </p>

      {error && <p className="wizard-error">{error}</p>}
      {loading && <p className="wizard-hint">Refreshing…</p>}

      <div id="overview-section" className="dashboard-section">
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

      <div id="revenue-trend-section" className="dashboard-section">
        <h2>Revenue Trend</h2>
        {revenue_trend.points.length === 0 ? (
          <div className="empty-state">
            <h3>Nothing to chart yet</h3>
            <p>Try a wider date range.</p>
          </div>
        ) : (
          <>
            <RevenueTrendChart trend={revenue_trend} />
            <p className="wizard-hint">
              Grouped by {revenue_trend.granularity} — the bucket size widens automatically for a longer range, so
              this stays readable from a single week up to a Lifetime view.
            </p>
          </>
        )}
      </div>

      <div id="pnl-section" className="dashboard-section">
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

      <div id="payment-methods-section" className="dashboard-section">
        <h2>Payment Methods</h2>
        <p className="wizard-hint">
          Money actually received or refunded this period, split by how it moved — by collection/refund date, not
          booking date. A resolved lost/damaged-item charge (a write-off — no real money moves) never counts here.
        </p>
        <div className="toggle-group">
          <button
            type="button"
            className={paymentMethodsView === "received" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setPaymentMethodsView("received")}
          >
            Received
          </button>
          <button
            type="button"
            className={paymentMethodsView === "refunded" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setPaymentMethodsView("refunded")}
          >
            Refunded
          </button>
        </div>
        {paymentMethodsView === "refunded" && (
          <p className="wizard-hint">
            Only refunds recorded since the method picker was added will show a real method — older refunds may
            still be filed under whichever method was in place before this section existed.
          </p>
        )}
        {shownBreakdown.by_method.length === 0 ? (
          <div className="empty-state">
            <h3>{paymentMethodsView === "received" ? "No payments recorded" : "No refunds recorded"}</h3>
            <p>Try a wider date range.</p>
          </div>
        ) : (
          <>
            <div className="stat-card stat-card-wide">
              <div className="stat-value">₹{shownBreakdown.total}</div>
              <div className="stat-label">{paymentMethodsView === "received" ? "Total received" : "Total refunded"}</div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>{paymentMethodsView === "received" ? "Payments" : "Refunds"}</th>
                  </tr>
                </thead>
                <tbody>
                  {shownBreakdown.by_method.map((m) => (
                    <tr key={m.method}>
                      <td data-label="Method">{PAYMENT_METHOD_LABELS[m.method as keyof typeof PAYMENT_METHOD_LABELS] ?? m.method}</td>
                      <td data-label="Amount">₹{m.amount}</td>
                      <td data-label={paymentMethodsView === "received" ? "Payments" : "Refunds"}>{m.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {paymentMethodsView === "refunded" && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Booking</th>
                      <th>Customer</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refund_methods.refunds.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Booking">
                          <Link to={`/bookings?booking=${r.booking_id}`}>{r.booking_code}</Link>
                        </td>
                        <td data-label="Customer">{r.customer_name}</td>
                        <td data-label="Method">{PAYMENT_METHOD_LABELS[r.method] ?? r.method}</td>
                        <td data-label="Amount">₹{r.amount}</td>
                        <td data-label="Date">{formatDateDisplay(r.payment_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
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

      <div id="most-booked-section" className="dashboard-section">
        <h2>Most-Booked Items</h2>
        {most_booked_items.length === 0 ? (
          <div className="empty-state">
            <h3>No bookings in this period</h3>
            <p>Try a wider date range.</p>
          </div>
        ) : (
          <>
            <MostBookedBarChart items={most_booked_items} />
            {most_booked_items.every((i) => i.booking_count <= 1) && (
              <p className="wizard-hint">
                Nothing charted yet — every item here has only one booking so far. The chart shows items with more
                than one.
              </p>
            )}
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
                      <td data-label="Name">
                        <Link to={`/items/${i.item_id}`}>{i.name}</Link>
                      </td>
                      <td data-label="Bookings">{i.booking_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div id="repeat-customers-section" className="dashboard-section">
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
                    <td data-label="Name">
                      <Link to={`/customers?customer=${c.customer_id}`}>{c.name}</Link>
                    </td>
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

      <div id="idle-inventory-section" className="dashboard-section">
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
                    <td data-label="Name">
                      <Link to={`/items/${i.id}`}>{i.name}</Link>
                    </td>
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
                    <td data-label="Customer">
                      {d.customer_id ? (
                        <Link to={`/customers?customer=${d.customer_id}`}>{d.customer_name}</Link>
                      ) : (
                        d.customer_name
                      )}
                    </td>
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
