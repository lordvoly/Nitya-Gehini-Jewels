import { useCallback, useEffect, useState, type FormEvent } from "react";
import { fetchBooking, type BookingDetail as BookingDetailData } from "../../lib/bookings";
import {
  fetchPayments,
  recordPayment,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type Payment,
  type PaymentMethod,
} from "../../lib/payments";
import { toNumberOrNull } from "../../lib/numbers";
import { bookingStatusPill } from "../../lib/statusPill";

export function BookingDetail({ bookingId, onBack }: { bookingId: string; onBack: () => void }) {
  const [booking, setBooking] = useState<BookingDetailData | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  // Left blank on purpose — the backend defaults to today in IST when this
  // is omitted, same pattern as ReturnForm's actual_return_date.
  const [paymentDate, setPaymentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([fetchBooking(bookingId), fetchPayments(bookingId)])
      .then(([b, p]) => {
        setBooking(b);
        setPayments(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load booking"))
      .finally(() => setLoading(false));
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault();
    setPaymentError(null);
    setSaving(true);
    try {
      await recordPayment({
        booking_id: bookingId,
        amount: toNumberOrNull(amount) ?? 0,
        method,
        payment_date: paymentDate || null,
        notes: notes.trim() || null,
      });
      setAmount("");
      setMethod("cash");
      setPaymentDate("");
      setNotes("");
      setShowPaymentForm(false);
      await load();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wizard-card">
      <div className="wizard-step">
        <h2>{loading ? "Loading…" : booking?.booking_code}</h2>
        {error && <p className="wizard-error">{error}</p>}
        {booking && (
          <>
            <p className="wizard-hint">
              {booking.items?.item_code} — {booking.items?.name} · {booking.customers?.name}
            </p>
            <ul className="review-list">
              <li>Type: {booking.type === "rental" ? "Rental" : "Sale"}</li>
              <li>
                Status: <span className={`pill ${bookingStatusPill(booking.status).className}`}>{bookingStatusPill(booking.status).label}</span>
              </li>
              <li>
                Dates: {booking.pickup_date}
                {booking.return_date ? ` → ${booking.return_date}` : ""}
              </li>
              <li>Price charged: ₹{booking.price_charged}</li>
              <li>Total paid: ₹{booking.total_paid}</li>
              <li>
                <strong>Balance due: ₹{booking.balance_due}</strong>
              </li>
            </ul>

            {/* Only meaningful for a unique item — there's a real physical
                hand-off between consecutive bookings. A quantity item can
                have many bookings active at once, so "next in line" isn't a
                single well-defined thing there. */}
            {booking.items?.tracking_type === "unique" && (
              <div className="found-panel">
                <p>
                  <strong>When Returns →</strong>
                </p>
                {booking.future_bookings.length === 0 ? (
                  <p className="wizard-hint">No bookings ahead.</p>
                ) : (
                  <ul className="review-list">
                    {booking.future_bookings.map((fb) => (
                      <li key={fb.id}>
                        {fb.booking_code} — {fb.customer_name} ({fb.pickup_date})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <h2>Payments</h2>
            {payments.length === 0 ? (
              <p className="wizard-hint">No payments recorded yet.</p>
            ) : (
              <ul className="review-list">
                {payments.map((p) => (
                  <li key={p.id}>
                    ₹{p.amount} — {PAYMENT_METHOD_LABELS[p.method]} · {p.payment_date}
                    {p.notes ? ` — ${p.notes}` : ""}
                  </li>
                ))}
              </ul>
            )}

            {showPaymentForm ? (
              <form className="wizard-step" onSubmit={handleRecordPayment}>
                <label className="field-label">
                  Amount (₹)
                  <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label className="field-label">
                  Method
                  <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Date
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </label>
                <p className="wizard-hint">Leave blank to use today.</p>
                <label className="field-label">
                  Notes
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
                </label>
                {paymentError && <p className="wizard-error">{paymentError}</p>}
                <div className="wizard-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowPaymentForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={saving || !(toNumberOrNull(amount) ?? 0) }>
                    {saving ? "Saving…" : "Save Payment"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="wizard-actions">
                <button className="btn-primary" onClick={() => setShowPaymentForm(true)}>
                  Record Payment
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div className="wizard-nav">
        <button className="btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
