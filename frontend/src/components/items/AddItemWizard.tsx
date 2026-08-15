import { useEffect, useMemo, useState } from "react";
import {
  ITEM_CATEGORIES,
  ITEM_STATUSES,
  createItem,
  fetchNextItemCode,
  type Item,
  type ItemCategory,
  type ItemStatus,
  type ItemType,
  type NewItem,
  type TrackingType,
} from "../../lib/items";
import { toIntOrNull, toNumberOrNull } from "../../lib/numbers";
import { itemStatusPill } from "../../lib/statusPill";
import { PhotoPicker } from "./PhotoPicker";

const COMMON_COMPONENTS = ["Necklace", "Earrings", "Tika", "Bangles", "Maang Tikka", "Ring"];

type StepKey = "photo" | "basics" | "components" | "prices" | "review";

function emptyForm() {
  return {
    photos: [] as string[],
    itemCode: "",
    name: "",
    category: ITEM_CATEGORIES[0] as ItemCategory,
    item_type: "single" as ItemType,
    tracking_type: "unique" as TrackingType,
    quantityOnHand: "1",
    components: [] as string[],
    newComponent: "",
    rentalPrice: "",
    salePrice: "",
    securityDeposit: "",
    currentLocation: "",
    status: "available" as ItemStatus,
    notes: "",
  };
}

export function AddItemWizard({
  onItemCreated,
  onViewItems,
}: {
  onItemCreated: (item: Item) => void;
  onViewItems: () => void;
}) {
  const [form, setForm] = useState(emptyForm());
  const [uploadingCount, setUploadingCount] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Item | null>(null);

  // Pre-fill the (editable) item code with the server's suggested next
  // NGJ-000N — a default to speed up the common case, not a lock-in; the
  // operator can type over it with his own convention before saving.
  useEffect(() => {
    fetchNextItemCode()
      .then(({ item_code }) => update("itemCode", item_code))
      .catch(() => {});
    // Runs once on mount; startAnother() re-fetches explicitly after reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleSteps = useMemo<StepKey[]>(
    () => ["photo", "basics", ...(form.item_type === "set" ? (["components"] as StepKey[]) : []), "prices", "review"],
    [form.item_type],
  );
  const step = visibleSteps[stepIndex];

  function update<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: ReturnType<typeof emptyForm>[K]) {
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

  function next() {
    setStepIndex((i) => Math.min(i + 1, visibleSteps.length - 1));
  }
  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    const payload: NewItem = {
      item_code: form.itemCode.trim() || null,
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
      const item = await createItem(payload);
      onItemCreated(item);
      setSaved(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  function startAnother() {
    setForm(emptyForm());
    setStepIndex(0);
    setSaved(null);
    setError(null);
    fetchNextItemCode()
      .then(({ item_code }) => update("itemCode", item_code))
      .catch(() => {});
  }

  if (saved) {
    return (
      <div className="wizard-card wizard-success">
        <p className="success-check">✓ Saved</p>
        <p className="success-code">{saved.item_code}</p>
        <p>{saved.name}</p>
        <div className="wizard-actions">
          <button className="btn-primary" onClick={startAnother}>
            Add Another
          </button>
          <button className="btn-secondary" onClick={onViewItems}>
            View All Items
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-card">
      <p className="wizard-progress">
        Step {stepIndex + 1} of {visibleSteps.length}
      </p>

      {step === "photo" && (
        <div className="wizard-step">
          <h2>Add Photos</h2>
          <PhotoPicker
            photos={form.photos}
            onChange={(photos) => update("photos", photos)}
            onUploadingChange={setUploadingCount}
          />
        </div>
      )}

      {step === "basics" && (
        <div className="wizard-step">
          <h2>Item Details</h2>
          <label className="field-label">
            Name
            <input
              type="text"
              autoFocus
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. Peacock Bridal Set"
            />
          </label>

          <label className="field-label">
            Item Code
            <input
              type="text"
              value={form.itemCode}
              onChange={(e) => update("itemCode", e.target.value)}
              placeholder="Auto-generated"
            />
          </label>
          <p className="wizard-hint">
            Suggested automatically — edit it if you'd rather use your own code.
          </p>

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
              onClick={() => update("item_type", "single")}
            >
              Single Piece
            </button>
            <button
              className={form.item_type === "set" ? "toggle-btn active" : "toggle-btn"}
              onClick={() => update("item_type", "set")}
            >
              Set (multiple parts)
            </button>
          </div>

          <p className="field-label">Tracking</p>
          <div className="toggle-group">
            <button
              className={form.tracking_type === "unique" ? "toggle-btn active" : "toggle-btn"}
              onClick={() => update("tracking_type", "unique")}
            >
              One of a kind
            </button>
            <button
              className={form.tracking_type === "quantity" ? "toggle-btn active" : "toggle-btn"}
              onClick={() => update("tracking_type", "quantity")}
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
        </div>
      )}

      {step === "components" && (
        <div className="wizard-step">
          <h2>What's included in this set?</h2>
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
          {form.components.length > 0 ? (
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
          ) : (
            <p className="wizard-hint">No components added yet.</p>
          )}
        </div>
      )}

      {step === "prices" && (
        <div className="wizard-step">
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
                  {itemStatusPill(s).label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Notes
            <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} />
          </label>
        </div>
      )}

      {step === "review" && (
        <div className="wizard-step">
          <h2>Review & Save</h2>
          <ul className="review-list">
            <li>
              <strong>{form.name || "(no name)"}</strong>
            </li>
            <li>Code: {form.itemCode.trim() || "(auto-generated on save)"}</li>
            <li>{form.category}</li>
            <li>
              {form.item_type === "set" ? "Set" : "Single"} · {form.tracking_type === "quantity" ? "Stock count" : "One of a kind"}
              {form.tracking_type === "quantity" && ` (${form.quantityOnHand || 0} on hand)`}
            </li>
            <li>
              Rental: {form.rentalPrice ? `₹${form.rentalPrice}` : "—"} · Sale: {form.salePrice ? `₹${form.salePrice}` : "—"}
            </li>
            <li>{form.photos.length} photo(s)</li>
          </ul>

          {form.item_type === "set" && (
            <>
              <p className="field-label">Components</p>
              {form.components.length > 0 ? (
                <div className="checklist">
                  {form.components.map((name) => (
                    <div key={name} className="checklist-row">
                      <span className="checklist-item checklist-item-static">
                        <span className="checklist-dot" aria-hidden="true" />
                        <span className="checklist-item-text">{name}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="wizard-hint">None added.</p>
              )}
            </>
          )}

          {error && <p className="wizard-error">{error}</p>}
          <button className="btn-primary btn-save" onClick={handleSave} disabled={saving || uploadingCount > 0}>
            {saving ? "Saving…" : uploadingCount > 0 ? "Waiting for photos…" : "Save Item"}
          </button>
        </div>
      )}

      <div className="wizard-nav">
        {stepIndex > 0 && (
          <button className="btn-secondary" onClick={back}>
            Back
          </button>
        )}
        {step !== "review" && (
          <button className="btn-primary" onClick={next} disabled={step === "basics" && !form.name.trim()}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}
