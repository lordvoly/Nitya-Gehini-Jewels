import { useCallback, useEffect, useState, type FormEvent } from "react";
import { fetchItems, type Item } from "../../lib/items";
import type { Customer } from "../../lib/customers";
import {
  fetchBooking,
  updateBooking,
  updateBookingItem,
  addBookingItem,
  cancelBookingItem,
  cancelBooking,
  type Booking,
  type BookingItem,
  type BookingItemType,
} from "../../lib/bookings";
import { toIntOrNull, toNumberOrNull } from "../../lib/numbers";
import { CustomerPicker } from "./CustomerPicker";
import { bookingItemStatusPill } from "../../lib/statusPill";

interface NewItemDraft {
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

function emptyDraft(): NewItemDraft {
  return {
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

interface ItemEditState {
  pickupDate: string;
  returnDate: string;
  price: string;
  quantityBooked: string;
  depositAmount: string;
  depositCollected: boolean;
  customAddons: string[];
  newAddon: string;
}

function draftFromItem(bi: BookingItem): ItemEditState {
  return {
    pickupDate: bi.pickup_date,
    returnDate: bi.return_date ?? "",
    price: String(bi.price_charged),
    quantityBooked: String(bi.quantity_booked),
    depositAmount: String(bi.deposit_amount ?? 0),
    depositCollected: bi.deposit_collected,
    customAddons: bi.custom_addons ?? [],
    newAddon: "",
  };
}

export function EditBookingForm({ bookingId, onDone, onCancel }: { bookingId: string; onDone: () => void; onCancel: () => void }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [gstApplicable, setGstApplicable] = useState(false);
  const [gstInvoiceNumber, setGstInvoiceNumber] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [savingParent, setSavingParent] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);

  const [itemEdits, setItemEdits] = useState<Record<string, ItemEditState>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removeErrors, setRemoveErrors] = useState<Record<string, string>>({});
  const [refundNeeded, setRefundNeeded] = useState<Record<string, { message: string; amount: string }>>({});

  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<NewItemDraft>(emptyDraft());
  const [addingItem, setAddingItem] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [confirmingCancelBooking, setConfirmingCancelBooking] = useState(false);
  const [cancelBookingRefund, setCancelBookingRefund] = useState("");
  const [cancellingBooking, setCancellingBooking] = useState(false);
  const [cancelBookingError, setCancelBookingError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetchBooking(bookingId)
      .then((b) => {
        setBooking(b);
        setCustomer({
          id: b.customer_id,
          name: b.customers?.name ?? "",
          phone: b.customers?.phone ?? "",
          phone_secondary: null,
          email: null,
          address: "",
          notes: null,
          customer_type: "regular",
          created_at: "",
        });
        setGstApplicable(b.gst_applicable);
        setGstInvoiceNumber(b.gst_invoice_number ?? "");
        setHsnCode(b.hsn_code ?? "");
        setTaxRate(b.tax_rate != null ? String(b.tax_rate) : "");
        setItemEdits(Object.fromEntries(b.booking_items.map((bi) => [bi.id, draftFromItem(bi)])));
        setCancelBookingRefund(String(b.total_paid ?? 0));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load booking"))
      .finally(() => setLoading(false));
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchItems({ activeOnly: true }).then(setItems);
  }, []);

  async function handleSaveParent(e: FormEvent) {
    e.preventDefault();
    if (!customer) return;
    setParentError(null);
    setSavingParent(true);
    try {
      await updateBooking(bookingId, {
        customer_id: customer.id,
        gst_applicable: gstApplicable,
        gst_invoice_number: gstApplicable ? gstInvoiceNumber.trim() || null : null,
        hsn_code: gstApplicable ? hsnCode.trim() || null : null,
        tax_rate: gstApplicable ? toNumberOrNull(taxRate) : null,
      });
      await load();
    } catch (err) {
      setParentError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingParent(false);
    }
  }

  function updateItemEdit(itemId: string, patch: Partial<ItemEditState>) {
    setItemEdits((all) => ({ ...all, [itemId]: { ...all[itemId], ...patch } }));
  }

  function addAddonToEdit(bi: BookingItem) {
    const draftState = itemEdits[bi.id];
    const name = draftState.newAddon.trim();
    if (!name || draftState.customAddons.includes(name)) return;
    updateItemEdit(bi.id, { customAddons: [...draftState.customAddons, name], newAddon: "" });
  }

  function removeAddonFromEdit(bi: BookingItem, name: string) {
    updateItemEdit(bi.id, { customAddons: itemEdits[bi.id].customAddons.filter((n) => n !== name) });
  }

  async function handleSaveItem(bi: BookingItem) {
    const state = itemEdits[bi.id];
    setItemErrors((e) => ({ ...e, [bi.id]: "" }));
    setSavingItemId(bi.id);
    try {
      await updateBookingItem(bookingId, bi.item_id, {
        pickup_date: state.pickupDate,
        return_date: bi.type === "rental" ? state.returnDate || null : null,
        price_charged: toNumberOrNull(state.price) ?? 0,
        quantity_booked: toIntOrNull(state.quantityBooked) ?? 1,
        deposit_amount: bi.type === "rental" ? toNumberOrNull(state.depositAmount) ?? 0 : 0,
        deposit_collected: bi.type === "rental" ? state.depositCollected : false,
        custom_addons: state.customAddons,
      });
      await load();
    } catch (err) {
      setItemErrors((e) => ({ ...e, [bi.id]: err instanceof Error ? err.message : "Failed to save" }));
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleRemoveItem(bi: BookingItem) {
    setRemoveErrors((e) => ({ ...e, [bi.id]: "" }));
    setDeletingId(bi.id);
    try {
      const pending = refundNeeded[bi.id];
      const result = await cancelBookingItem(bookingId, bi.item_id, pending ? toNumberOrNull(pending.amount) ?? 0 : undefined);
      if (result.type === "refund_needed") {
        setRefundNeeded((all) => ({ ...all, [bi.id]: { message: result.message, amount: String(result.refundAmountNeeded) } }));
        return;
      }
      setConfirmingRemoveId(null);
      setRefundNeeded((all) => {
        const next = { ...all };
        delete next[bi.id];
        return next;
      });
      await load();
    } catch (err) {
      setRemoveErrors((e) => ({ ...e, [bi.id]: err instanceof Error ? err.message : "Failed to remove item" }));
    } finally {
      setDeletingId(null);
    }
  }

  function cancelRemoveItem(itemId: string) {
    setConfirmingRemoveId(null);
    setRefundNeeded((all) => {
      const next = { ...all };
      delete next[itemId];
      return next;
    });
  }

  async function handleCancelBooking() {
    setCancelBookingError(null);
    setCancellingBooking(true);
    try {
      await cancelBooking(bookingId, toNumberOrNull(cancelBookingRefund) ?? 0);
      setConfirmingCancelBooking(false);
      await load();
    } catch (err) {
      setCancelBookingError(err instanceof Error ? err.message : "Failed to cancel booking");
    } finally {
      setCancellingBooking(false);
    }
  }

  function selectedDraftItem(): Item | null {
    return items.find((i) => i.id === draft.itemId) ?? null;
  }

  function handleDraftItemChange(itemId: string) {
    const selected = items.find((i) => i.id === itemId) ?? null;
    const autoPrice = selected ? (draft.type === "rental" ? selected.rental_price : selected.sale_price) : null;
    setDraft((d) => ({ ...d, itemId, quantityBooked: "1", price: autoPrice != null ? String(autoPrice) : "" }));
  }

  function handleDraftTypeChange(type: BookingItemType) {
    const selected = selectedDraftItem();
    const autoPrice = selected ? (type === "rental" ? selected.rental_price : selected.sale_price) : null;
    setDraft((d) => ({ ...d, type, price: autoPrice != null ? String(autoPrice) : "" }));
  }

  function addDraftAddon() {
    const name = draft.newAddon.trim();
    if (!name || draft.customAddons.includes(name)) return;
    setDraft((d) => ({ ...d, customAddons: [...d.customAddons, name], newAddon: "" }));
  }

  function removeDraftAddon(name: string) {
    setDraft((d) => ({ ...d, customAddons: d.customAddons.filter((n) => n !== name) }));
  }

  const canAddItem =
    !!draft.itemId && !!draft.pickupDate && (draft.type === "sale" || !!draft.returnDate) && draft.price.trim().length > 0;

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    if (!canAddItem) return;
    setAddError(null);
    setAddingItem(true);
    try {
      const selected = selectedDraftItem();
      await addBookingItem(bookingId, {
        type: draft.type,
        item_id: draft.itemId,
        quantity_booked: selected?.tracking_type === "quantity" ? toIntOrNull(draft.quantityBooked) ?? 1 : 1,
        pickup_date: draft.pickupDate,
        return_date: draft.type === "rental" ? draft.returnDate : null,
        price_charged: toNumberOrNull(draft.price) ?? 0,
        deposit_amount: draft.type === "rental" ? toNumberOrNull(draft.depositAmount) ?? 0 : 0,
        deposit_collected: draft.type === "rental" ? draft.depositCollected : false,
        custom_addons: draft.customAddons,
      });
      setDraft(emptyDraft());
      setShowAddForm(false);
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setAddingItem(false);
    }
  }

  if (loading) {
    return (
      <div className="card border-0 shadow-sm p-5 text-center">
        <div className="spinner-border text-primary mx-auto mb-2" role="status"></div>
        <span className="text-muted small">Loading booking editor…</span>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="card border-0 shadow-sm p-4">
        <div className="alert alert-danger mb-3">
          <i className="ti ti-alert-circle me-1"></i> {error ?? "Booking not found"}
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  const hasActiveItems = booking.booking_items.some((bi) => bi.status === "booked" || bi.status === "out");

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white p-4 border-bottom d-flex align-items-center justify-content-between">
        <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
          <i className="ti ti-edit text-primary"></i> Edit Booking: {booking.booking_code}
        </h5>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onDone}>
          <i className="ti ti-check me-1"></i> Done Editing
        </button>
      </div>

      <div className="card-body p-4">
        {/* Parent Details Form */}
        <form className="mb-4" onSubmit={handleSaveParent}>
          <h6 className="fw-bold text-dark mb-3">Customer & Billing Information</h6>
          <div className="row g-3 mb-3">
            <div className="col-12 col-md-6">
              <label className="form-label fw-medium small">Customer</label>
              <CustomerPicker selected={customer} onSelect={setCustomer} />
            </div>

            <div className="col-12 col-md-6">
              <div className="form-check mt-md-4">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="editGstCheck"
                  checked={gstApplicable}
                  onChange={(e) => setGstApplicable(e.target.checked)}
                />
                <label className="form-check-label fw-medium small" htmlFor="editGstCheck">
                  GST Applicable
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
                  />
                </div>
              </>
            )}
          </div>

          {parentError && (
            <div className="alert alert-danger py-2 px-3 small mb-3">
              <i className="ti ti-alert-circle me-1"></i> {parentError}
            </div>
          )}

          <button type="submit" className="btn btn-outline-primary btn-sm fw-semibold" disabled={savingParent || !customer}>
            {savingParent ? "Saving…" : "Save Customer & Billing Changes"}
          </button>
        </form>

        <hr className="my-4" />

        {/* Existing Line Items */}
        <h6 className="fw-bold text-dark mb-3">
          <i className="ti ti-box me-1 text-primary"></i> Line Items ({booking.booking_items.length})
        </h6>

        <div className="d-flex flex-column gap-3 mb-4">
          {booking.booking_items.map((bi) => {
            const state = itemEdits[bi.id];
            const pill = bookingItemStatusPill(bi.status);
            const editable = bi.status === "booked" || bi.status === "out";
            if (!state) return null;

            return (
              <div className="card border p-3 bg-light" key={bi.id}>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div>
                    <span className="badge bg-light text-dark border font-monospace me-2">{bi.items?.item_code}</span>
                    <strong className="text-dark">{bi.items?.name}</strong>
                  </div>
                  <span className={`badge px-2 py-1 fs-7 ${pill.className === "pill-attention" ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success"}`}>
                    {pill.label}
                  </span>
                </div>

                {editable && (
                  <div className="row g-3 mt-1">
                    <div className="col-12 col-md-4">
                      <label className="form-label fw-medium small">Pickup Date</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={state.pickupDate}
                        onChange={(e) => updateItemEdit(bi.id, { pickupDate: e.target.value })}
                      />
                    </div>

                    {bi.type === "rental" && (
                      <div className="col-12 col-md-4">
                        <label className="form-label fw-medium small">Return Date</label>
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          value={state.returnDate}
                          onChange={(e) => updateItemEdit(bi.id, { returnDate: e.target.value })}
                        />
                      </div>
                    )}

                    <div className="col-12 col-md-4">
                      <label className="form-label fw-medium small">Price Charged (₹)</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min={0}
                        value={state.price}
                        onChange={(e) => updateItemEdit(bi.id, { price: e.target.value })}
                      />
                    </div>

                    {bi.type === "rental" && (
                      <>
                        <div className="col-12 col-md-4">
                          <label className="form-label fw-medium small">Deposit Amount (₹)</label>
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            min={0}
                            value={state.depositAmount}
                            onChange={(e) => updateItemEdit(bi.id, { depositAmount: e.target.value })}
                          />
                        </div>

                        <div className="col-12 col-md-4 d-flex align-items-center mt-md-4">
                          <div className="form-check">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              id={`edit-dep-${bi.id}`}
                              checked={state.depositCollected}
                              onChange={(e) => updateItemEdit(bi.id, { depositCollected: e.target.checked })}
                            />
                            <label className="form-check-label small" htmlFor={`edit-dep-${bi.id}`}>
                              Deposit Collected
                            </label>
                          </div>
                        </div>
                      </>
                    )}

                    {itemErrors[bi.id] && (
                      <div className="col-12">
                        <div className="alert alert-danger py-1 px-2 small mb-0">{itemErrors[bi.id]}</div>
                      </div>
                    )}

                    <div className="col-12 d-flex justify-content-end gap-2 mt-2">
                      {confirmingRemoveId === bi.id ? (
                        <div className="p-2 bg-danger-subtle rounded border border-danger-subtle d-flex align-items-center gap-2">
                          <span className="small text-danger">Remove this item?</span>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleRemoveItem(bi)}
                            disabled={deletingId === bi.id}
                          >
                            Yes, Remove
                          </button>
                          <button type="button" className="btn btn-light btn-sm" onClick={() => cancelRemoveItem(bi.id)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => setConfirmingRemoveId(bi.id)}
                          >
                            Remove Item
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm fw-semibold"
                            onClick={() => handleSaveItem(bi)}
                            disabled={savingItemId === bi.id}
                          >
                            {savingItemId === bi.id ? "Saving…" : "Save Item Edits"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Item to Existing Booking */}
        {!showAddForm ? (
          <button
            type="button"
            className="btn btn-outline-primary btn-sm mb-4"
            onClick={() => setShowAddForm(true)}
          >
            <i className="ti ti-plus me-1"></i> Add Another Item to this Booking
          </button>
        ) : (
          <form className="p-3 border rounded bg-light mb-4" onSubmit={handleAddItem}>
            <h6 className="fw-bold text-dark mb-3">Add Item to Booking</h6>

            <div className="row g-3">
              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">Type</label>
                <div className="btn-group w-100">
                  <button
                    type="button"
                    className={`btn btn-sm ${draft.type === "rental" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => handleDraftTypeChange("rental")}
                  >
                    Rental
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${draft.type === "sale" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => handleDraftTypeChange("sale")}
                  >
                    Sale
                  </button>
                </div>
              </div>

              <div className="col-12 col-md-8">
                <label className="form-label fw-medium small">Select Item</label>
                <select
                  className="form-select form-select-sm"
                  value={draft.itemId}
                  onChange={(e) => handleDraftItemChange(e.target.value)}
                >
                  <option value="">Select item…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.item_code} — {i.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">Pickup Date</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={draft.pickupDate}
                  onChange={(e) => setDraft((d) => ({ ...d, pickupDate: e.target.value }))}
                />
              </div>

              {draft.type === "rental" && (
                <div className="col-12 col-md-4">
                  <label className="form-label fw-medium small">Return Date</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={draft.returnDate}
                    onChange={(e) => setDraft((d) => ({ ...d, returnDate: e.target.value }))}
                  />
                </div>
              )}

              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">Price (₹)</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  min={0}
                  value={draft.price}
                  onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                />
              </div>
            </div>

            {addError && (
              <div className="alert alert-danger py-1 px-2 small mt-2">{addError}</div>
            )}

            <div className="d-flex justify-content-end gap-2 mt-3">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm fw-semibold"
                disabled={addingItem || !canAddItem}
              >
                {addingItem ? "Adding…" : "Add Item"}
              </button>
            </div>
          </form>
        )}

        {/* Cancel Whole Booking Section */}
        <hr className="my-4" />
        <div className="p-3 bg-danger-subtle border border-danger-subtle rounded">
          <h6 className="fw-bold text-danger mb-1">Danger Zone: Cancel Entire Booking</h6>
          <p className="text-muted small mb-2">Cancelling this booking releases all reserved items back into inventory.</p>

          {!confirmingCancelBooking ? (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmingCancelBooking(true)}
            >
              Cancel Entire Booking
            </button>
          ) : (
            <div className="mt-3 bg-white p-3 rounded border">
              <span className="fw-bold text-danger d-block mb-2">Confirm Booking Cancellation?</span>
              <div className="row g-2 mb-3">
                <div className="col-12 col-md-6">
                  <label className="form-label fw-medium small">Refund Amount to Record (₹)</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    min={0}
                    value={cancelBookingRefund}
                    onChange={(e) => setCancelBookingRefund(e.target.value)}
                  />
                </div>
              </div>

              {cancelBookingError && (
                <div className="alert alert-danger py-1 px-2 small mb-2">{cancelBookingError}</div>
              )}

              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleCancelBooking}
                  disabled={cancellingBooking}
                >
                  {cancellingBooking ? "Cancelling…" : "Yes, Cancel Booking"}
                </button>
                <button
                  type="button"
                  className="btn btn-light btn-sm"
                  onClick={() => setConfirmingCancelBooking(false)}
                >
                  Keep Booking
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card-footer bg-white p-3 border-top d-flex justify-content-end">
        <button type="button" className="btn btn-primary fw-semibold px-4" onClick={onDone}>
          Done Editing
        </button>
      </div>
    </div>
  );
}
