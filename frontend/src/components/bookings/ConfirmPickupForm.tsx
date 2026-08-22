import { useState, type FormEvent } from "react";
import { confirmPickup, type Booking, type BookingItem } from "../../lib/bookings";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "../../lib/payments";
import { toNumberOrNull } from "../../lib/numbers";

// Scoped to a single line item, same as ReturnForm — booking is passed only
// for display context and balance_due, the confirmation itself only ever
// affects this one booking_items row. Applies to both rental and sale
// items (unlike ReturnForm, which is rental-only) — a sale has no return
// step, but "has the customer actually taken it yet" is still real.
export function ConfirmPickupForm({
  booking,
  item,
  onCancel,
}: {
  booking: Booking;
  item: BookingItem;
  onCancel: () => void;
}) {
  // Pre-filled with the current balance due — the common case is collecting
  // (some or all of) what's owed right when the item leaves the shop — but
  // fully editable, including down to 0 if nothing's being collected now.
  const [amount, setAmount] = useState(String(booking.balance_due ?? 0));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  // Left blank on purpose — the backend defaults to today in IST when this
  // is omitted, same pattern as ReturnForm's actual_return_date.
  const [paymentDate, setPaymentDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingItem | null>(null);

  const numericAmount = toNumberOrNull(amount) ?? 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await confirmPickup(booking.id, item.id, {
        amount: numericAmount > 0 ? numericAmount : undefined,
        method: numericAmount > 0 ? method : undefined,
        payment_date: numericAmount > 0 ? paymentDate || null : null,
      });
      setResult(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm pickup");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div className="wizard-card wizard-success">
        <p className="success-check">✓ Pickup Confirmed</p>
        <p className="success-code">{booking.booking_code}</p>
        <p>
          {item.items?.item_code} — {item.items?.name}
        </p>
        {numericAmount > 0 && (
          <p className="wizard-hint">
            ₹{numericAmount} ({PAYMENT_METHOD_LABELS[method]}) recorded.
          </p>
        )}
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
        <h2>Confirm Pickup — {booking.booking_code}</h2>
        <p className="wizard-hint">
          {item.items?.item_code} — {item.items?.name} · {booking.customers?.name}
        </p>

        <label className="field-label">
          Payment Amount (₹)
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <p className="wizard-hint">Pre-filled with the current balance due — edit or clear to 0 if collecting nothing now.</p>

        {numericAmount > 0 && (
          <>
            <label className="field-label">
              Payment Method
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Payment Date
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </label>
            <p className="wizard-hint">Leave blank to use today.</p>
          </>
        )}

        {error && <p className="wizard-error">{error}</p>}
      </div>
      <div className="wizard-nav">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Confirm Pickup"}
        </button>
      </div>
    </form>
  );
}
