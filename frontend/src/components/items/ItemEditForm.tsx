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
    setSaving(true);
    const payload: NewItem = {
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
    <div className="wizard-card">
      <p className="wizard-progress">Editing {item.item_code}</p>
      <div className="wizard-step">
        <h2>Photos</h2>
        <PhotoPicker
          photos={form.photos}
          onChange={(photos) => update("photos", photos)}
          onUploadingChange={setUploadingCount}
          hint=""
        />

        <h2>Item Details</h2>
        <label className="field-label">
          Name
          <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} />
        </label>

        <p className="field-label">Category</p>
        <div className="button-grid">
          {ITEM_CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={form.category === cat ? "toggle-btn active" : "toggle-btn"}
              onClick={() => update("category", cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <p className="field-label">Type</p>
        <div className="toggle-group">
          <button
            className={form.item_type === "single" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => update("item_type", "single" as ItemType)}
          >
            Single Piece
          </button>
          <button
            className={form.item_type === "set" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => update("item_type", "set" as ItemType)}
          >
            Set (multiple parts)
          </button>
        </div>

        <p className="field-label">Tracking</p>
        <div className="toggle-group">
          <button
            className={form.tracking_type === "unique" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => update("tracking_type", "unique" as TrackingType)}
          >
            One of a kind
          </button>
          <button
            className={form.tracking_type === "quantity" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => update("tracking_type", "quantity" as TrackingType)}
          >
            Stock count
          </button>
        </div>

        {form.tracking_type === "quantity" && (
          <label className="field-label">
            Quantity on hand
            <input
              type="number"
              min={0}
              value={form.quantityOnHand}
              onChange={(e) => update("quantityOnHand", e.target.value)}
            />
          </label>
        )}

        {form.item_type === "set" && (
          <>
            <p className="field-label">Components</p>
            <div className="button-grid">
              {COMMON_COMPONENTS.map((name) => (
                <button
                  key={name}
                  className={form.components.includes(name) ? "toggle-btn active" : "toggle-btn"}
                  onClick={() => toggleComponent(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="add-custom-row">
              <input
                type="text"
                placeholder="Other part name…"
                value={form.newComponent}
                onChange={(e) => update("newComponent", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomComponent()}
              />
              <button className="btn-secondary" onClick={addCustomComponent}>
                Add
              </button>
            </div>
            {form.components.length > 0 && (
              <div className="chip-list">
                {form.components.map((name) => (
                  <span className="chip" key={name}>
                    {name}
                    <button onClick={() => removeComponent(name)} aria-label={`Remove ${name}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <h2>Pricing & Details</h2>
        <label className="field-label">
          Rental price (₹)
          <input
            type="number"
            min={0}
            value={form.rentalPrice}
            onChange={(e) => update("rentalPrice", e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="field-label">
          Sale price (₹)
          <input
            type="number"
            min={0}
            value={form.salePrice}
            onChange={(e) => update("salePrice", e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="field-label">
          Security deposit (₹)
          <input
            type="number"
            min={0}
            value={form.securityDeposit}
            onChange={(e) => update("securityDeposit", e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="field-label">
          Current location
          <input
            type="text"
            value={form.currentLocation}
            onChange={(e) => update("currentLocation", e.target.value)}
            placeholder="e.g. Display Case 3"
          />
        </label>
        <label className="field-label">
          Status
          <select value={form.status} onChange={(e) => update("status", e.target.value as ItemStatus)}>
            {ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Notes
          <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} />
        </label>

        {error && <p className="wizard-error">{error}</p>}
      </div>

      <div className="wizard-nav">
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || uploadingCount > 0}>
          {saving ? "Saving…" : uploadingCount > 0 ? "Waiting for photos…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
