import { useEffect, useMemo, useState, type FormEvent } from "react";
import { fetchItems, type Item } from "../../lib/items";
import type { Customer } from "../../lib/customers";
import {
  createLegacyBooking,
  type LegacyFlatBooking,
  type BookingType,
  type ConflictingBooking,
} from "../../lib/bookings";
import { toIntOrNull, toNumberOrNull } from "../../lib/numbers";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "../../lib/payments";
import { CustomerPicker } from "./CustomerPicker";

export function BookingForm() {
  const [items, setItems] = useState<Item[]>([]);
  const [type, setType] = useState<BookingType>("rental");
  const [itemId, setItemId] = useState("");
  const [quantityBooked, setQuantityBooked] = useState("1");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [price, setPrice] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositCollected, setDepositCollected] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>("cash");
  const [customAddons, setCustomAddons] = useState<string[]>([]);
  const [newAddon, setNewAddon] = useState("");
  const [gstApplicable, setGstApplicable] = useState(false);
  const [gstInvoiceNumber, setGstInvoiceNumber] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictingBooking[] | null>(null);
  const [saved, setSaved] = useState<LegacyFlatBooking | null>(null);

  useEffect(() => {
    fetchItems({ activeOnly: true }).then(setItems);
  }, []);

  // Unique items only show while status = available (a coarse manual gate);
  // quantity items always show — how much is actually left for a given date
  // range is checked server-side at submit time.
  const eligibleItems = useMemo(
    () => items.filter((i) => i.tracking_type === "quantity" || i.status === "available"),
    [items],
  );
  const selectedItem = items.find((i) => i.id === itemId) ?? null;

  function addCustomAddon() {
    const name = newAddon.trim();
    if (!name || customAddons.includes(name)) return;
    setCustomAddons((a) => [...a, name]);
    setNewAddon("");
  }

  function removeCustomAddon(name: string) {
    setCustomAddons((a) => a.filter((n) => n !== name));
  }

  // Re-derive the suggested price whenever the item or booking type changes
  // — but only then, so a manually typed value (a negotiated discount)
  // isn't clobbered by unrelated re-renders.
  useEffect(() => {
    const autoPrice = selectedItem ? (type === "rental" ? selectedItem.rental_price : selectedItem.sale_price) : null;
    setPrice(autoPrice != null ? String(autoPrice) : "");
    // Deliberately keyed on [itemId, type] only, not selectedItem/items — a
    // manually edited price must survive re-renders that don't change which
    // item or booking type is selected.
  }, [itemId, type]);

  useEffect(() => {
    setQuantityBooked("1");
  }, [itemId]);

  // A conflict/error from a previous submission attempt refers to whatever
  // item/type/dates were selected at the time — leaving it on screen after
  // switching to a different item or type would misleadingly imply it still
  // applies.
  useEffect(() => {
    setError(null);
    setConflicts(null);
  }, [itemId, type]);

  const canSubmit =
    !!itemId &&
    !!customer &&
    !!pickupDate &&
    (type === "sale" || !!returnDate) &&
    price.trim().length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedItem || !customer) return;
    setError(null);
    setConflicts(null);
    setSaving(true);
    try {
      const result = await createLegacyBooking({
        type,
        item_id: itemId,
        quantity_booked: selectedItem.tracking_type === "quantity" ? toIntOrNull(quantityBooked) ?? 1 : 1,
        customer_id: customer.id,
        pickup_date: pickupDate,
        return_date: type === "rental" ? returnDate : null,
        price_charged: toNumberOrNull(price) ?? 0,
        deposit_amount: type === "rental" ? toNumberOrNull(depositAmount) ?? 0 : 0,
        deposit_collected: type === "rental" ? depositCollected : false,
        gst_applicable: gstApplicable,
        gst_invoice_number: gstApplicable ? gstInvoiceNumber.trim() || null : null,
        hsn_code: gstApplicable ? hsnCode.trim() || null : null,
        tax_rate: gstApplicable ? toNumberOrNull(taxRate) : null,
        advance_amount: toNumberOrNull(advanceAmount) ?? 0,
        advance_method: (toNumberOrNull(advanceAmount) ?? 0) > 0 ? advanceMethod : null,
        custom_addons: customAddons,
      });
      if (result.type === "created") {
        setSaved(result.booking);
      } else {
        setError(result.message);
        setConflicts(result.conflicts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setSaving(false);
    }
  }

  function startAnother() {
    setType("rental");
    setItemId("");
    setQuantityBooked("1");
    setCustomer(null);
    setPickupDate("");
    setReturnDate("");
    setPrice("");
    setDepositAmount("");
    setDepositCollected(false);
    setAdvanceAmount("");
    setAdvanceMethod("cash");
    setCustomAddons([]);
    setNewAddon("");
    setGstApplicable(false);
    setGstInvoiceNumber("");
    setHsnCode("");
    setTaxRate("");
    setError(null);
    setConflicts(null);
    setSaved(null);
  }

  if (saved) {
    return (
      <div className="wizard-card wizard-success">
        <p className="success-check">✓ Booking Created</p>
        <p className="success-code">{saved.booking_code}</p>
        <p>{customer?.name}</p>
        {(toNumberOrNull(advanceAmount) ?? 0) > 0 && (
          <p className="wizard-hint">
            Advance of ₹{advanceAmount} ({PAYMENT_METHOD_LABELS[advanceMethod]}) recorded.
          </p>
        )}
        {saved.warning && (
          <div className="found-panel">
            <p>{saved.warning}</p>
          </div>
        )}
        <div className="wizard-actions">
          <button className="btn-primary" onClick={startAnother}>
            Create Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="wizard-card" onSubmit={handleSubmit}>
      <div className="wizard-step">
        <h2>New Booking</h2>

        <div className="toggle-group">
          <button
            type="button"
            className={type === "rental" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setType("rental")}
          >
            Rental
          </button>
          <button
            type="button"
            className={type === "sale" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setType("sale")}
          >
            Sale
          </button>
        </div>

        <label className="field-label">
          Item
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Select an item…</option>
            {eligibleItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.item_code} — {i.name}
                {i.tracking_type === "quantity" ? ` (${i.quantity_on_hand ?? 0} on hand)` : ""}
              </option>
            ))}
          </select>
        </label>

        {selectedItem?.tracking_type === "quantity" && (
          <label className="field-label">
            Quantity
            <input
              type="number"
              min={1}
              value={quantityBooked}
              onChange={(e) => setQuantityBooked(e.target.value)}
            />
          </label>
        )}

        <p className="field-label">Additional Items</p>
        <p className="wizard-hint">
          Extra items for this booking only — doesn't change the item's own components.
        </p>
        <div className="add-custom-row">
          <input
            type="text"
            placeholder="e.g. borrowed pouch"
            value={newAddon}
            onChange={(e) => setNewAddon(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomAddon())}
          />
          <button type="button" className="btn-secondary" onClick={addCustomAddon}>
            Add
          </button>
        </div>
        {customAddons.length > 0 && (
          <div className="chip-list">
            {customAddons.map((name) => (
              <span className="chip" key={name}>
                {name}
                <button type="button" onClick={() => removeCustomAddon(name)} aria-label={`Remove ${name}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <p className="field-label">Customer</p>
        <CustomerPicker selected={customer} onSelect={setCustomer} />

        <label className="field-label">
          {type === "rental" ? "Pickup Date" : "Sale Date"}
          <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
        </label>

        {type === "rental" && (
          <label className="field-label">
            Return Date
            <input
              type="date"
              min={pickupDate || undefined}
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
            />
          </label>
        )}

        <label className="field-label">
          Price Charged (₹)
          <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>

        <label className="field-label">
          Advance Received (₹)
          <input
            type="number"
            min={0}
            value={advanceAmount}
            onChange={(e) => setAdvanceAmount(e.target.value)}
            placeholder="Optional"
          />
        </label>
        {(toNumberOrNull(advanceAmount) ?? 0) > 0 && (
          <label className="field-label">
            Payment Method
            <select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
        )}

        {type === "rental" && (
          <>
            <label className="field-label">
              Security Deposit (₹)
              <input
                type="number"
                min={0}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="field-label">
              <input
                type="checkbox"
                checked={depositCollected}
                onChange={(e) => setDepositCollected(e.target.checked)}
              />{" "}
              Deposit collected
            </label>
          </>
        )}

        <label className="field-label">
          <input type="checkbox" checked={gstApplicable} onChange={(e) => setGstApplicable(e.target.checked)} />{" "}
          GST applicable
        </label>

        {gstApplicable && (
          <>
            <label className="field-label">
              GST Invoice Number
              <input
                type="text"
                value={gstInvoiceNumber}
                onChange={(e) => setGstInvoiceNumber(e.target.value)}
              />
            </label>
            <label className="field-label">
              HSN Code
              <input type="text" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} />
            </label>
            <label className="field-label">
              Tax Rate (%)
              <input type="number" min={0} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </label>
          </>
        )}

        {error && (
          <div className="wizard-error">
            <p>{error}</p>
            {conflicts && conflicts.length > 0 && (
              <ul className="conflict-list">
                {conflicts.map((c) => (
                  <li key={c.id}>
                    {c.booking_code} — {c.customers?.name ?? "unknown customer"} ({c.pickup_date} → {c.return_date})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="wizard-nav">
        <button type="submit" className="btn-primary btn-save" disabled={!canSubmit || saving}>
          {saving ? "Creating…" : "Create Booking"}
        </button>
      </div>
    </form>
  );
}
