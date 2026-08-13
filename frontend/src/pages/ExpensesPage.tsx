import { useEffect, useState } from "react";
import {
  fetchExpenses,
  createExpense,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type Expense,
  type ExpenseCategory,
} from "../lib/expenses";
import { formatDateDisplay } from "../lib/dates";
import "../styles/shared.css";

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState("");
  const [formCategory, setFormCategory] = useState<ExpenseCategory>("misc");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // First load: no from/to, so the backend picks "this month" (IST) for us
  // — same pattern as ReportsPage, we only ever display what it resolved.
  useEffect(() => {
    fetchExpenses()
      .then((res) => {
        setExpenses(res.expenses);
        setFrom(res.period.from);
        setTo(res.period.to);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load expenses"))
      .finally(() => setLoading(false));
  }, []);

  function refresh(nextFrom: string, nextTo: string) {
    setLoading(true);
    setError(null);
    fetchExpenses({ from: nextFrom, to: nextTo })
      .then((res) => setExpenses(res.expenses))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load expenses"))
      .finally(() => setLoading(false));
  }

  function handleFromChange(value: string) {
    setFrom(value);
    if (value && to) refresh(value, to);
  }

  function handleToChange(value: string) {
    setTo(value);
    if (from && value) refresh(from, value);
  }

  async function handleAddExpense() {
    const amount = Number(formAmount);
    if (!(amount > 0)) {
      setFormError("Enter an amount greater than 0");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await createExpense({
        category: formCategory,
        amount,
        date: formDate || null,
        description: formDescription.trim() || null,
      });
      setFormOpen(false);
      setFormDate("");
      setFormCategory("misc");
      setFormAmount("");
      setFormDescription("");
      if (from && to) refresh(from, to);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to add expense");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !expenses) return <div className="page">Loading…</div>;
  if (error && !expenses) return <div className="page wizard-error">{error}</div>;
  if (!expenses) return null;

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="page">
      <h2>Expenses</h2>

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

      <div className="stat-card stat-card-wide">
        <div className="stat-value">₹{total}</div>
        <div className="stat-label">Total expenses this period</div>
      </div>

      {!formOpen ? (
        <button type="button" className="btn-primary" onClick={() => setFormOpen(true)}>
          + Add Expense
        </button>
      ) : (
        <div className="line-item-card">
          <h3>New Expense</h3>
          <label className="field-label">
            Date
            <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
          </label>
          <label className="field-label">
            Category
            <select value={formCategory} onChange={(e) => setFormCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Amount (₹)
            <input type="number" min={0} value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
          </label>
          <label className="field-label">
            Description (optional)
            <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
          </label>
          {formError && <p className="line-item-error">{formError}</p>}
          <div className="line-item-card-header" style={{ marginTop: 10 }}>
            <button type="button" className="btn-primary" disabled={saving} onClick={handleAddExpense}>
              {saving ? "Saving…" : "Save Expense"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setFormOpen(false);
                setFormError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="dashboard-section">
        {expenses.length === 0 ? (
          <div className="empty-state">
            <h3>No expenses in this period</h3>
            <p>Try a wider date range, or add one above.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Date">{formatDateDisplay(e.date)}</td>
                    <td data-label="Category">{EXPENSE_CATEGORY_LABELS[e.category]}</td>
                    <td data-label="Description">{e.description ?? "—"}</td>
                    <td data-label="Amount">₹{e.amount}</td>
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
