import { useState, type FormEvent } from "react";
import { processReturn, type Booking, type BookingItem, type ReturnCharge } from "../../lib/bookings";
import { toNumberOrNull } from "../../lib/numbers";

interface ChargeDraft {
  enabled: boolean;
  description: string;
  amount: string;
}

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
  // Lost-and-found: an offer to charge for it, per unchecked component —
  // keyed the same way as checklist, description pre-filled from the
  // component name but editable (e.g. "Earrings" -> "1 lost earring").
  const [charges, setCharges] = useState<Record<string, ChargeDraft>>(
    Object.fromEntries(checklistNames.map((name) => [name, { enabled: false, description: name, amount: "" }])),
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
    setChecklist((c) => {
      const next = { ...c, [name]: !c[name] };
      // Checking a component back off cancels any pending charge for it —
      // nothing to charge for once it's confirmed present.
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
                <div key={name} className="checklist-row">
                  <label className="checklist-item">
                    <input type="checkbox" checked={checklist[name] ?? false} onChange={() => toggleComponent(name)} />
                    {name}
                  </label>
                  {!checklist[name] && (
                    <div className="lost-and-found">
                      <label className="checklist-item">
                        <input
                          type="checkbox"
                          checked={charges[name]?.enabled ?? false}
                          onChange={(e) => updateCharge(name, { enabled: e.target.checked })}
                        />
                        Charge for this
                      </label>
                      {charges[name]?.enabled && (
                        <div className="lost-and-found-fields">
                          <input
                            type="text"
                            value={charges[name].description}
                            onChange={(e) => updateCharge(name, { description: e.target.value })}
                            placeholder="Description"
                          />
                          <input
                            type="number"
                            min={0}
                            value={charges[name].amount}
                            onChange={(e) => updateCharge(name, { amount: e.target.value })}
                            placeholder="Amount (₹)"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
