import { useState } from "react";
import {
  ITEM_CATEGORIES,
  ITEM_STATUSES,
  updateItem,
  type Item,
  type ItemCategory,
  type ItemStatus,
  type ItemType,
  type NewItem,
  type TrackingType,
} from "../../lib/items";
import { toIntOrNull, toNumberOrNull } from "../../lib/numbers";
import { PhotoPicker } from "./PhotoPicker";

const COMMON_COMPONENTS = ["Necklace", "Earrings", "Tika", "Bangles", "Maang Tikka", "Ring"];

function formFromItem(item: Item) {
  return {
    photos: item.photos,
    itemCode: item.item_code,
    name: item.name,
    category: item.category,
    item_type: item.item_type,
    tracking_type: item.tracking_type,
    quantityOnHand: item.quantity_on_hand != null ? String(item.quantity_on_hand) : "1",
    components: item.components ?? [],
    newComponent: "",
    rentalPrice: item.rental_price != null ? String(item.rental_price) : "",
    salePrice: item.sale_price != null ? String(item.sale_price) : "",
    securityDeposit: item.security_deposit_default != null ? String(item.security_deposit_default) : "",
    currentLocation: item.current_location ?? "",
    status: item.status,
    notes: item.notes ?? "",
  };
}

export function ItemEditForm({
  item,
  onSaved,
  onCancel,
}: {
  item: Item;
  onSaved: (item: Item) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(formFromItem(item));
  const [uploadingCount, setUploadingCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof ReturnType<typeof formFromItem>>(
    key: K,
    value: ReturnType<typeof formFromItem>[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleComponent(name: string) {
    setForm((f) =>
      f.components.includes(name)
        ? { ...f, components: f.components.filter((c) => c !== name) }
        : { ...f, components: [...f.components, name] },
    );
  }

  function addCustomComponent() {
    const name = form.newComponent.trim();
    if (!name || form.components.includes(name)) return;
    setForm((f) => ({ ...f, components: [...f.components, name], newComponent: "" }));
  }

  function removeComponent(name: string) {
    setForm((f) => ({ ...f, components: f.components.filter((c) => c !== name) }));
  }

  async function handleSave() {
    setError(null);
    if (!form.itemCode.trim()) {
      setError("Item code is required.");
      return;
    }
    setSaving(true);
    const payload: NewItem = {
      item_code: form.itemCode.trim(),
      name: form.name.trim(),
      category: form.category,
      item_type: form.item_type,
      components: form.item_type === "set" ? form.components : null,
      tracking_type: form.tracking_type,
      quantity_on_hand: form.tracking_type === "quantity" ? toIntOrNull(form.quantityOnHand) : null,
      status: form.status,
      rental_price: toNumberOrNull(form.rentalPrice),
      sale_price: toNumberOrNull(form.salePrice),
      security_deposit_default: toNumberOrNull(form.securityDeposit),
      current_location: form.currentLocation.trim() || null,
      photos: form.photos,
      notes: form.notes.trim() || null,
    };
    try {
      const saved = await updateItem(item.id, payload);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white p-4 border-bottom d-flex align-items-center justify-content-between">
        <div>
          <h5 className="fw-bold text-dark mb-1 d-flex align-items-center gap-2">
            <i className="ti ti-edit text-primary"></i> Edit Product: {item.name}
          </h5>
          <span className="badge bg-light text-dark border font-monospace">{item.item_code}</span>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
          <i className="ti ti-x me-1"></i> Cancel
        </button>
      </div>

      <div className="card-body p-4">
        {/* Photos */}
        <div className="mb-4">
          <h6 className="fw-bold text-dark mb-3">
            <i className="ti ti-photo me-1 text-primary"></i> Product Photos
          </h6>
          <PhotoPicker
            photos={form.photos}
            onChange={(photos) => update("photos", photos)}
            onUploadingChange={setUploadingCount}
            hint=""
          />
        </div>

        <hr />

        {/* Basic Info */}
        <div className="mb-4">
          <h6 className="fw-bold text-dark mb-3">
            <i className="ti ti-info-circle me-1 text-primary"></i> Details & Classification
          </h6>

          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label className="form-label fw-medium small">Product Name *</label>
              <input
                type="text"
                className="form-control"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>

            <div className="col-12 col-md-6">
              <label className="form-label fw-medium small">Item Code *</label>
              <input
                type="text"
                className="form-control font-monospace"
                value={form.itemCode}
                onChange={(e) => update("itemCode", e.target.value)}
              />
            </div>

            <div className="col-12 col-md-6">
              <label className="form-label fw-medium small">Category</label>
              <select
                className="form-select"
                value={form.category}
                onChange={(e) => update("category", e.target.value as ItemCategory)}
              >
                {ITEM_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12 col-md-6">
              <label className="form-label fw-medium small">Type</label>
              <div className="btn-group w-100">
                <button
                  type="button"
                  className={`btn ${form.item_type === "single" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => update("item_type", "single" as ItemType)}
                >
                  Single Piece
                </button>
                <button
                  type="button"
                  className={`btn ${form.item_type === "set" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => update("item_type", "set" as ItemType)}
                >
                  Set (multiple parts)
                </button>
              </div>
            </div>

            <div className="col-12 col-md-6">
              <label className="form-label fw-medium small">Tracking Type</label>
              <div className="btn-group w-100">
                <button
                  type="button"
                  className={`btn ${form.tracking_type === "unique" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => update("tracking_type", "unique" as TrackingType)}
                >
                  One of a kind
                </button>
                <button
                  type="button"
                  className={`btn ${form.tracking_type === "quantity" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => update("tracking_type", "quantity" as TrackingType)}
                >
                  Stock count
                </button>
              </div>
            </div>

            {form.tracking_type === "quantity" && (
              <div className="col-12 col-md-6">
                <label className="form-label fw-medium small">Quantity on Hand</label>
                <input
                  type="number"
                  className="form-control"
                  min={0}
                  value={form.quantityOnHand}
                  onChange={(e) => update("quantityOnHand", e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        {form.item_type === "set" && (
          <>
            <hr />
            <div className="mb-4">
              <h6 className="fw-bold text-dark mb-3">
                <i className="ti ti-list-details me-1 text-primary"></i> Set Components
              </h6>

              <div className="d-flex flex-wrap gap-2 mb-3">
                {COMMON_COMPONENTS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`btn btn-sm rounded-pill ${
                      form.components.includes(name) ? "btn-primary" : "btn-outline-secondary"
                    }`}
                    onClick={() => toggleComponent(name)}
                  >
                    <i className={`ti ${form.components.includes(name) ? "ti-check" : "ti-plus"} me-1`}></i>
                    {name}
                  </button>
                ))}
              </div>

              <div className="input-group mb-3" style={{ maxWidth: 400 }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Other part name…"
                  value={form.newComponent}
                  onChange={(e) => update("newComponent", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomComponent())}
                />
                <button className="btn btn-outline-secondary" type="button" onClick={addCustomComponent}>
                  Add
                </button>
              </div>

              {form.components.length > 0 && (
                <div className="d-flex flex-wrap gap-2">
                  {form.components.map((name) => (
                    <span key={name} className="badge bg-white text-dark border py-2 px-3 rounded-pill d-inline-flex align-items-center gap-2">
                      {name}
                      <button
                        type="button"
                        className="btn-close btn-close-sm"
                        style={{ fontSize: "0.6rem" }}
                        onClick={() => removeComponent(name)}
                      ></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <hr />

        {/* Pricing & Location */}
        <div className="mb-3">
          <h6 className="fw-bold text-dark mb-3">
            <i className="ti ti-coin me-1 text-primary"></i> Pricing, Location & Status
          </h6>

          <div className="row g-3">
            <div className="col-12 col-md-4">
              <label className="form-label fw-medium small">Rental Price (₹)</label>
              <div className="input-group">
                <span className="input-group-text bg-white">₹</span>
                <input
                  type="number"
                  className="form-control"
                  min={0}
                  value={form.rentalPrice}
                  onChange={(e) => update("rentalPrice", e.target.value)}
                />
              </div>
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label fw-medium small">Sale Price (₹)</label>
              <div className="input-group">
                <span className="input-group-text bg-white">₹</span>
                <input
                  type="number"
                  className="form-control"
                  min={0}
                  value={form.salePrice}
                  onChange={(e) => update("salePrice", e.target.value)}
                />
              </div>
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label fw-medium small">Security Deposit (₹)</label>
              <div className="input-group">
                <span className="input-group-text bg-white">₹</span>
                <input
                  type="number"
                  className="form-control"
                  min={0}
                  value={form.securityDeposit}
                  onChange={(e) => update("securityDeposit", e.target.value)}
                />
              </div>
            </div>

            <div className="col-12 col-md-6">
              <label className="form-label fw-medium small">Current Location</label>
              <input
                type="text"
                className="form-control"
                value={form.currentLocation}
                onChange={(e) => update("currentLocation", e.target.value)}
              />
            </div>

            <div className="col-12 col-md-6">
              <label className="form-label fw-medium small">Status</label>
              <select
                className="form-select"
                value={form.status}
                onChange={(e) => update("status", e.target.value as ItemStatus)}
              >
                {ITEM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12">
              <label className="form-label fw-medium small">Notes</label>
              <textarea
                className="form-control"
                rows={2}
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </div>
          </div>
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
        <button
          type="button"
          className="btn btn-primary fw-semibold px-4"
          onClick={handleSave}
          disabled={saving || uploadingCount > 0}
        >
          {saving ? "Saving…" : uploadingCount > 0 ? "Uploading photos…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
