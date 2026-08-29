import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ImageOff, ArrowLeft, IndianRupee, Printer, Pencil } from "lucide-react";
import { fetchBooking, updateBooking, undoPickup, type Booking, type BookingItem } from "../../lib/bookings";
import { resolvePendingItem } from "../../lib/pendingItems";
import { BookingDetailSkeleton } from "../common/Skeleton";
import { useSlowLoadHint } from "../../lib/useSlowLoadHint";
import {
  fetchPayments,
  recordPayment,
  fetchPaymentEdits,
  editPaymentAmount,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type Payment,
  type PaymentMethod,
  type PaymentAmountEdit,
} from "../../lib/payments";
import { toNumberOrNull } from "../../lib/numbers";
import { bookingItemStatusPill, bookingComputedStatusPill, bookingChargeStatusPill } from "../../lib/statusPill";
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
  const [paymentEdits, setPaymentEdits] = useState<PaymentAmountEdit[]>([]);
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

  // Edit Payment — corrects one existing payment entry's amount. Keyed per
  // payment.id (not a single form) since a booking can have more than one
  // payment row and total_paid is never a single stored value to adjust —
  // see the investigation behind this feature. A mandatory reason and full
  // audit trail, available even on a Completed booking (unlike every other
  // financial field), scoped to amount only.
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editReason, setEditReason] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Whole-booking internal note — separate from `notes` above (that's the
  // per-payment note field in the Record Payment form). Editable at any
  // computed_status, so no status check gates any of this.
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  // Undo Pickup — reverses an accidental Confirm Pickup tap (e.g. the same
  // item booked twice in one transaction, once already completed and once
  // still upcoming, and the wrong line got confirmed). Keyed per
  // booking_items.id since more than one line can be 'out' at once.
  const [undoConfirmId, setUndoConfirmId] = useState<string | null>(null);
  const [undoSavingId, setUndoSavingId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  // Mark Returned on a still-pending component (see the found-panel below,
  // one per line item that has any) — keyed per "booking_item.id:component
  // name" since one line item can have more than one pending component at
  // once. Charging for a pending item instead is deliberately NOT
  // duplicated here — that's a financial decision better made from the
  // central Charges page, which this panel points to instead.
  const [pendingSavingKey, setPendingSavingKey] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([fetchBooking(bookingId), fetchPayments(bookingId), fetchPaymentEdits(bookingId)])
      .then(([b, p, e]) => {
        setBooking(b);
        setPayments(p);
        setPaymentEdits(e);
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

  async function handleSaveNotes() {
    setNotesError(null);
    setSavingNotes(true);
    try {
      await updateBooking(bookingId, { notes: notesInput.trim() || null });
      setEditingNotes(false);
      await load();
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  }

  function startEditPayment(p: Payment) {
    setEditingPaymentId(p.id);
    setEditAmount(String(p.amount));
    setEditReason("");
    setEditError(null);
  }

  function cancelEditPayment() {
    setEditingPaymentId(null);
    setEditError(null);
  }

  async function handleSaveEditPayment(paymentId: string) {
    setEditError(null);
    // Client-side guard for immediate feedback, same as the reason
    // requirement's own point — the server enforces this too regardless.
    if (!editReason.trim()) {
      setEditError("A reason is required to edit a payment");
      return;
    }
    const newAmount = toNumberOrNull(editAmount);
    if (newAmount == null || newAmount < 0) {
      setEditError("Enter a valid non-negative amount");
      return;
    }
    setSavingEdit(true);
    try {
      await editPaymentAmount(paymentId, newAmount, editReason.trim());
      setEditingPaymentId(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to edit payment");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleUndoPickup(bi: BookingItem) {
    setUndoError(null);
    setUndoSavingId(bi.id);
    try {
      await undoPickup(bookingId, bi.id);
      setUndoConfirmId(null);
      await load();
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : "Failed to undo pickup");
    } finally {
      setUndoSavingId(null);
    }
  }

  async function handleMarkPendingReturned(bi: BookingItem, componentName: string) {
    const key = `${bi.id}:${componentName}`;
    setPendingError(null);
    setPendingSavingKey(key);
    try {
      await resolvePendingItem(bookingId, bi.id, componentName);
      await load();
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : "Failed to mark returned");
    } finally {
      setPendingSavingKey(null);
    }
  }

  const statusPill = booking
    ? bookingComputedStatusPill(booking.computed_status, booking.resolved_item_count, booking.active_item_count)
    : null;
  // Deliberately layered next to computed_status rather than folded into
  // it — computed_status still correctly means "every item returned/sold,"
  // which is what Reports/AI-tools/idle-inventory etc. rely on it meaning;
  // this is a second, purely visual signal that something's still
  // genuinely outstanding even though the booking itself has closed out.
  // Same additive-signal pattern as overdue_rentals' own
  // next_customer_waiting flag.
  const hasPendingItems = booking?.booking_items.some((bi) => bi.pending_components.length > 0) ?? false;
  // A permanent marker, unlike hasPendingItems above — see
  // bookingChargeStatusPill's own comment for why this doesn't disappear
  // once every charge is resolved.
  const chargeStatusPill = booking ? bookingChargeStatusPill(booking.booking_items.flatMap((bi) => bi.item_charges)) : null;
  const showSlowHint = useSlowLoadHint(loading);

  return (
    <div className="wizard-card">
      <div className="wizard-step">
        {loading && <BookingDetailSkeleton />}
        {loading && showSlowHint && (
          <p className="wizard-hint slow-load-hint">
            Still loading. The server may be waking up after a period of inactivity, which can take up to a minute.
          </p>
        )}
        {!loading && <h2>{booking?.booking_code}</h2>}
        {!loading && error && <p className="wizard-error">{error}</p>}
        {!loading && booking && statusPill && (
          <>
            <p className="booking-detail-customer">
              {booking.customers?.name && (
                <Link to={`/customers?customer=${booking.customer_id}`}>{booking.customers.name}</Link>
              )}
            </p>
            <ul className="review-list">
              <li>Booked on: {formatDateDisplay(booking.booking_date)}</li>
              <li>
                Status: <span className={`pill ${statusPill.className}`}>{statusPill.label}</span>
                {statusPill.fraction && ` — ${statusPill.fraction}`}
                {hasPendingItems && (
                  <>
                    {" "}
                    <span className="pill pill-attention">Item Pending</span>
                  </>
                )}
                {chargeStatusPill && (
                  <>
                    {" "}
                    <span className={`pill ${chargeStatusPill.className}`}>{chargeStatusPill.label}</span>
                  </>
                )}
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

            <h2>Notes</h2>
            <p className="wizard-hint">Internal only — never shown on the printed receipt.</p>
            {editingNotes ? (
              <div className="wizard-step">
                <label className="field-label">
                  <textarea
                    rows={5}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="e.g. Shop owes customer ₹500 separately from their own balance…"
                  />
                </label>
                {notesError && <p className="wizard-error">{notesError}</p>}
                <div className="wizard-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setEditingNotes(false);
                      setNotesError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" className="btn-primary" disabled={savingNotes} onClick={handleSaveNotes}>
                    {savingNotes ? "Saving…" : "Save Notes"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {booking.notes ? (
                  <p className="booking-notes-text">{booking.notes}</p>
                ) : (
                  <p className="wizard-hint">No notes yet.</p>
                )}
                {booking.notes_updated_at && (
                  <p className="wizard-hint">Last updated {formatDateDisplay(booking.notes_updated_at.slice(0, 10))}</p>
                )}
                <div className="wizard-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setNotesInput(booking.notes ?? "");
                      setEditingNotes(true);
                    }}
                  >
                    {booking.notes ? "Edit Notes" : "Add Notes"}
                  </button>
                </div>
              </>
            )}

            <h2>Items ({booking.booking_items.length})</h2>
            {booking.booking_items.map((bi) => {
              const itemPill = bookingItemStatusPill(bi);
              // A rental can only be returned once it's actually out —
              // a still-'booked' item was never physically handed over,
              // so there's nothing to return yet (confirm pickup first).
              const canReturn = bi.type === "rental" && bi.status === "out";
              const canConfirmPickup = bi.status === "booked";
              const canUndoPickup = bi.status === "out";
              return (
                <div className="line-item-card" key={bi.id}>
                  <div className="line-item-card-header">
                    <div className="line-item-title-group">
                      <Link to={`/items/${bi.item_id}`} className="line-item-thumb-link" aria-label={`View ${bi.items?.name}`}>
                        {bi.items?.photos?.[0] ? (
                          <img src={bi.items.photos[0]} alt="" className="line-item-thumb" />
                        ) : (
                          <span className="line-item-thumb line-item-thumb-placeholder" aria-hidden="true">
                            <ImageOff size={16} strokeWidth={2} />
                          </span>
                        )}
                      </Link>
                      <h3>
                        <Link to={`/items/${bi.item_id}`}>
                          {bi.items?.item_code} — {bi.items?.name}
                        </Link>
                      </h3>
                    </div>
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
                    <li>
                      Price charged: ₹{bi.price_charged}
                      {bi.is_foc && <> <span className="pill pill-foc">FOC</span></>}
                    </li>
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

                  {bi.pending_components.length > 0 && (
                    <div className="found-panel">
                      <p>
                        <strong>Still missing, not charged for:</strong>
                      </p>
                      {bi.return_notes && <p className="wizard-hint">"{bi.return_notes}"</p>}
                      <ul className="review-list">
                        {bi.pending_components.map((name) => {
                          const key = `${bi.id}:${name}`;
                          return (
                            <li key={name}>
                              {name}{" "}
                              <button
                                type="button"
                                className="btn-secondary btn-compact"
                                disabled={pendingSavingKey === key}
                                onClick={() => handleMarkPendingReturned(bi, name)}
                              >
                                {pendingSavingKey === key ? "Saving…" : "Mark Returned"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="wizard-hint">
                        To charge for this instead, use the <Link to="/charges">Charges</Link> page.
                      </p>
                      {pendingError && <p className="wizard-error">{pendingError}</p>}
                    </div>
                  )}

                  {bi.item_charges.length > 0 && (
                    <div className="found-panel">
                      <p>
                        <strong>Lost/damaged item charges:</strong>
                      </p>
                      <ul className="review-list">
                        {bi.item_charges.map((c) => (
                          <li key={c.id}>
                            {c.description} — ₹{c.charge_amount}{" "}
                            {c.resolved ? (
                              <span className="pill pill-info">
                                Resolved{c.resolved_at ? ` ${formatDateDisplay(c.resolved_at)}` : ""}
                              </span>
                            ) : (
                              <span className="pill pill-attention">Unpaid</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Only meaningful for a unique item — there's a real physical
                      hand-off between consecutive bookings. A quantity item can
                      have many bookings active at once, so "next in line" isn't
                      a single well-defined thing there. */}
                  {bi.items?.tracking_type === "unique" && (
                    // Bright red (.when-returns-panel) only once there's an
                    // actual next booking waiting on this exact item —
                    // genuinely urgent. "No bookings ahead" stays the plain,
                    // calm .found-panel — nothing to flag.
                    <div className={bi.future_booking_items && bi.future_booking_items.length > 0 ? "when-returns-panel" : "found-panel"}>
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

                  {(canConfirmPickup || canReturn || canUndoPickup) && (
                    <div className="line-item-actions">
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
                      {canUndoPickup &&
                        (undoConfirmId === bi.id ? (
                          <>
                            <span>Undo this pickup? The item goes back to booked, not out.</span>
                            <button
                              type="button"
                              className="btn-danger"
                              onClick={() => handleUndoPickup(bi)}
                              disabled={undoSavingId === bi.id}
                            >
                              {undoSavingId === bi.id ? "…" : "Yes, Undo Pickup"}
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => setUndoConfirmId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn-secondary" onClick={() => setUndoConfirmId(bi.id)}>
                            Undo Pickup
                          </button>
                        ))}
                    </div>
                  )}
                  {canUndoPickup && undoConfirmId === bi.id && undoError && <p className="wizard-error">{undoError}</p>}
                </div>
              );
            })}

            <h2>Payments</h2>
            {payments.length === 0 ? (
              <p className="wizard-hint">No payments recorded yet.</p>
            ) : (
              <ul className="review-list">
                {payments.map((p) => {
                  const editsForThisPayment = paymentEdits.filter((e) => e.payment_id === p.id);
                  const isEditingThis = editingPaymentId === p.id;
                  return (
                    <li key={p.id}>
                      <div>
                        ₹{p.amount} — {PAYMENT_METHOD_LABELS[p.method]} · {formatDateDisplay(p.payment_date)}
                        {p.notes ? ` — ${p.notes}` : ""}
                      </div>

                      {/* Full audit trail, visible right here — every past
                          correction to this specific entry, not just the
                          most recent one. */}
                      {editsForThisPayment.map((e) => (
                        <p key={e.id} className="wizard-hint payment-edit-entry">
                          Edited: ₹{e.old_amount} → ₹{e.new_amount} — "{e.reason}" — {e.edited_by_name ?? "Unknown"} ·{" "}
                          {formatDateDisplay(e.edited_at.slice(0, 10))}
                        </p>
                      ))}

                      {/* Refunds/charges (type='refund') aren't editable
                          here — they're managed through their own flows
                          (item charges / cancel-with-refund), same
                          restriction the backend enforces. */}
                      {p.type === "payment" &&
                        (isEditingThis ? (
                          <div className="wizard-step">
                            <label className="field-label">
                              New Amount (₹)
                              <input type="number" min={0} value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                            </label>
                            <label className="field-label">
                              Reason (required)
                              <input
                                type="text"
                                value={editReason}
                                onChange={(e) => setEditReason(e.target.value)}
                                placeholder="e.g. Typed ₹5000 instead of ₹500"
                              />
                            </label>
                            {editError && <p className="wizard-error">{editError}</p>}
                            <div className="wizard-actions">
                              <button type="button" className="btn-secondary" onClick={cancelEditPayment}>
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn-primary"
                                disabled={savingEdit}
                                onClick={() => handleSaveEditPayment(p.id)}
                              >
                                {savingEdit ? "Saving…" : "Save Correction"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="line-item-actions">
                            <button type="button" className="btn-secondary" onClick={() => startEditPayment(p)}>
                              Edit Payment
                            </button>
                          </div>
                        ))}
                    </li>
                  );
                })}
              </ul>
            )}

            {showPaymentForm && (
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
            )}
          </>
        )}
      </div>
      <div className="wizard-nav">
        <button className="btn-icon" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
        </button>
        {booking && (
          <>
            {!showPaymentForm && (
              <button className="btn-secondary btn-compact" onClick={() => setShowPaymentForm(true)}>
                <IndianRupee size={15} strokeWidth={2} aria-hidden="true" />
                Record Payment
              </button>
            )}
            <Link to={`/receipt/${booking.id}`} target="_blank" className="btn-secondary btn-compact">
              <Printer size={15} strokeWidth={2} aria-hidden="true" />
              Print/Download Receipt
            </Link>
            <button className="btn-primary btn-compact" onClick={onEdit}>
              <Pencil size={15} strokeWidth={2} aria-hidden="true" />
              Edit Booking
            </button>
          </>
        )}
      </div>
    </div>
  );
}
