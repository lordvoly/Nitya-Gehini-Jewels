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
import { ArrowLeft } from "lucide-react";
import { toIntOrNull, toNumberOrNull } from "../../lib/numbers";
import { CustomerPicker } from "./CustomerPicker";
import { bookingItemStatusPill } from "../../lib/statusPill";
import { BookingDetailSkeleton } from "../common/Skeleton";
import { useSlowLoadHint } from "../../lib/useSlowLoadHint";
import { Modal } from "../common/Modal";
import { AddItemWizard } from "../items/AddItemWizard";

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
  isFoc: boolean;
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
    isFoc: false,
  };
}

// Per-line-item field edits, keyed by booking_items.id — separate from
// NewItemDraft (Add Item) since these edit an existing row via PATCH rather
// than building a POST payload from scratch.
interface ItemEditState {
  pickupDate: string;
  returnDate: string;
  price: string;
  quantityBooked: string;
  depositAmount: string;
  depositCollected: boolean;
  customAddons: string[];
  newAddon: string;
  isFoc: boolean;
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
    isFoc: bi.is_foc,
  };
}

// Parent fields (customer, GST) + per-item field edits + Add Item + Remove
// Item + whole-booking Cancel (§8 decision 6, now built on refund
// infrastructure). Removing an item never hard-deletes (backend flips
// status to 'cancelled'); it no longer blocks on a negative balance either
// — the exact refund amount needed comes back from the backend and is
// shown/editable here before confirming.
export function EditBookingForm({ bookingId, onDone, onCancel }: { bookingId: string; onDone: () => void; onCancel: () => void }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const showSlowHint = useSlowLoadHint(loading);

  const [customer, setCustomer] = useState<Customer | null>(null);
  // Real typo-fix support — previously there was no way to correct a
  // mistyped booking code after creation. Same client-side non-empty guard
  // as ItemEditForm's item_code edit (immediate feedback, no round trip),
  // backed by the same server-side check + friendly-409-on-collision.
  const [bookingCode, setBookingCode] = useState("");
  // Pre-filled from the existing value (unlike BookingForm's blank-
  // defaults-to-today field) — this is editing a real, already-known date,
  // not leaving an optional one to a server default.
  const [bookingDate, setBookingDate] = useState("");
  const [gstApplicable, setGstApplicable] = useState(false);
  const [gstInvoiceNumber, setGstInvoiceNumber] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [savingParent, setSavingParent] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  // Same inline-flag-plus-wizard-hint pattern as ProfilePanel's nameSaved/
  // passwordSaved — this form stays open for further edits after a save
  // (unlike ConfirmPickupForm/ReturnForm's one-shot full-screen success
  // swap, which doesn't fit here since there's more to do on this page
  // afterward), so a persistent inline confirmation next to the button is
  // the right match, not a full-page replace.
  const [parentSaved, setParentSaved] = useState(false);

  const [itemEdits, setItemEdits] = useState<Record<string, ItemEditState>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  // Same inline-flag-plus-wizard-hint pattern as parentSaved above — keyed
  // per booking_items.id (like itemErrors) since multiple line items can
  // each be saved independently.
  const [itemSaved, setItemSaved] = useState<Record<string, boolean>>({});

  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeErrors, setRemoveErrors] = useState<Record<string, string>>({});
  // Populated only once the backend has told us removing this item would
  // leave the customer overpaid — the exact amount it reports, editable
  // before the second, confirming call.
  const [refundNeeded, setRefundNeeded] = useState<Record<string, { message: string; amount: string }>>({});

  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<NewItemDraft>(emptyDraft());
  const [addingItem, setAddingItem] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // "+ Create New Item" quick-add, mirroring BookingForm's own — an
  // operator adding a new line item mid-edit shouldn't have to leave this
  // screen to create an item that doesn't exist in the catalog yet.
  const [showAddItemModal, setShowAddItemModal] = useState(false);

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
          // Real value now that the backend embed includes it (previously
          // hardcoded to "regular", which silently broke any FOC-visibility
          // check keyed off this — see BookingCustomerSummary in lib/bookings.ts).
          customer_type: b.customers?.customer_type ?? "regular",
          created_at: "",
          // Not part of the booking embed (BookingCustomerSummary) — this
          // synthetic Customer only exists to drive FOC-visibility here,
          // never the wedding-date reference/warning (that's BookingForm's
          // create-flow only), so null is always correct in this context.
          date_of_birth: null,
          date_of_wedding: null,
        });
        setBookingCode(b.booking_code);
        setBookingDate(b.booking_date);
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
    setParentSaved(false);
    if (!bookingCode.trim()) {
      setParentError("Booking code can't be empty");
      return;
    }
    setSavingParent(true);
    try {
      // PATCH /:id returns only the updated row's own columns (no
      // customers/booking_items/financials embed) — re-fetch the full shape
      // via load() rather than setBooking()-ing the PATCH response directly,
      // which would wipe booking.booking_items and crash the item list below.
      await updateBooking(bookingId, {
        customer_id: customer.id,
        booking_code: bookingCode.trim(),
        booking_date: bookingDate,
        gst_applicable: gstApplicable,
        gst_invoice_number: gstApplicable ? gstInvoiceNumber.trim() || null : null,
        hsn_code: gstApplicable ? hsnCode.trim() || null : null,
        tax_rate: gstApplicable ? toNumberOrNull(taxRate) : null,
      });
      await load();
      setParentSaved(true);
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
    setItemSaved((s) => ({ ...s, [bi.id]: false }));
    setSavingItemId(bi.id);
    try {
      // PATCH .../items/:bookingItemId returns only the raw booking_items row
      // (no nested items(item_code, name, ...) embed) — re-fetch via load()
      // rather than splicing that response into state, which would blank
      // out this row's item name/code in the header above.
      await updateBookingItem(bookingId, bi.id, {
        pickup_date: state.pickupDate,
        return_date: bi.type === "rental" ? state.returnDate || null : null,
        price_charged: toNumberOrNull(state.price) ?? 0,
        quantity_booked: toIntOrNull(state.quantityBooked) ?? 1,
        deposit_amount: bi.type === "rental" ? toNumberOrNull(state.depositAmount) ?? 0 : 0,
        deposit_collected: bi.type === "rental" ? state.depositCollected : false,
        custom_addons: state.customAddons,
        is_foc: state.isFoc,
      });
      await load();
      setItemSaved((s) => ({ ...s, [bi.id]: true }));
    } catch (err) {
      setItemErrors((e) => ({ ...e, [bi.id]: err instanceof Error ? err.message : "Failed to save" }));
    } finally {
      setSavingItemId(null);
    }
  }

  // Two calls, same handler: the first (no refundNeeded entry yet) tries a
  // plain removal; if the backend comes back with an exact amount needed,
  // that's stashed in refundNeeded and the confirm row switches to show it
  // instead of closing. The second call (refundNeeded[bi.id] present)
  // sends that — possibly edited — amount, which the backend records as an
  // actual refund before completing the removal.
  async function handleRemoveItem(bi: BookingItem) {
    setRemoveErrors((e) => ({ ...e, [bi.id]: "" }));
    setRemovingId(bi.id);
    try {
      const pending = refundNeeded[bi.id];
      const result = await cancelBookingItem(bookingId, bi.id, pending ? toNumberOrNull(pending.amount) ?? 0 : undefined);
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
      setRemovingId(null);
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

  // From the "+ Create New Item" modal — same seamless behavior
  // BookingForm's own line-item picker already has: the freshly created
  // item becomes this draft's selection immediately, no leaving the page
  // or searching for it after. Computed directly from the just-created
  // `item`, not via handleDraftItemChange (which looks the id up in the
  // `items` array) — setItems is async, so that lookup would still miss on
  // this same render and silently drop the auto-filled price.
  function handleItemCreated(item: Item) {
    setItems((prev) => [item, ...prev]);
    const autoPrice = draft.type === "rental" ? item.rental_price : item.sale_price;
    setDraft((d) => ({ ...d, itemId: item.id, quantityBooked: "1", price: autoPrice != null ? String(autoPrice) : "" }));
    setShowAddItemModal(false);
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
        is_foc: draft.isFoc,
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
      <div className="wizard-card">
        <div className="wizard-step">
          <BookingDetailSkeleton />
          {showSlowHint && (
            <p className="wizard-hint slow-load-hint">
              Still loading. The server may be waking up after a period of inactivity, which can take up to a minute.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="wizard-card">
        <p className="wizard-error">{error ?? "Booking not found"}</p>
        <div className="wizard-nav">
          <button className="btn-icon" aria-label="Back" onClick={onCancel}>
            <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const hasActiveItems = booking.booking_items.some((bi) => bi.status === "booked" || bi.status === "out");

  return (
    <div className="wizard-card">
      <div className="wizard-step">
        <h2>Edit Booking — {booking.booking_code}</h2>

        <form onSubmit={handleSaveParent}>
          <p className="field-label">Customer</p>
          <CustomerPicker selected={customer} onSelect={setCustomer} />

          <label className="field-label">
            Booking Code
            <input type="text" value={bookingCode} onChange={(e) => setBookingCode(e.target.value)} />
          </label>

          <label className="field-label">
            Booking Date
            <input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
          </label>
          <p className="wizard-hint">When this booking was actually made — separate from pickup/return dates.</p>

          <label className="field-label">
            <input type="checkbox" checked={gstApplicable} onChange={(e) => setGstApplicable(e.target.checked)} />{" "}
            GST applicable
          </label>
          {gstApplicable && (
            <>
              <label className="field-label">
                GST Invoice Number
                <input type="text" value={gstInvoiceNumber} onChange={(e) => setGstInvoiceNumber(e.target.value)} />
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
          {parentError && <p className="wizard-error">{parentError}</p>}
          {parentSaved && <p className="wizard-hint">Booking updated successfully.</p>}
          <div className="wizard-actions">
            <button type="submit" className="btn-primary" disabled={savingParent || !customer}>
              {savingParent ? "Saving…" : "Save Booking Details"}
            </button>
          </div>
        </form>

        <h2>Items ({booking.booking_items.length})</h2>
        {booking.booking_items.map((bi) => {
          const state = itemEdits[bi.id];
          const pill = bookingItemStatusPill(bi);
          const editable = bi.status === "booked" || bi.status === "out";
          if (!state) return null;

          if (!editable) {
            return (
              <div className="line-item-card" key={bi.id}>
                <div className="line-item-card-header">
                  <h3>
                    {bi.items?.item_code} — {bi.items?.name}
                  </h3>
                  <span className="pill-group">
                    <span className={`pill ${pill.className}`}>{pill.label}</span>
                    {bi.is_foc && <span className="pill pill-foc">FOC</span>}
                  </span>
                </div>
                <p className="wizard-hint">
                  {bi.status === "returned"
                    ? "Returned — no further edits."
                    : bi.status === "cancelled"
                      ? "Cancelled — no further edits."
                      : "No further edits."}
                </p>
              </div>
            );
          }

          const pendingRefund = refundNeeded[bi.id];

          // FOC's own lock is booking-level (computed_status), separate from
          // `editable` above (per-item status) — a sale-only booking can
          // reach computed_status 'completed' while its item's own status
          // is still 'booked'/'out', which `editable` alone wouldn't catch.
          // See the matching backend check in bookings.ts's PATCH
          // .../items/:itemId for why these are deliberately two different
          // conditions.
          const focLocked = booking.computed_status !== "active";
          const canShowFoc = customer?.customer_type === "mua" || customer?.customer_type === "influencer";

          return (
            <div className="line-item-card" key={bi.id}>
              <div className="line-item-card-header">
                <h3>
                  {bi.items?.item_code} — {bi.items?.name}
                </h3>
                <span className="pill-group">
                  <span className={`pill ${pill.className}`}>{pill.label}</span>
                  {bi.is_foc && <span className="pill pill-foc">FOC</span>}
                </span>
              </div>

              {bi.items?.tracking_type === "quantity" && (
                <label className="field-label">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    value={state.quantityBooked}
                    onChange={(e) => updateItemEdit(bi.id, { quantityBooked: e.target.value })}
                  />
                </label>
              )}

              <label className="field-label">
                {bi.type === "rental" ? "Pickup Date" : "Sale Date"}
                <input
                  type="date"
                  value={state.pickupDate}
                  onChange={(e) => updateItemEdit(bi.id, { pickupDate: e.target.value })}
                />
              </label>

              {bi.type === "rental" && (
                <label className="field-label">
                  Return Date
                  <input
                    type="date"
                    min={state.pickupDate || undefined}
                    value={state.returnDate}
                    onChange={(e) => updateItemEdit(bi.id, { returnDate: e.target.value })}
                  />
                </label>
              )}

              <label className="field-label">
                Price Charged (₹)
                <input
                  type="number"
                  min={0}
                  value={state.price}
                  onChange={(e) => updateItemEdit(bi.id, { price: e.target.value })}
                />
              </label>

              {canShowFoc && (
                <>
                  <label className="field-label">
                    <input
                      type="checkbox"
                      checked={state.isFoc}
                      disabled={focLocked}
                      onChange={(e) => updateItemEdit(bi.id, { isFoc: e.target.checked })}
                    />{" "}
                    Free of Cost (FOC)
                  </label>
                  {focLocked && <p className="wizard-hint">Locked — this booking is already Completed.</p>}
                </>
              )}

              {bi.type === "rental" && (
                <>
                  <label className="field-label">
                    Security Deposit (₹)
                    <input
                      type="number"
                      min={0}
                      value={state.depositAmount}
                      onChange={(e) => updateItemEdit(bi.id, { depositAmount: e.target.value })}
                    />
                  </label>
                  <label className="field-label">
                    <input
                      type="checkbox"
                      checked={state.depositCollected}
                      onChange={(e) => updateItemEdit(bi.id, { depositCollected: e.target.checked })}
                    />{" "}
                    Deposit collected
                  </label>
                </>
              )}

              <p className="field-label">Additional Items</p>
              <div className="add-custom-row">
                <input
                  type="text"
                  placeholder="e.g. borrowed pouch"
                  value={state.newAddon}
                  onChange={(e) => updateItemEdit(bi.id, { newAddon: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAddonToEdit(bi))}
                />
                <button type="button" className="btn-secondary" onClick={() => addAddonToEdit(bi)}>
                  Add
                </button>
              </div>
              {state.customAddons.length > 0 && (
                <div className="chip-list">
                  {state.customAddons.map((name) => (
                    <span className="chip" key={name}>
                      {name}
                      <button type="button" onClick={() => removeAddonFromEdit(bi, name)} aria-label={`Remove ${name}`}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {itemErrors[bi.id] && <p className="line-item-error">{itemErrors[bi.id]}</p>}
              {itemSaved[bi.id] && <p className="wizard-hint">Item updated successfully.</p>}

              <div className="line-item-card-header" style={{ marginTop: 14 }}>
                <button type="button" className="btn-primary" disabled={savingItemId === bi.id} onClick={() => handleSaveItem(bi)}>
                  {savingItemId === bi.id ? "Saving…" : "Save Item"}
                </button>

                {confirmingRemoveId === bi.id ? (
                  pendingRefund ? (
                    <span className="refund-confirm-row">
                      {pendingRefund.message}
                      <label className="field-label">
                        Refund Amount (₹)
                        <input
                          type="number"
                          min={0}
                          value={pendingRefund.amount}
                          onChange={(e) =>
                            setRefundNeeded((all) => ({ ...all, [bi.id]: { ...all[bi.id], amount: e.target.value } }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-danger"
                        disabled={removingId === bi.id}
                        onClick={() => handleRemoveItem(bi)}
                      >
                        {removingId === bi.id ? "Removing…" : "Confirm Refund & Remove"}
                      </button>{" "}
                      <button type="button" className="btn-secondary" onClick={() => cancelRemoveItem(bi.id)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span>
                      Remove this item?{" "}
                      <button
                        type="button"
                        className="btn-danger"
                        disabled={removingId === bi.id}
                        onClick={() => handleRemoveItem(bi)}
                      >
                        {removingId === bi.id ? "Removing…" : "Yes, Remove"}
                      </button>{" "}
                      <button type="button" className="btn-secondary" onClick={() => cancelRemoveItem(bi.id)}>
                        Cancel
                      </button>
                    </span>
                  )
                ) : (
                  <button type="button" className="btn-danger" onClick={() => setConfirmingRemoveId(bi.id)}>
                    Remove Item
                  </button>
                )}
              </div>
              {removeErrors[bi.id] && <p className="line-item-error">{removeErrors[bi.id]}</p>}
            </div>
          );
        })}

        {showAddForm ? (
          <form className="line-item-card" onSubmit={handleAddItem}>
            <h3>Add Item</h3>
            <div className="toggle-group">
              <button
                type="button"
                className={draft.type === "rental" ? "toggle-btn active" : "toggle-btn"}
                onClick={() => handleDraftTypeChange("rental")}
              >
                Rental
              </button>
              <button
                type="button"
                className={draft.type === "sale" ? "toggle-btn active" : "toggle-btn"}
                onClick={() => handleDraftTypeChange("sale")}
              >
                Sale
              </button>
            </div>

            <label className="field-label">
              Item
              <select value={draft.itemId} onChange={(e) => handleDraftItemChange(e.target.value)}>
                <option value="">Select an item…</option>
                {items
                  .filter((i) => i.tracking_type === "quantity" || i.status === "available")
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.item_code} — {i.name}
                    </option>
                  ))}
              </select>
            </label>
            <button type="button" className="btn-secondary" onClick={() => setShowAddItemModal(true)}>
              + Create New Item
            </button>
            {showAddItemModal && (
              <Modal onClose={() => setShowAddItemModal(false)}>
                <AddItemWizard onItemCreated={handleItemCreated} onViewItems={() => setShowAddItemModal(false)} />
              </Modal>
            )}

            {selectedDraftItem()?.tracking_type === "quantity" && (
              <label className="field-label">
                Quantity
                <input
                  type="number"
                  min={1}
                  value={draft.quantityBooked}
                  onChange={(e) => setDraft((d) => ({ ...d, quantityBooked: e.target.value }))}
                />
              </label>
            )}

            <p className="field-label">Additional Items</p>
            <div className="add-custom-row">
              <input
                type="text"
                placeholder="e.g. borrowed pouch"
                value={draft.newAddon}
                onChange={(e) => setDraft((d) => ({ ...d, newAddon: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDraftAddon())}
              />
              <button type="button" className="btn-secondary" onClick={addDraftAddon}>
                Add
              </button>
            </div>
            {draft.customAddons.length > 0 && (
              <div className="chip-list">
                {draft.customAddons.map((name) => (
                  <span className="chip" key={name}>
                    {name}
                    <button type="button" onClick={() => removeDraftAddon(name)} aria-label={`Remove ${name}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <label className="field-label">
              {draft.type === "rental" ? "Pickup Date" : "Sale Date"}
              <input type="date" value={draft.pickupDate} onChange={(e) => setDraft((d) => ({ ...d, pickupDate: e.target.value }))} />
            </label>

            {draft.type === "rental" && (
              <label className="field-label">
                Return Date
                <input
                  type="date"
                  min={draft.pickupDate || undefined}
                  value={draft.returnDate}
                  onChange={(e) => setDraft((d) => ({ ...d, returnDate: e.target.value }))}
                />
              </label>
            )}

            <label className="field-label">
              Price Charged (₹)
              <input type="number" min={0} value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))} />
            </label>

            {(customer?.customer_type === "mua" || customer?.customer_type === "influencer") && (
              <>
                <label className="field-label">
                  <input
                    type="checkbox"
                    checked={draft.isFoc}
                    disabled={booking.computed_status !== "active"}
                    onChange={(e) => setDraft((d) => ({ ...d, isFoc: e.target.checked }))}
                  />{" "}
                  Free of Cost (FOC)
                </label>
                {booking.computed_status !== "active" && <p className="wizard-hint">Locked — this booking is already Completed.</p>}
              </>
            )}

            {draft.type === "rental" && (
              <>
                <label className="field-label">
                  Security Deposit (₹)
                  <input
                    type="number"
                    min={0}
                    value={draft.depositAmount}
                    onChange={(e) => setDraft((d) => ({ ...d, depositAmount: e.target.value }))}
                  />
                </label>
                <label className="field-label">
                  <input
                    type="checkbox"
                    checked={draft.depositCollected}
                    onChange={(e) => setDraft((d) => ({ ...d, depositCollected: e.target.checked }))}
                  />{" "}
                  Deposit collected
                </label>
              </>
            )}

            {addError && <p className="wizard-error">{addError}</p>}

            <div className="wizard-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowAddForm(false);
                  setDraft(emptyDraft());
                  setAddError(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={!canAddItem || addingItem}>
                {addingItem ? "Adding…" : "Add Item"}
              </button>
            </div>
          </form>
        ) : (
          <div className="add-item-row">
            <button type="button" className="btn-secondary" onClick={() => setShowAddForm(true)}>
              + Add Item
            </button>
          </div>
        )}

        {hasActiveItems && (
          <div className="danger-zone">
            <h2>Cancel Booking</h2>
            <p className="wizard-hint">
              Cancels every still-active item in this booking at once — booking history stays intact, nothing is deleted.
            </p>
            {confirmingCancelBooking ? (
              <>
                <label className="field-label">
                  Refund Amount (₹)
                  <input
                    type="number"
                    min={0}
                    value={cancelBookingRefund}
                    onChange={(e) => setCancelBookingRefund(e.target.value)}
                  />
                </label>
                <p className="wizard-hint">Pre-filled with the total already paid — edit if keeping part of it.</p>
                {cancelBookingError && <p className="wizard-error">{cancelBookingError}</p>}
                <div className="wizard-actions">
                  <button type="button" className="btn-secondary" onClick={() => setConfirmingCancelBooking(false)}>
                    Back
                  </button>
                  <button type="button" className="btn-danger" disabled={cancellingBooking} onClick={handleCancelBooking}>
                    {cancellingBooking ? "Cancelling…" : "Confirm Cancel Booking"}
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="btn-danger" onClick={() => setConfirmingCancelBooking(true)}>
                Cancel Booking
              </button>
            )}
          </div>
        )}
      </div>

      <div className="wizard-nav">
        <button className="btn-icon" aria-label="Back" onClick={onCancel}>
          <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
        </button>
        <button className="btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
