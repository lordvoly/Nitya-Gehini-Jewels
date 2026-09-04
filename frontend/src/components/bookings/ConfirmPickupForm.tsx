import { useState, type FormEvent } from "react";
import {
  confirmPickup,
  PICKUP_PERSON_TYPES,
  PICKUP_PERSON_TYPE_LABELS,
  type Booking,
  type BookingItem,
  type PickupPersonType,
} from "../../lib/bookings";
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
  onDone,
}: {
  booking: Booking;
  item: BookingItem;
  onCancel: () => void;
  // Called only from the post-success screen — see ReturnForm's identical
  // onDone for why this is separate from onCancel: a multi-item booking
  // needs to land back on this booking's own detail view, not the flat
  // bookings list.
  onDone: () => void;
}) {
  // Pre-filled with the current balance due — the common case is collecting
  // (some or all of) what's owed right when the item leaves the shop — but
  // fully editable, including down to 0 if nothing's being collected now.
  const [amount, setAmount] = useState(String(booking.balance_due ?? 0));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  // Left blank on purpose — the backend defaults to today in IST when this
  // is omitted, same pattern as ReturnForm's actual_return_date.
  const [paymentDate, setPaymentDate] = useState("");
  // No default selection — the operator must actively pick one, same
  // "don't silently assume Self" reasoning as every other required choice
  // on this form. Father's explicit request: a real record of who
  // physically took the item, since it's often not the customer themselves.
  const [pickupPersonType, setPickupPersonType] = useState<PickupPersonType | null>(null);
  const [pickupPersonName, setPickupPersonName] = useState("");
  const [pickupPersonPhone, setPickupPersonPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingItem | null>(null);

  const numericAmount = toNumberOrNull(amount) ?? 0;
  const needsPickupDetails = pickupPersonType === "family" || pickupPersonType === "porter";
  const canSubmit =
    pickupPersonType !== null && (!needsPickupDetails || (pickupPersonName.trim() && pickupPersonPhone.trim()));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pickupPersonType) return;
    setError(null);
    setSaving(true);
    try {
      const updated = await confirmPickup(booking.id, item.id, {
        amount: numericAmount > 0 ? numericAmount : undefined,
        method: numericAmount > 0 ? method : undefined,
        payment_date: numericAmount > 0 ? paymentDate || null : null,
        pickup_person_type: pickupPersonType,
        pickup_person_name: needsPickupDetails ? pickupPersonName.trim() : undefined,
        pickup_person_phone: needsPickupDetails ? pickupPersonPhone.trim() : undefined,
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
        <p className="success-detail">
          {item.items?.item_code} — {item.items?.name}
        </p>
        {numericAmount > 0 && (
          <p className="wizard-hint">
            ₹{numericAmount} ({PAYMENT_METHOD_LABELS[method]}) recorded.
          </p>
        )}
        {result.pickup_person_type && (
          <p className="wizard-hint">
            Picked up by: {PICKUP_PERSON_TYPE_LABELS[result.pickup_person_type]}
            {result.pickup_person_name ? ` — ${result.pickup_person_name} (${result.pickup_person_phone})` : ""}
          </p>
        )}
        {result.warning && (
          <div className="found-panel">
            <p>{result.warning}</p>
          </div>
        )}
        <div className="wizard-actions">
          <button className="btn-primary" onClick={onDone}>
            Back to Booking
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

        <p className="field-label">Picked Up By</p>
        <div className="toggle-group">
          {PICKUP_PERSON_TYPES.map((t) => (
            <button
              type="button"
              key={t}
              className={pickupPersonType === t ? "toggle-btn active" : "toggle-btn"}
              onClick={() => setPickupPersonType(t)}
            >
              {PICKUP_PERSON_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {needsPickupDetails && (
          <>
            <label className="field-label">
              {pickupPersonType === "family" ? "Family Member's" : "Porter's"} Name
              <input type="text" value={pickupPersonName} onChange={(e) => setPickupPersonName(e.target.value)} />
            </label>
            <label className="field-label">
              {pickupPersonType === "family" ? "Family Member's" : "Porter's"} Phone
              <input type="tel" value={pickupPersonPhone} onChange={(e) => setPickupPersonPhone(e.target.value)} />
            </label>
          </>
        )}

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
        <button type="submit" className="btn-primary" disabled={saving || !canSubmit}>
          {saving ? "Saving…" : "Confirm Pickup"}
        </button>
      </div>
    </form>
  );
}
