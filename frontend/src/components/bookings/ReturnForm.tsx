import { useState, type FormEvent } from "react";
import { processReturn, type Booking, type BookingWithDetails } from "../../lib/bookings";

export function ReturnForm({ booking, onCancel }: { booking: BookingWithDetails; onCancel: () => void }) {
  const components = booking.items?.item_type === "set" ? booking.items.components ?? [] : null;
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries((components ?? []).map((name) => [name, false])),
  );
  const [returnNotes, setReturnNotes] = useState("");
  // Left blank on purpose — the backend defaults to today in IST when this
  // is omitted, rather than the frontend computing "today" itself (which
  // would use the viewer's local timezone; see CLAUDE.md).
  const [actualReturnDate, setActualReturnDate] = useState("");
  const [depositRefunded, setDepositRefunded] = useState(false);
  const [depositRefundDate, setDepositRefundDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Booking | null>(null);

  function toggleComponent(name: string) {
    setChecklist((c) => ({ ...c, [name]: !c[name] }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await processReturn(booking.id, {
        return_checklist: components ? checklist : null,
        return_notes: returnNotes.trim() || null,
        actual_return_date: actualReturnDate || null,
        deposit_refunded: booking.deposit_collected ? depositRefunded : null,
        deposit_refund_date: booking.deposit_collected && depositRefunded ? depositRefundDate || null : null,
      });
      setResult(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process return");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div className="wizard-card wizard-success">
        <p className="success-check">✓ Marked Returned</p>
        <p className="success-code">{result.booking_code}</p>
        {result.warning && (
          <div className="found-panel">
            <p>{result.warning}</p>
          </div>
        )}
        <div className="wizard-actions">
          <button className="btn-primary" onClick={onCancel}>
            Back to Bookings
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="wizard-card" onSubmit={handleSubmit}>
      <div className="wizard-step">
        <h2>Process Return — {booking.booking_code}</h2>
        <p className="wizard-hint">
          {booking.items?.item_code} — {booking.items?.name} · {booking.customers?.name}
        </p>

        {components && (
          <>
            <p className="field-label">Components Checklist</p>
            <div className="checklist">
              {components.map((name) => (
                <label key={name} className="checklist-item">
                  <input type="checkbox" checked={checklist[name] ?? false} onChange={() => toggleComponent(name)} />
                  {name}
                </label>
              ))}
            </div>
          </>
        )}

        <label className="field-label">
          Actual Return Date
          <input
            type="date"
            value={actualReturnDate}
            onChange={(e) => setActualReturnDate(e.target.value)}
          />
        </label>
        <p className="wizard-hint">Leave blank to use today.</p>

        <label className="field-label">
          Return Notes
          <textarea
            value={returnNotes}
            onChange={(e) => setReturnNotes(e.target.value)}
            rows={2}
            placeholder="Optional"
          />
        </label>

        {booking.deposit_collected && (
          <>
            <label className="field-label">
              <input
                type="checkbox"
                checked={depositRefunded}
                onChange={(e) => setDepositRefunded(e.target.checked)}
              />{" "}
              Deposit refunded
            </label>
            {depositRefunded && (
              <label className="field-label">
                Refund Date
                <input
                  type="date"
                  value={depositRefundDate}
                  onChange={(e) => setDepositRefundDate(e.target.value)}
                />
              </label>
            )}
          </>
        )}

        {error && <p className="wizard-error">{error}</p>}
      </div>
      <div className="wizard-nav">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Mark Returned"}
        </button>
      </div>
    </form>
  );
}
