import { useEffect, useState, type FormEvent } from "react";
import { fetchItems, type Item } from "../../lib/items";
import type { Customer } from "../../lib/customers";
import {
  createBooking,
  fetchNextBookingCode,
  type Booking,
  type BookingItemType,
  type ItemConflict,
} from "../../lib/bookings";
import { toIntOrNull, toNumberOrNull } from "../../lib/numbers";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "../../lib/payments";
import { formatDateDisplay } from "../../lib/dates";
import { CustomerPicker } from "./CustomerPicker";

interface LineItemDraft {
  key: string;
  type: BookingItemType;
  itemId: string;
  quantityBooked: string;
  pickupDate: string;
  returnDate: string;
  price: string;
  depositAmount: string;
  depositCollected: boolean;
  customAddons: string[];
  newAddon: string;
}

function emptyLineItem(): LineItemDraft {
  return {
    key: crypto.randomUUID(),
    type: "rental",
    itemId: "",
    quantityBooked: "1",
    pickupDate: "",
    returnDate: "",
    price: "",
    depositAmount: "",
    depositCollected: false,
    customAddons: [],
    newAddon: "",
  };
}

export function BookingForm() {
  const [items, setItems] = useState<Item[]>([]);
  const [bookingCode, setBookingCode] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([emptyLineItem()]);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>("cash");
  const [gstApplicable, setGstApplicable] = useState(false);
  const [gstInvoiceNumber, setGstInvoiceNumber] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemConflicts, setItemConflicts] = useState<ItemConflict[]>([]);
  const [saved, setSaved] = useState<Booking | null>(null);

  useEffect(() => {
    fetchItems({ activeOnly: true }).then(setItems);
  }, []);

  useEffect(() => {
    fetchNextBookingCode()
      .then(({ booking_code }) => setBookingCode(booking_code))
      .catch(() => {});
  }, []);

  function updateLineItem(key: string, patch: Partial<LineItemDraft>) {
    setLineItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addLineItem() {
    setLineItems((rows) => [...rows, emptyLineItem()]);
  }

  function removeLineItem(key: string) {
    setLineItems((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
  }

  function selectedItemFor(row: LineItemDraft): Item | null {
    return items.find((i) => i.id === row.itemId) ?? null;
  }

  function handleItemChange(row: LineItemDraft, itemId: string) {
    const selected = items.find((i) => i.id === itemId) ?? null;
    const autoPrice = selected ? (row.type === "rental" ? selected.rental_price : selected.sale_price) : null;
    updateLineItem(row.key, { itemId, quantityBooked: "1", price: autoPrice != null ? String(autoPrice) : "" });
  }

  function handleTypeChange(row: LineItemDraft, type: BookingItemType) {
    const selected = selectedItemFor(row);
    const autoPrice = selected ? (type === "rental" ? selected.rental_price : selected.sale_price) : null;
    updateLineItem(row.key, { type, price: autoPrice != null ? String(autoPrice) : "" });
  }

  function addCustomAddon(row: LineItemDraft) {
    const name = row.newAddon.trim();
    if (!name || row.customAddons.includes(name)) return;
    updateLineItem(row.key, { customAddons: [...row.customAddons, name], newAddon: "" });
  }

  function removeCustomAddon(row: LineItemDraft, name: string) {
    updateLineItem(row.key, { customAddons: row.customAddons.filter((n) => n !== name) });
  }

  const canSubmit =
    !!customer &&
    lineItems.length > 0 &&
    lineItems.every(
      (r) => !!r.itemId && !!r.pickupDate && (r.type === "sale" || !!r.returnDate) && r.price.trim().length > 0,
    );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !customer) return;
    setError(null);
    setItemConflicts([]);
    setSaving(true);
    try {
      const result = await createBooking({
        booking_code: bookingCode.trim() || null,
        customer_id: customer.id,
        gst_applicable: gstApplicable,
        gst_invoice_number: gstApplicable ? gstInvoiceNumber.trim() || null : null,
        hsn_code: gstApplicable ? hsnCode.trim() || null : null,
        tax_rate: gstApplicable ? toNumberOrNull(taxRate) : null,
        advance_amount: toNumberOrNull(advanceAmount) ?? 0,
        advance_method: (toNumberOrNull(advanceAmount) ?? 0) > 0 ? advanceMethod : null,
        items: lineItems.map((r) => {
          const selected = selectedItemFor(r);
          return {
            type: r.type,
            item_id: r.itemId,
            quantity_booked: selected?.tracking_type === "quantity" ? toIntOrNull(r.quantityBooked) ?? 1 : 1,
            pickup_date: r.pickupDate,
            return_date: r.type === "rental" ? r.returnDate : null,
            price_charged: toNumberOrNull(r.price) ?? 0,
            deposit_amount: r.type === "rental" ? toNumberOrNull(r.depositAmount) ?? 0 : 0,
            deposit_collected: r.type === "rental" ? r.depositCollected : false,
            custom_addons: r.customAddons,
          };
        }),
      });
      if (result.type === "created") {
        setSaved(result.booking);
      } else {
        setError(result.message);
        setItemConflicts(result.item_conflicts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setSaving(false);
    }
  }

  function startAnother() {
    setBookingCode("");
    fetchNextBookingCode()
      .then(({ booking_code }) => setBookingCode(booking_code))
      .catch(() => {});
    setCustomer(null);
    setLineItems([emptyLineItem()]);
    setAdvanceAmount("");
    setAdvanceMethod("cash");
    setGstApplicable(false);
    setGstInvoiceNumber("");
    setHsnCode("");
    setTaxRate("");
    setError(null);
    setItemConflicts([]);
    setSaved(null);
  }

  if (saved) {
    return (
      <div className="card border-0 shadow-sm text-center p-5">
        <div className="avatar avatar-xl rounded-circle bg-success-subtle text-success mx-auto d-flex align-items-center justify-content-center mb-3">
          <i className="ti ti-check fs-1"></i>
        </div>
        <h4 className="fw-bold text-dark mb-1">Booking Created Successfully!</h4>
        <p className="text-muted mb-2">
          Booking Code: <span className="badge bg-light text-dark border font-monospace fs-6">{saved.booking_code}</span>
        </p>
        <p className="fw-semibold text-dark mb-1">Customer: {customer?.name}</p>
        <p className="text-muted small mb-3">
          {saved.booking_items.length} item{saved.booking_items.length === 1 ? "" : "s"} · Total Charged: ₹{saved.price_charged.toLocaleString("en-IN")}
        </p>
        {(toNumberOrNull(advanceAmount) ?? 0) > 0 && (
          <div className="alert alert-success py-2 px-3 small d-inline-block mb-3">
            <i className="ti ti-check me-1"></i> Advance of ₹{advanceAmount} ({PAYMENT_METHOD_LABELS[advanceMethod]}) recorded.
          </div>
        )}
        {saved.warning && (
          <div className="alert alert-warning py-2 px-3 small mb-3">
            <i className="ti ti-alert-triangle me-1"></i> {saved.warning}
          </div>
        )}
        <div className="d-flex justify-content-center gap-2 mt-2">
          <button className="btn btn-primary" onClick={startAnother}>
            <i className="ti ti-plus me-1"></i> Create Another Booking
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="card border-0 shadow-sm" onSubmit={handleSubmit}>
      <div className="card-header bg-white p-4 border-bottom">
        <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
          <i className="ti ti-calendar-plus text-primary"></i> Create New Rental / Sale Booking
        </h5>
      </div>

      <div className="card-body p-4">
        {/* Basic Details */}
        <div className="row g-3 mb-4">
          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Booking Code</label>
            <input
              type="text"
              className="form-control font-monospace"
              value={bookingCode}
              onChange={(e) => setBookingCode(e.target.value)}
              placeholder="Auto-generated"
            />
            <span className="text-muted fs-7">Suggested code generated automatically. Override if needed.</span>
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Customer *</label>
            <CustomerPicker selected={customer} onSelect={setCustomer} />
          </div>
        </div>

        <hr className="my-4" />

        {/* Line Items Section */}
        <h6 className="fw-bold text-dark mb-3">
          <i className="ti ti-box me-1 text-primary"></i> Items in this Booking
        </h6>

        <div className="d-flex flex-column gap-3 mb-4">
          {lineItems.map((row, index) => {
            const selected = selectedItemFor(row);
            const eligibleItems = items.filter((i) => i.tracking_type === "quantity" || i.status === "available");
            const conflict = itemConflicts.find((c) => c.index === index);

            return (
              <div className="card border p-3 rounded-3 bg-light" key={row.key}>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <span className="fw-bold text-dark">Item #{index + 1}</span>
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm py-1 px-2"
                      onClick={() => removeLineItem(row.key)}
                    >
                      <i className="ti ti-trash me-1"></i> Remove Item
                    </button>
                  )}
                </div>

                <div className="row g-3">
                  <div className="col-12 col-md-4">
                    <label className="form-label fw-medium small">Booking Type</label>
                    <div className="btn-group w-100">
                      <button
                        type="button"
                        className={`btn btn-sm ${row.type === "rental" ? "btn-primary" : "btn-outline-secondary"}`}
                        onClick={() => handleTypeChange(row, "rental")}
                      >
                        Rental
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${row.type === "sale" ? "btn-primary" : "btn-outline-secondary"}`}
                        onClick={() => handleTypeChange(row, "sale")}
                      >
                        Sale
                      </button>
                    </div>
                  </div>

                  <div className="col-12 col-md-8">
                    <label className="form-label fw-medium small">Select Item *</label>
                    <select
                      className="form-select"
                      value={row.itemId}
                      onChange={(e) => handleItemChange(row, e.target.value)}
                    >
                      <option value="">Choose item from inventory…</option>
                      {eligibleItems.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.item_code} — {i.name}
                          {i.tracking_type === "quantity" ? ` (Stock: ${i.quantity_on_hand ?? 0})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selected?.tracking_type === "quantity" && (
                    <div className="col-12 col-md-4">
                      <label className="form-label fw-medium small">Quantity Booked</label>
                      <input
                        type="number"
                        className="form-control"
                        min={1}
                        value={row.quantityBooked}
                        onChange={(e) => updateLineItem(row.key, { quantityBooked: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="col-12 col-md-4">
                    <label className="form-label fw-medium small">
                      {row.type === "rental" ? "Pickup Date *" : "Sale Date *"}
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={row.pickupDate}
                      onChange={(e) => updateLineItem(row.key, { pickupDate: e.target.value })}
                    />
                  </div>

                  {row.type === "rental" && (
                    <div className="col-12 col-md-4">
                      <label className="form-label fw-medium small">Return Date *</label>
                      <input
                        type="date"
                        className="form-control"
                        min={row.pickupDate || undefined}
                        value={row.returnDate}
                        onChange={(e) => updateLineItem(row.key, { returnDate: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="col-12 col-md-4">
                    <label className="form-label fw-medium small">Price Charged (₹) *</label>
                    <div className="input-group">
                      <span className="input-group-text bg-white">₹</span>
                      <input
                        type="number"
                        className="form-control"
                        min={0}
                        value={row.price}
                        onChange={(e) => updateLineItem(row.key, { price: e.target.value })}
                      />
                    </div>
                  </div>

                  {row.type === "rental" && (
                    <>
                      <div className="col-12 col-md-4">
                        <label className="form-label fw-medium small">Security Deposit (₹)</label>
                        <div className="input-group">
                          <span className="input-group-text bg-white">₹</span>
                          <input
                            type="number"
                            className="form-control"
                            min={0}
                            value={row.depositAmount}
                            onChange={(e) => updateLineItem(row.key, { depositAmount: e.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      <div className="col-12 col-md-4 d-flex align-items-center mt-md-4">
                        <div className="form-check">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            id={`dep-${row.key}`}
                            checked={row.depositCollected}
                            onChange={(e) => updateLineItem(row.key, { depositCollected: e.target.checked })}
                          />
                          <label className="form-check-label fw-medium small" htmlFor={`dep-${row.key}`}>
                            Security Deposit Collected
                          </label>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Custom Addons */}
                  <div className="col-12">
                    <label className="form-label fw-medium small">Included Extra Accessories / Addons</label>
                    <div className="input-group" style={{ maxWidth: 400 }}>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="e.g. Extra Velvet Pouch"
                        value={row.newAddon}
                        onChange={(e) => updateLineItem(row.key, { newAddon: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomAddon(row))}
                      />
                      <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => addCustomAddon(row)}>
                        Add Addon
                      </button>
                    </div>

                    {row.customAddons.length > 0 && (
                      <div className="d-flex flex-wrap gap-2 mt-2">
                        {row.customAddons.map((name) => (
                          <span key={name} className="badge bg-white text-dark border py-1 px-2 rounded-pill d-inline-flex align-items-center gap-1">
                            {name}
                            <button
                              type="button"
                              className="btn-close btn-close-sm"
                              style={{ fontSize: "0.55rem" }}
                              onClick={() => removeCustomAddon(row, name)}
                            ></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {conflict && (
                    <div className="col-12">
                      <div className="alert alert-danger py-2 px-3 small mb-0">
                        <p className="fw-semibold mb-1">{conflict.error}</p>
                        {conflict.conflicts && conflict.conflicts.length > 0 && (
                          <ul className="mb-0 ps-3">
                            {(conflict.conflicts as { id: string; booking_code?: string; pickup_date: string; return_date: string | null }[]).map(
                              (c) => (
                                <li key={c.id}>
                                  Conflicting reservation: {formatDateDisplay(c.pickup_date)} → {formatDateDisplay(c.return_date)}
                                </li>
                              ),
                            )}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" className="btn btn-outline-secondary btn-sm mb-4" onClick={addLineItem}>
          <i className="ti ti-plus me-1"></i> Add Another Item to Booking
        </button>

        <hr className="my-4" />

        {/* Payments & Taxes */}
        <h6 className="fw-bold text-dark mb-3">
          <i className="ti ti-receipt me-1 text-primary"></i> Payment & Tax Details
        </h6>

        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Advance Payment Received (₹)</label>
            <div className="input-group">
              <span className="input-group-text bg-white">₹</span>
              <input
                type="number"
                className="form-control"
                min={0}
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {(toNumberOrNull(advanceAmount) ?? 0) > 0 && (
            <div className="col-12 col-md-6">
              <label className="form-label fw-medium small">Advance Payment Method</label>
              <select
                className="form-select"
                value={advanceMethod}
                onChange={(e) => setAdvanceMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="col-12">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id="gstCheck"
                checked={gstApplicable}
                onChange={(e) => setGstApplicable(e.target.checked)}
              />
              <label className="form-check-label fw-medium small" htmlFor="gstCheck">
                GST Invoice Applicable
              </label>
            </div>
          </div>

          {gstApplicable && (
            <>
              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">GST Invoice Number</label>
                <input
                  type="text"
                  className="form-control"
                  value={gstInvoiceNumber}
                  onChange={(e) => setGstInvoiceNumber(e.target.value)}
                />
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">HSN Code</label>
                <input
                  type="text"
                  className="form-control"
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                />
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">Tax Rate (%)</label>
                <input
                  type="number"
                  className="form-control"
                  min={0}
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  placeholder="3.0"
                />
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="alert alert-danger py-2 px-3 small mt-3">
            <i className="ti ti-alert-circle me-1"></i> {error}
          </div>
        )}
      </div>

      <div className="card-footer bg-white p-3 border-top d-flex justify-content-end">
        <button type="submit" className="btn btn-primary fw-semibold px-4" disabled={!canSubmit || saving}>
          {saving ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status"></span> Creating Booking…
            </>
          ) : (
            <>
              <i className="ti ti-check me-1"></i> Confirm & Save Booking
            </>
          )}
        </button>
      </div>
    </form>
  );
}
