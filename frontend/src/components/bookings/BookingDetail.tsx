import { useCallback, useEffect, useState, type FormEvent } from "react";
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
}: {
  bookingId: string;
  onBack: () => void;
  onEdit: () => void;
  onProcessReturn: (booking: Booking, item: BookingItem) => void;
}) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
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

  if (loading) {
    return (
      <div className="card border-0 shadow-sm p-5 text-center">
        <div className="spinner-border text-primary mx-auto mb-2" role="status"></div>
        <span className="text-muted small">Loading booking details…</span>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="card border-0 shadow-sm p-4">
        <div className="alert alert-danger mb-3">
          <i className="ti ti-alert-triangle me-1"></i> {error ?? "Booking not found"}
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onBack}>
          <i className="ti ti-arrow-left me-1"></i> Back to Bookings
        </button>
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-sm">
      {/* Header */}
      <div className="card-header bg-white p-4 border-bottom d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <span className="badge bg-primary text-white font-monospace fs-5 px-3 py-2">
              {booking.booking_code}
            </span>
            {statusPill && (
              <span
                className={`badge px-3 py-2 fs-7 ${
                  statusPill.className === "pill-attention"
                    ? "bg-danger-subtle text-danger"
                    : statusPill.className === "pill-active"
                    ? "bg-warning-subtle text-warning"
                    : "bg-success-subtle text-success"
                }`}
              >
                {statusPill.label} {statusPill.fraction ? `(${statusPill.fraction})` : ""}
              </span>
            )}
          </div>
          <p className="text-muted mb-0 small">Customer: <strong className="text-dark">{booking.customers?.name}</strong></p>
        </div>

        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onBack}>
            <i className="ti ti-arrow-left me-1"></i> Back
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onEdit}>
            <i className="ti ti-edit me-1"></i> Edit Booking
          </button>
        </div>
      </div>

      <div className="card-body p-4">
        {/* Financial Overview Cards */}
        <div className="row g-3 mb-4">
          <div className="col-12 col-md-4">
            <div className="p-3 bg-light rounded border text-center">
              <span className="text-muted small text-uppercase fw-semibold d-block">Price Charged</span>
              <h4 className="fw-bold text-dark mb-0">₹{booking.price_charged.toLocaleString("en-IN")}</h4>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="p-3 bg-light rounded border text-center">
              <span className="text-muted small text-uppercase fw-semibold d-block">Total Paid</span>
              <h4 className="fw-bold text-success mb-0">₹{booking.total_paid.toLocaleString("en-IN")}</h4>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="p-3 bg-light rounded border text-center">
              <span className="text-muted small text-uppercase fw-semibold d-block">Balance Due</span>
              <h4 className={`fw-bold mb-0 ${booking.balance_due > 0 ? "text-danger" : "text-success"}`}>
                ₹{booking.balance_due.toLocaleString("en-IN")}
              </h4>
            </div>
          </div>
        </div>

        {/* GST Info if applicable */}
        {booking.gst_applicable && (
          <div className="p-3 bg-info-subtle text-info rounded border border-info-subtle mb-4 small">
            <i className="ti ti-receipt me-1"></i>
            <strong>GST Details:</strong> Invoice #{booking.gst_invoice_number ?? "—"} | HSN: {booking.hsn_code ?? "—"} | Tax Rate: {booking.tax_rate ?? 0}%
          </div>
        )}

        {/* Items List */}
        <h6 className="fw-bold text-dark mb-3">
          <i className="ti ti-box me-1 text-primary"></i> Booking Items ({booking.booking_items.length})
        </h6>

        <div className="d-flex flex-column gap-3 mb-4">
          {booking.booking_items.map((bi) => {
            const itemPill = bookingItemStatusPill(bi.status);
            const canReturn = bi.type === "rental" && (bi.status === "booked" || bi.status === "out");

            return (
              <div className="p-3 border rounded bg-white" key={bi.id}>
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                  <div>
                    <span className="badge bg-light text-dark border font-monospace me-2">{bi.items?.item_code}</span>
                    <strong className="text-dark fs-6">{bi.items?.name}</strong>
                    <span className="badge bg-secondary-subtle text-secondary ms-2">
                      {bi.type === "rental" ? "Rental" : "Sale"}
                    </span>
                  </div>
                  <span
                    className={`badge px-2 py-1 fs-7 ${
                      itemPill.className === "pill-attention"
                        ? "bg-danger-subtle text-danger"
                        : itemPill.className === "pill-active"
                        ? "bg-warning-subtle text-warning"
                        : "bg-success-subtle text-success"
                    }`}
                  >
                    {itemPill.label}
                  </span>
                </div>

                <div className="row g-2 text-muted small mb-2">
                  <div className="col-12 col-md-6">
                    <i className="ti ti-calendar me-1"></i>
                    Pickup: {formatDateDisplay(bi.pickup_date)}
                    {bi.return_date ? ` → Return: ${formatDateDisplay(bi.return_date)}` : ""}
                    {bi.actual_return_date ? ` (Returned on ${formatDateDisplay(bi.actual_return_date)})` : ""}
                  </div>
                  <div className="col-12 col-md-6 text-md-end">
                    Rate Charged: <strong className="text-dark">₹{bi.price_charged}</strong>
                    {bi.type === "rental" && bi.deposit_amount > 0 && (
                      <span className="ms-2">
                        | Deposit: ₹{bi.deposit_amount}
                        {bi.deposit_collected ? (bi.deposit_refunded ? " (Refunded)" : " (Collected)") : " (Not Collected)"}
                      </span>
                    )}
                  </div>
                </div>

                {bi.custom_addons.length > 0 && (
                  <div className="small text-muted mb-2">
                    Addons included: <span className="fw-medium text-dark">{bi.custom_addons.join(", ")}</span>
                  </div>
                )}

                {/* Unique Item Schedule Info */}
                {bi.items?.tracking_type === "unique" && (
                  <div className="p-2 bg-light rounded mt-2 border text-muted fs-7">
                    <strong className="text-dark me-1">Schedule Ahead:</strong>
                    {!bi.future_booking_items || bi.future_booking_items.length === 0 ? (
                      <span>No upcoming bookings for this piece.</span>
                    ) : (
                      <span>
                        Next: {bi.future_booking_items[0].booking_code} — {bi.future_booking_items[0].customer_name} ({formatDateDisplay(bi.future_booking_items[0].pickup_date)})
                      </span>
                    )}
                  </div>
                )}

                {canReturn && (
                  <div className="mt-3 pt-2 border-top d-flex justify-content-end">
                    <button
                      type="button"
                      className="btn btn-warning btn-sm fw-semibold"
                      onClick={() => onProcessReturn(booking, bi)}
                    >
                      <i className="ti ti-corner-up-left me-1"></i> Process Return
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Payments History & Recording */}
        <hr className="my-4" />
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h6 className="fw-bold text-dark mb-0">
            <i className="ti ti-currency-rupee me-1 text-primary"></i> Payment Records ({payments.length})
          </h6>
          {!showPaymentForm && (
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() => setShowPaymentForm(true)}
            >
              <i className="ti ti-plus me-1"></i> Record Payment
            </button>
          )}
        </div>

        {payments.length === 0 ? (
          <p className="text-muted small">No payments recorded yet.</p>
        ) : (
          <div className="table-responsive mb-4">
            <table className="table align-middle text-nowrap table-sm table-bordered">
              <thead className="table-light">
                <tr className="small text-muted text-uppercase">
                  <th>Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDateDisplay(p.payment_date)}</td>
                    <td>
                      <span className="badge bg-light text-dark border">
                        {PAYMENT_METHOD_LABELS[p.method]}
                      </span>
                    </td>
                    <td className="fw-bold text-success">₹{p.amount.toLocaleString("en-IN")}</td>
                    <td className="text-muted small">{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payment Form inline */}
        {showPaymentForm && (
          <form className="p-3 border rounded bg-light mb-3" onSubmit={handleRecordPayment}>
            <h6 className="fw-semibold text-dark mb-3">Record New Payment</h6>
            <div className="row g-3">
              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">Amount (₹) *</label>
                <div className="input-group">
                  <span className="input-group-text bg-white">₹</span>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">Payment Method</label>
                <select
                  className="form-select"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">Payment Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              <div className="col-12">
                <label className="form-label fw-medium small">Payment Notes</label>
                <input
                  type="text"
                  className="form-control"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional reference / transaction ID..."
                />
              </div>
            </div>

            {paymentError && (
              <div className="alert alert-danger py-2 px-3 small mt-3 mb-0">
                <i className="ti ti-alert-circle me-1"></i> {paymentError}
              </div>
            )}

            <div className="d-flex justify-content-end gap-2 mt-3">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setShowPaymentForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm fw-semibold"
                disabled={saving || !(toNumberOrNull(amount) ?? 0)}
              >
                {saving ? "Saving…" : "Save Payment"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
