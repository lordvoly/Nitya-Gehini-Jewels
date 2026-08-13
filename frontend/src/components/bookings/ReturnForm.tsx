import { useState, type FormEvent } from "react";
import { processReturn, type Booking, type BookingItem, type ReturnCharge } from "../../lib/bookings";
import { toNumberOrNull } from "../../lib/numbers";

interface ChargeDraft {
  enabled: boolean;
  description: string;
  amount: string;
}

export function ReturnForm({
  booking,
  item,
  onCancel,
}: {
  booking: Booking;
  item: BookingItem;
  onCancel: () => void;
}) {
  const componentNames = item.items?.item_type === "set" ? item.items.components ?? [] : [];
  const addonNames = item.custom_addons ?? [];
  const checklistNames = [...componentNames, ...addonNames];
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries(checklistNames.map((name) => [name, false])),
  );
  const [charges, setCharges] = useState<Record<string, ChargeDraft>>(
    Object.fromEntries(checklistNames.map((name) => [name, { enabled: false, description: name, amount: "" }])),
  );
  const [returnNotes, setReturnNotes] = useState("");
  const [actualReturnDate, setActualReturnDate] = useState("");
  const [depositRefunded, setDepositRefunded] = useState(false);
  const [depositRefundDate, setDepositRefundDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingItem | null>(null);

  function toggleComponent(name: string) {
    setChecklist((c) => {
      const next = { ...c, [name]: !c[name] };
      if (next[name]) setCharges((all) => ({ ...all, [name]: { ...all[name], enabled: false } }));
      return next;
    });
  }

  function updateCharge(name: string, patch: Partial<ChargeDraft>) {
    setCharges((all) => ({ ...all, [name]: { ...all[name], ...patch } }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const chargesPayload: ReturnCharge[] = checklistNames
        .filter((name) => !checklist[name] && charges[name]?.enabled)
        .map((name) => ({
          description: charges[name].description.trim() || name,
          amount: toNumberOrNull(charges[name].amount) ?? 0,
        }))
        .filter((c) => c.amount > 0);

      const updated = await processReturn(booking.id, item.item_id, {
        return_checklist: checklistNames.length > 0 ? checklist : null,
        return_notes: returnNotes.trim() || null,
        actual_return_date: actualReturnDate || null,
        deposit_refunded: item.deposit_collected ? depositRefunded : null,
        deposit_refund_date: item.deposit_collected && depositRefunded ? depositRefundDate || null : null,
        charges: chargesPayload.length > 0 ? chargesPayload : undefined,
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
      <div className="card border-0 shadow-sm text-center p-5">
        <div className="avatar avatar-xl rounded-circle bg-success-subtle text-success mx-auto d-flex align-items-center justify-content-center mb-3">
          <i className="ti ti-check fs-1"></i>
        </div>
        <h4 className="fw-bold text-dark mb-1">Item Returned Successfully!</h4>
        <p className="text-muted mb-2">
          Booking: <span className="badge bg-light text-dark border font-monospace me-2">{booking.booking_code}</span>
          Item: <span className="fw-semibold text-dark">{item.items?.name}</span>
        </p>
        {result.warning && (
          <div className="alert alert-warning py-2 px-3 small d-inline-block mb-3">
            <i className="ti ti-alert-triangle me-1"></i> {result.warning}
          </div>
        )}
        <div className="d-flex justify-content-center gap-2 mt-2">
          <button className="btn btn-primary" onClick={onCancel}>
            <i className="ti ti-arrow-left me-1"></i> Back to Bookings
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="card border-0 shadow-sm" onSubmit={handleSubmit}>
      <div className="card-header bg-white p-4 border-bottom">
        <div className="d-flex align-items-center justify-content-between">
          <div>
            <h5 className="fw-bold text-dark mb-1 d-flex align-items-center gap-2">
              <i className="ti ti-corner-up-left text-warning"></i> Process Item Return
            </h5>
            <span className="badge bg-light text-dark border font-monospace me-2">{booking.booking_code}</span>
            <span className="text-muted small">Customer: {booking.customers?.name}</span>
          </div>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      <div className="card-body p-4">
        <div className="p-3 bg-light rounded border mb-4">
          <strong className="text-dark fs-6 d-block mb-1">Returning Item:</strong>
          <span className="badge bg-white text-dark border font-monospace me-2">{item.items?.item_code}</span>
          <span className="fw-semibold text-dark">{item.items?.name}</span>
        </div>

        {/* Checklist Section */}
        {checklistNames.length > 0 && (
          <div className="mb-4">
            <h6 className="fw-bold text-dark mb-3">
              <i className="ti ti-list-check me-1 text-primary"></i> Return Parts Checklist
            </h6>

            <div className="d-flex flex-column gap-2 mb-3">
              {checklistNames.map((name) => (
                <div className="p-3 border rounded bg-white" key={name}>
                  <div className="form-check d-flex align-items-center justify-content-between">
                    <div>
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        id={`check-${name}`}
                        checked={checklist[name] ?? false}
                        onChange={() => toggleComponent(name)}
                      />
                      <label className="form-check-label fw-medium text-dark cursor-pointer" htmlFor={`check-${name}`}>
                        {name}
                      </label>
                    </div>

                    {!checklist[name] && (
                      <span className="badge bg-danger-subtle text-danger">Part Missing / Not Checked</span>
                    )}
                  </div>

                  {!checklist[name] && (
                    <div className="mt-3 pt-3 border-top bg-light p-3 rounded">
                      <div className="form-check mb-2">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id={`charge-enable-${name}`}
                          checked={charges[name]?.enabled ?? false}
                          onChange={(e) => updateCharge(name, { enabled: e.target.checked })}
                        />
                        <label className="form-check-label fw-semibold text-danger small" htmlFor={`charge-enable-${name}`}>
                          Charge Customer for Missing/Damaged Part
                        </label>
                      </div>

                      {charges[name]?.enabled && (
                        <div className="row g-2 mt-1">
                          <div className="col-12 col-md-7">
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={charges[name].description}
                              onChange={(e) => updateCharge(name, { description: e.target.value })}
                              placeholder="Charge description (e.g. 1 Lost Earring)"
                            />
                          </div>
                          <div className="col-12 col-md-5">
                            <div className="input-group input-group-sm">
                              <span className="input-group-text bg-white">₹</span>
                              <input
                                type="number"
                                className="form-control"
                                min={0}
                                value={charges[name].amount}
                                onChange={(e) => updateCharge(name, { amount: e.target.value })}
                                placeholder="Amount"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Date & Notes */}
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Actual Return Date</label>
            <input
              type="date"
              className="form-control"
              value={actualReturnDate}
              onChange={(e) => setActualReturnDate(e.target.value)}
            />
            <span className="text-muted fs-7">Leave blank to use today's date.</span>
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Return Condition / Notes</label>
            <textarea
              className="form-control"
              rows={2}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="Optional notes on item condition upon return..."
            />
          </div>

          {item.deposit_collected && (
            <div className="col-12">
              <hr />
              <h6 className="fw-bold text-dark mb-3">
                <i className="ti ti-shield-check me-1 text-primary"></i> Security Deposit Refund
              </h6>

              <div className="form-check mb-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="depRefundCheck"
                  checked={depositRefunded}
                  onChange={(e) => setDepositRefunded(e.target.checked)}
                />
                <label className="form-check-label fw-medium text-dark" htmlFor="depRefundCheck">
                  Security Deposit Refunded to Customer (₹{item.deposit_amount})
                </label>
              </div>

              {depositRefunded && (
                <div className="col-12 col-md-6 mt-2">
                  <label className="form-label fw-medium small">Refund Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={depositRefundDate}
                    onChange={(e) => setDepositRefundDate(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="alert alert-danger py-2 px-3 small mt-3">
            <i className="ti ti-alert-circle me-1"></i> {error}
          </div>
        )}
      </div>

      <div className="card-footer bg-white p-3 border-top d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-warning fw-semibold px-4" disabled={saving}>
          {saving ? "Processing…" : "Confirm Return"}
        </button>
      </div>
    </form>
  );
}
