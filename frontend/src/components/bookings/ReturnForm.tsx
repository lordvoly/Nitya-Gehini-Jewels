import { useState, type FormEvent } from "react";
import { processReturn, type Booking, type BookingItem } from "../../lib/bookings";

// Scoped to a single line item (§8 decision D) — booking is passed only for
// display context (booking_code, customer name) and to build the request
// URL; the return itself only ever affects this one booking_items row.
export function ReturnForm({
  booking,
  item,
  onCancel,
}: {
  booking: Booking;
  item: BookingItem;
  onCancel: () => void;
}) {
  // Combined from two sources: the item's own components template (only
  // for set items — items.components itself is never touched here) and
  // this line item's own custom_addons (free-text extras added at booking
  // time, regardless of item type). Either alone, both together, or
  // neither all produce a sensible checklist.
  const componentNames = item.items?.item_type === "set" ? item.items.components ?? [] : [];
  const addonNames = item.custom_addons ?? [];
  const checklistNames = [...componentNames, ...addonNames];
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries(checklistNames.map((name) => [name, false])),
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
  const [result, setResult] = useState<BookingItem | null>(null);

  function toggleComponent(name: string) {
    setChecklist((c) => ({ ...c, [name]: !c[name] }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await processReturn(booking.id, item.item_id, {
        return_checklist: checklistNames.length > 0 ? checklist : null,
        return_notes: returnNotes.trim() || null,
        actual_return_date: actualReturnDate || null,
        deposit_refunded: item.deposit_collected ? depositRefunded : null,
        deposit_refund_date: item.deposit_collected && depositRefunded ? depositRefundDate || null : null,
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
        <p className="success-code">{booking.booking_code}</p>
        <p>{item.items?.item_code} — {item.items?.name}</p>
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
          {item.items?.item_code} — {item.items?.name} · {booking.customers?.name}
        </p>

        {checklistNames.length > 0 && (
          <>
            <p className="field-label">Return Checklist</p>
            <div className="checklist">
              {checklistNames.map((name) => (
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

        {item.deposit_collected && (
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
