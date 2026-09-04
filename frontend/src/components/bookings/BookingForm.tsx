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
import { ItemPicker } from "./ItemPicker";
import { Modal } from "../common/Modal";
import { AddItemWizard } from "../items/AddItemWizard";

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
  // Free of Cost — only ever honored server-side when the booking's
  // customer is MUA/Influencer; the price field above stays as entered
  // regardless, since the real listed price is kept as a reference.
  isFoc: boolean;
}

function emptyLineItem(type: BookingItemType): LineItemDraft {
  return {
    key: crypto.randomUUID(),
    type,
    itemId: "",
    quantityBooked: "1",
    pickupDate: "",
    returnDate: "",
    price: "",
    depositAmount: "",
    depositCollected: false,
    customAddons: [],
    newAddon: "",
    isFoc: false,
  };
}

export function BookingForm() {
  const [items, setItems] = useState<Item[]>([]);
  // Which line item's "+ Create New Item" modal is open, if any — keyed by
  // row.key so with multiple lines the newly created item lands back on
  // the exact row that asked for it, not just "the first" or "the last".
  const [addingItemForRow, setAddingItemForRow] = useState<string | null>(null);
  const [bookingCode, setBookingCode] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  // The entry-point choice — nothing else renders until this is set. Once
  // chosen it drives the heading and what new line items default to; it
  // deliberately never touches a line item's own `type` after the fact
  // (see chooseType below), so switching it back and forth can't silently
  // change data on rows already added.
  const [bookingType, setBookingType] = useState<BookingItemType | null>(null);
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);
  // Left blank on purpose — the backend defaults to today in IST when this
  // is omitted, same pattern as advanceDate below. Distinct from created_at
  // (never user-editable) — this is "the date the booking was actually
  // made", which the operator can backdate/correct.
  const [bookingDate, setBookingDate] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>("cash");
  // Left blank on purpose — the backend defaults to today in IST when this
  // is omitted, same pattern as ReturnForm's actual_return_date, rather
  // than the frontend computing "today" itself.
  const [advanceDate, setAdvanceDate] = useState("");
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

  // Pre-fill the (editable) booking code with the server's suggested next
  // BK-000N — a default to speed up the common case, not a lock-in; the
  // operator can type over it before saving. startAnother() re-fetches
  // explicitly after reset.
  useEffect(() => {
    fetchNextBookingCode()
      .then(({ booking_code }) => setBookingCode(booking_code))
      .catch(() => {});
  }, []);

  // First answer to "Rental or Sale?" seeds one line item of that type;
  // switching it afterward (the tabs stay clickable) only changes the
  // heading and what the "+ Add Another Item" button defaults to — rows
  // already on the form keep whatever type they were created with.
  function chooseType(type: BookingItemType) {
    if (bookingType === null) {
      setLineItems([emptyLineItem(type)]);
    }
    setBookingType(type);
  }

  function updateLineItem(key: string, patch: Partial<LineItemDraft>) {
    setLineItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addLineItem(type: BookingItemType) {
    setLineItems((rows) => [...rows, emptyLineItem(type)]);
  }

  function removeLineItem(key: string) {
    setLineItems((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
  }

  function selectedItemFor(row: LineItemDraft): Item | null {
    return items.find((i) => i.id === row.itemId) ?? null;
  }

  // Item or type changed for this row — re-derive the suggested price, same
  // "auto-fill but don't clobber a manual edit on unrelated re-renders"
  // reasoning as before, just scoped to the one row that actually changed.
  function handleItemChange(row: LineItemDraft, itemId: string) {
    const selected = items.find((i) => i.id === itemId) ?? null;
    const autoPrice = selected ? (row.type === "rental" ? selected.rental_price : selected.sale_price) : null;
    updateLineItem(row.key, { itemId, quantityBooked: "1", price: autoPrice != null ? String(autoPrice) : "" });
  }

  // From the "+ Create New Item" modal — same seamless behavior as adding a
  // new customer mid-booking: the freshly created item becomes this row's
  // selection immediately, no leaving the page or searching for it after.
  // Computed directly from the just-created `item`, not via handleItemChange
  // (which looks the id up in the `items` array) — setItems is async, so
  // that lookup would still miss on this same render and silently drop the
  // auto-filled price.
  function handleItemCreated(row: LineItemDraft, item: Item) {
    setItems((prev) => [item, ...prev]);
    const autoPrice = row.type === "rental" ? item.rental_price : item.sale_price;
    updateLineItem(row.key, { itemId: item.id, quantityBooked: "1", price: autoPrice != null ? String(autoPrice) : "" });
    setAddingItemForRow(null);
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
        advance_date: (toNumberOrNull(advanceAmount) ?? 0) > 0 ? advanceDate || null : null,
        booking_date: bookingDate || null,
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
            is_foc: r.isFoc,
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
    setBookingType(null);
    setLineItems([]);
    setBookingDate("");
    setAdvanceAmount("");
    setAdvanceMethod("cash");
    setAdvanceDate("");
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
      <div className="wizard-card wizard-success">
        <p className="success-check">✓ Booking Created</p>
        <p className="success-code">{saved.booking_code}</p>
        <p className="success-detail">{customer?.name}</p>
        <p className="wizard-hint">
          {saved.booking_items.length} item{saved.booking_items.length === 1 ? "" : "s"} · ₹{saved.price_charged}
        </p>
        <p className="wizard-hint">Booked on: {formatDateDisplay(saved.booking_date)}</p>
        {(toNumberOrNull(advanceAmount) ?? 0) > 0 && (
          <p className="wizard-hint">
            Advance of ₹{advanceAmount} ({PAYMENT_METHOD_LABELS[advanceMethod]}) recorded
            {advanceDate ? ` for ${formatDateDisplay(advanceDate)}` : ""}.
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
        <h2>
          {bookingType === "rental" ? "New Rental Booking" : bookingType === "sale" ? "New Sale" : "New Booking"}
        </h2>
        {!bookingType && <p className="wizard-hint">Is this a rental or a sale?</p>}

        <div className="type-gate">
          <button
            type="button"
            className={bookingType === "rental" ? "type-gate-btn active" : "type-gate-btn"}
            onClick={() => chooseType("rental")}
          >
            Rental
          </button>
          <button
            type="button"
            className={bookingType === "sale" ? "type-gate-btn active" : "type-gate-btn"}
            onClick={() => chooseType("sale")}
          >
            Sale
          </button>
        </div>

        {bookingType && (
          <>
            <label className="field-label">
              Booking Code
              <input
                type="text"
                value={bookingCode}
                onChange={(e) => setBookingCode(e.target.value)}
                placeholder="Auto-generated"
              />
            </label>
            <p className="wizard-hint">Suggested automatically — edit it if you'd rather use your own code.</p>

            <label className="field-label">
              Booking Date
              <input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
            </label>
            <p className="wizard-hint">Leave blank to use today. Distinct from pickup/return dates below.</p>

            <p className="field-label">Customer</p>
            <CustomerPicker selected={customer} onSelect={setCustomer} />
            {customer?.date_of_wedding && (
              <p className="wizard-hint">
                Wedding date on file: <strong>{formatDateDisplay(customer.date_of_wedding)}</strong>
              </p>
            )}

            {lineItems.map((row, index) => {
              const selected = selectedItemFor(row);
              const eligibleItems = items.filter((i) => i.tracking_type === "quantity" || i.status === "available");
              const conflict = itemConflicts.find((c) => c.index === index);
              // Only when a line's own type doesn't match the booking's primary
              // type (added via "+ Add a [X] item instead" below) — otherwise
              // it's implied by context and a badge would just be noise.
              const isMixedType = row.type !== bookingType;
              return (
                <div className="line-item-card" key={row.key}>
                  <div className="line-item-card-header">
                    <h3>
                      Item {index + 1}
                      {isMixedType && (
                        <span className="pill pill-active line-item-type-badge">
                          {row.type === "rental" ? "Rental" : "Sale"}
                        </span>
                      )}
                    </h3>
                    {lineItems.length > 1 && (
                      <button type="button" className="btn-secondary" onClick={() => removeLineItem(row.key)}>
                        Remove
                      </button>
                    )}
                  </div>

                  <p className="field-label">Item</p>
              <ItemPicker items={eligibleItems} selected={selected} onSelect={(id) => handleItemChange(row, id)} />
              <button type="button" className="btn-secondary" onClick={() => setAddingItemForRow(row.key)}>
                + Create New Item
              </button>
              {addingItemForRow === row.key && (
                <Modal onClose={() => setAddingItemForRow(null)}>
                  <AddItemWizard
                    onItemCreated={(item) => handleItemCreated(row, item)}
                    onViewItems={() => setAddingItemForRow(null)}
                  />
                </Modal>
              )}

              {selected?.tracking_type === "quantity" && (
                <label className="field-label">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    value={row.quantityBooked}
                    onChange={(e) => updateLineItem(row.key, { quantityBooked: e.target.value })}
                  />
                </label>
              )}

              {selected?.item_type === "set" && selected.components && selected.components.length > 0 && (
                <>
                  <p className="field-label">Components</p>
                  <p className="wizard-hint">
                    What's included in this set — checked off for real at return, not here.
                  </p>
                  <div className="checklist">
                    {selected.components.map((name) => (
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

              <p className="field-label">Additional Items</p>
              <p className="wizard-hint">
                Extra items for this line only — doesn't change the item's own components.
              </p>
              <div className="add-custom-row">
                <input
                  type="text"
                  placeholder="e.g. borrowed pouch"
                  value={row.newAddon}
                  onChange={(e) => updateLineItem(row.key, { newAddon: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomAddon(row))}
                />
                <button type="button" className="btn-secondary" onClick={() => addCustomAddon(row)}>
                  Add
                </button>
              </div>
              {row.customAddons.length > 0 && (
                <div className="chip-list">
                  {row.customAddons.map((name) => (
                    <span className="chip" key={name}>
                      {name}
                      <button type="button" onClick={() => removeCustomAddon(row, name)} aria-label={`Remove ${name}`}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <label className="field-label">
                {row.type === "rental" ? "Pickup Date" : "Sale Date"}
                <input
                  type="date"
                  value={row.pickupDate}
                  onChange={(e) => updateLineItem(row.key, { pickupDate: e.target.value })}
                />
              </label>

              {row.type === "rental" && (
                <label className="field-label">
                  Return Date
                  <input
                    type="date"
                    min={row.pickupDate || undefined}
                    value={row.returnDate}
                    onChange={(e) => updateLineItem(row.key, { returnDate: e.target.value })}
                  />
                </label>
              )}

              {/* Live, client-side — both the wedding date and this row's
                  own return date are already in state, so there's no need
                  to round-trip through the server the way the same-day-
                  turnover warning does. Checked per line item (not once per
                  booking), since a customer can rent the same item twice in
                  one transaction with different return dates. Plain string
                  comparison — both are ISO YYYY-MM-DD, safe to compare
                  lexicographically like every other date comparison in this
                  app (see checkUniqueRentalConflicts). */}
              {row.type === "rental" && row.returnDate && customer?.date_of_wedding && row.returnDate > customer.date_of_wedding && (
                <div className="found-panel">
                  <p>
                    This item returns after {customer.name}'s wedding date ({formatDateDisplay(customer.date_of_wedding)}) —
                    double check this is intended.
                  </p>
                </div>
              )}

              <label className="field-label">
                Price Charged (₹)
                <input
                  type="number"
                  min={0}
                  value={row.price}
                  onChange={(e) => updateLineItem(row.key, { price: e.target.value })}
                />
              </label>

              {(customer?.customer_type === "mua" || customer?.customer_type === "influencer") && (
                <label className="field-label">
                  <input
                    type="checkbox"
                    checked={row.isFoc}
                    onChange={(e) => updateLineItem(row.key, { isFoc: e.target.checked })}
                  />{" "}
                  Free of Cost (FOC)
                </label>
              )}

              {row.type === "rental" && (
                <>
                  <label className="field-label">
                    Security Deposit (₹)
                    <input
                      type="number"
                      min={0}
                      value={row.depositAmount}
                      onChange={(e) => updateLineItem(row.key, { depositAmount: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="field-label">
                    <input
                      type="checkbox"
                      checked={row.depositCollected}
                      onChange={(e) => updateLineItem(row.key, { depositCollected: e.target.checked })}
                    />{" "}
                    Deposit collected
                  </label>
                </>
              )}

              {conflict && (
                <div className="line-item-error">
                  <p>{conflict.error}</p>
                  {conflict.conflicts && conflict.conflicts.length > 0 && (
                    <ul className="conflict-list">
                      {(conflict.conflicts as { id: string; booking_code?: string; pickup_date: string; return_date: string | null }[]).map(
                        (c) => (
                          <li key={c.id}>
                            {formatDateDisplay(c.pickup_date)} → {formatDateDisplay(c.return_date)}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}

            <div className="add-item-row">
              <button type="button" className="btn-secondary" onClick={() => addLineItem(bookingType)}>
                + Add Another Item
              </button>
              <button
                type="button"
                className="add-other-type-link"
                onClick={() => addLineItem(bookingType === "rental" ? "sale" : "rental")}
              >
                + Add a {bookingType === "rental" ? "Sale" : "Rental"} item instead
              </button>
            </div>

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
              <>
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
                <label className="field-label">
                  Advance Paid On
                  <input type="date" value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} />
                </label>
                <p className="wizard-hint">Leave blank to use today.</p>
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

            {error && <p className="wizard-error">{error}</p>}
          </>
        )}
      </div>

      {bookingType && (
        <div className="wizard-nav">
          <button type="submit" className="btn-primary btn-save" disabled={!canSubmit || saving}>
            {saving ? "Creating…" : "Create Booking"}
          </button>
        </div>
      )}
    </form>
  );
}
