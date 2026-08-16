import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { fetchBooking, type Booking, type BookingItem } from "../../lib/bookings";
import {
  fetchPayments,
  recordPayment,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type Payment,
  type PaymentMethod,
} from "../../lib/payments";
import { toNumberOrNull } from "../../lib/numbers";
import { bookingItemStatusPill, bookingComputedStatusPill } from "../../lib/statusPill";
import { formatDateDisplay } from "../../lib/dates";

export function BookingDetail({
  bookingId,
  onBack,
  onEdit,
  onProcessReturn,
  onConfirmPickup,
}: {
  bookingId: string;
  onBack: () => void;
  onEdit: () => void;
  onProcessReturn: (booking: Booking, item: BookingItem) => void;
  onConfirmPickup: (booking: Booking, item: BookingItem) => void;
}) {
  const [booking, setBooking] = useState<Booking | null>(null);
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

  const statusPill = booking
    ? bookingComputedStatusPill(booking.computed_status, booking.resolved_item_count, booking.active_item_count)
    : null;

  return (
    <div className="wizard-card">
      <div className="wizard-step">
        <h2>{loading ? "Loading…" : booking?.booking_code}</h2>
        {error && <p className="wizard-error">{error}</p>}
        {booking && statusPill && (
          <>
            <p className="wizard-hint">
              {booking.customers?.name && (
                <Link to={`/customers?customer=${booking.customer_id}`}>{booking.customers.name}</Link>
              )}
            </p>
            <ul className="review-list">
              <li>Booked on: {formatDateDisplay(booking.booking_date)}</li>
              <li>
                Status: <span className={`pill ${statusPill.className}`}>{statusPill.label}</span>
                {statusPill.fraction && ` — ${statusPill.fraction}`}
              </li>
              {booking.gst_applicable && (
                <li>
                  GST: {booking.gst_invoice_number ?? "—"} · HSN {booking.hsn_code ?? "—"} · {booking.tax_rate ?? 0}%
                </li>
              )}
              <li>Price charged: ₹{booking.price_charged}</li>
              <li>Total paid: ₹{booking.total_paid}</li>
              <li>
                <strong>Balance due: ₹{booking.balance_due}</strong>
              </li>
            </ul>

            <h2>Items ({booking.booking_items.length})</h2>
            {booking.booking_items.map((bi) => {
              const itemPill = bookingItemStatusPill(bi);
              const canReturn = bi.type === "rental" && (bi.status === "booked" || bi.status === "out");
              const canConfirmPickup = bi.status === "booked";
              return (
                <div className="line-item-card" key={bi.id}>
                  <div className="line-item-card-header">
                    <h3>
                      {bi.items?.item_code} — {bi.items?.name}
                    </h3>
                    <span className={`pill ${itemPill.className}`}>{itemPill.label}</span>
                  </div>
                  <ul className="review-list">
                    <li>Type: {bi.type === "rental" ? "Rental" : "Sale"}</li>
                    <li>
                      Dates: {formatDateDisplay(bi.pickup_date)}
                      {bi.return_date ? ` → ${formatDateDisplay(bi.return_date)}` : ""}
                      {bi.actual_pickup_date ? ` (picked up ${formatDateDisplay(bi.actual_pickup_date)})` : ""}
                      {bi.actual_return_date ? ` (returned ${formatDateDisplay(bi.actual_return_date)})` : ""}
                    </li>
                    <li>Price charged: ₹{bi.price_charged}</li>
                    {bi.type === "rental" && bi.deposit_amount > 0 && (
                      <li>
                        Deposit: ₹{bi.deposit_amount}
                        {bi.deposit_collected ? (bi.deposit_refunded ? " (refunded)" : " (collected)") : " (not collected)"}
                      </li>
                    )}
                  </ul>

                  {bi.custom_addons.length > 0 && (
                    <>
                      <p className="field-label">Additional Items</p>
                      <div className="checklist">
                        {bi.custom_addons.map((name) => (
                          <div key={name} className="checklist-row">
                            <span className="checklist-item checklist-item-static">
                              <span className="checklist-dot" aria-hidden="true" />
                              <span className="checklist-item-text">{name}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Only meaningful for a unique item — there's a real physical
                      hand-off between consecutive bookings. A quantity item can
                      have many bookings active at once, so "next in line" isn't
                      a single well-defined thing there. */}
                  {bi.items?.tracking_type === "unique" && (
                    <div className="found-panel">
                      <p>
                        <strong>When Returns →</strong>
                      </p>
                      {!bi.future_booking_items || bi.future_booking_items.length === 0 ? (
                        <p className="wizard-hint">No bookings ahead.</p>
                      ) : (
                        <ul className="review-list">
                          {bi.future_booking_items.map((fb) => (
                            <li key={fb.id}>
                              {fb.booking_code} — {fb.customer_name} ({formatDateDisplay(fb.pickup_date)})
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {(canConfirmPickup || canReturn) && (
                    <div className="wizard-actions">
                      {canConfirmPickup && (
                        <button className="btn-secondary" onClick={() => onConfirmPickup(booking, bi)}>
                          Confirm Pickup
                        </button>
                      )}
                      {canReturn && (
                        <button className="btn-secondary" onClick={() => onProcessReturn(booking, bi)}>
                          Process Return
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <h2>Payments</h2>
            {payments.length === 0 ? (
              <p className="wizard-hint">No payments recorded yet.</p>
            ) : (
              <ul className="review-list">
                {payments.map((p) => (
                  <li key={p.id}>
                    ₹{p.amount} — {PAYMENT_METHOD_LABELS[p.method]} · {formatDateDisplay(p.payment_date)}
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
                  <button type="submit" className="btn-primary" disabled={saving || !(toNumberOrNull(amount) ?? 0)}>
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
        {booking && (
          <>
            <Link to={`/receipt/${booking.id}`} target="_blank" className="btn-secondary">
              Print/Download Receipt
            </Link>
            <button className="btn-primary" onClick={onEdit}>
              Edit Booking
            </button>
          </>
        )}
      </div>
    </div>
  );
}
