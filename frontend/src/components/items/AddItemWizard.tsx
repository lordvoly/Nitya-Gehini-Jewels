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

  useEffect(() => {
    fetchNextItemCode()
      .then(({ item_code }) => update("itemCode", item_code))
      .catch(() => {});
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
      <div className="card border-0 shadow-sm text-center p-5">
        <div className="avatar avatar-xl rounded-circle bg-success-subtle text-success mx-auto d-flex align-items-center justify-content-center mb-3">
          <i className="ti ti-check fs-1"></i>
        </div>
        <h4 className="fw-bold text-dark mb-1">Product Created Successfully!</h4>
        <p className="text-muted mb-3">
          <span className="badge bg-light text-dark border me-2">{saved.item_code}</span>
          {saved.name}
        </p>
        <div className="d-flex justify-content-center gap-2">
          <button className="btn btn-primary" onClick={startAnother}>
            <i className="ti ti-plus me-1"></i> Add Another Product
          </button>
          <button className="btn btn-outline-secondary" onClick={onViewItems}>
            <i className="ti ti-box-seam me-1"></i> View All Items
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-sm">
      {/* Wizard Progress Bar Header */}
      <div className="card-header bg-white p-4 border-bottom">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="fw-semibold text-dark">Add New Product</span>
          <span className="badge bg-primary-subtle text-primary rounded-pill px-3 py-1">
            Step {stepIndex + 1} of {visibleSteps.length}
          </span>
        </div>
        <div className="progress" style={{ height: 6 }}>
          <div
            className="progress-bar bg-primary"
            role="progressbar"
            style={{ width: `${((stepIndex + 1) / visibleSteps.length) * 100}%` }}
          ></div>
        </div>
      </div>

      <div className="card-body p-4">
        {step === "photo" && (
          <div>
            <h5 className="fw-bold text-dark mb-3">
              <i className="ti ti-photo me-2 text-primary"></i> Product Images
            </h5>
            <p className="text-muted small mb-4">Upload high-resolution photos for this jewelry piece.</p>
            <PhotoPicker
              photos={form.photos}
              onChange={(photos) => update("photos", photos)}
              onUploadingChange={setUploadingCount}
            />
          </div>
        )}

        {step === "basics" && (
          <div>
            <h5 className="fw-bold text-dark mb-4">
              <i className="ti ti-info-circle me-2 text-primary"></i> Basic Information
            </h5>

            <div className="row g-3">
              <div className="col-12 col-md-6">
                <label className="form-label fw-medium small">Product Name *</label>
                <input
                  type="text"
                  className="form-control"
                  autoFocus
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Peacock Kundan Bridal Set"
                  required
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label fw-medium small">Item Code</label>
                <input
                  type="text"
                  className="form-control font-monospace"
                  value={form.itemCode}
                  onChange={(e) => update("itemCode", e.target.value)}
                  placeholder="Auto-generated code"
                />
                <span className="text-muted fs-7">Suggested code automatically generated. Edit if custom code needed.</span>
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
                    onClick={() => update("item_type", "single")}
                  >
                    Single Piece
                  </button>
                  <button
                    type="button"
                    className={`btn ${form.item_type === "set" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => update("item_type", "set")}
                  >
                    Set (Multiple parts)
                  </button>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label fw-medium small">Tracking Type</label>
                <div className="btn-group w-100">
                  <button
                    type="button"
                    className={`btn ${form.tracking_type === "unique" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => update("tracking_type", "unique")}
                  >
                    One of a kind
                  </button>
                  <button
                    type="button"
                    className={`btn ${form.tracking_type === "quantity" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => update("tracking_type", "quantity")}
                  >
                    Stock Count
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
        )}

        {step === "components" && (
          <div>
            <h5 className="fw-bold text-dark mb-3">
              <i className="ti ti-list-details me-2 text-primary"></i> What's included in this set?
            </h5>
            <p className="text-muted small mb-3">Select or add individual parts included in this jewelry set.</p>

            <div className="d-flex flex-wrap gap-2 mb-4">
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
                Add Component
              </button>
            </div>

            {form.components.length > 0 && (
              <div className="p-3 bg-light rounded-3 border">
                <span className="fw-semibold text-dark small d-block mb-2">Selected Parts:</span>
                <div className="d-flex flex-wrap gap-2">
                  {form.components.map((name) => (
                    <span key={name} className="badge bg-white text-dark border py-2 px-3 rounded-pill d-inline-flex align-items-center gap-2">
                      {name}
                      <button
                        type="button"
                        className="btn-close btn-close-sm ms-1"
                        style={{ fontSize: "0.6rem" }}
                        onClick={() => removeComponent(name)}
                      ></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "prices" && (
          <div>
            <h5 className="fw-bold text-dark mb-4">
              <i className="ti ti-coin me-2 text-primary"></i> Pricing & Inventory Details
            </h5>

            <div className="row g-3">
              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">Daily Rental Rate</label>
                <div className="input-group">
                  <span className="input-group-text bg-white">₹</span>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    value={form.rentalPrice}
                    onChange={(e) => update("rentalPrice", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">Outright Sale Price</label>
                <div className="input-group">
                  <span className="input-group-text bg-white">₹</span>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    value={form.salePrice}
                    onChange={(e) => update("salePrice", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label fw-medium small">Security Deposit</label>
                <div className="input-group">
                  <span className="input-group-text bg-white">₹</span>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    value={form.securityDeposit}
                    onChange={(e) => update("securityDeposit", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label fw-medium small">Storage Location</label>
                <div className="input-group">
                  <span className="input-group-text bg-white">
                    <i className="ti ti-map-pin text-muted"></i>
                  </span>
                  <input
                    type="text"
                    className="form-control"
                    value={form.currentLocation}
                    onChange={(e) => update("currentLocation", e.target.value)}
                    placeholder="e.g. Safe 2, Tray B"
                  />
                </div>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label fw-medium small">Initial Status</label>
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
                <label className="form-label fw-medium small">Additional Notes</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Details regarding condition, alterations, care instructions..."
                />
              </div>
            </div>
          </div>
        )}

        {step === "review" && (
          <div>
            <h5 className="fw-bold text-dark mb-4">
              <i className="ti ti-file-check me-2 text-primary"></i> Review Product Summary
            </h5>

            <div className="p-4 bg-light rounded-3 border mb-3">
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <span className="text-muted small d-block">Product Name</span>
                  <strong className="text-dark fs-5">{form.name || "(no name)"}</strong>
                </div>

                <div className="col-12 col-md-6">
                  <span className="text-muted small d-block">Item Code</span>
                  <span className="badge bg-white text-dark border font-monospace fs-6">
                    {form.itemCode.trim() || "(auto-generated)"}
                  </span>
                </div>

                <div className="col-12 col-md-4">
                  <span className="text-muted small d-block">Category</span>
                  <span className="fw-medium text-dark">{form.category}</span>
                </div>

                <div className="col-12 col-md-4">
                  <span className="text-muted small d-block">Type & Stock</span>
                  <span className="fw-medium text-dark">
                    {form.item_type === "set" ? "Set" : "Single"} · {form.tracking_type === "quantity" ? `Qty ${form.quantityOnHand}` : "Unique Piece"}
                  </span>
                </div>

                <div className="col-12 col-md-4">
                  <span className="text-muted small d-block">Rental / Sale Rate</span>
                  <span className="fw-medium text-dark">
                    Rental: {form.rentalPrice ? `₹${form.rentalPrice}` : "—"} | Sale: {form.salePrice ? `₹${form.salePrice}` : "—"}
                  </span>
                </div>

                {form.item_type === "set" && (
                  <div className="col-12">
                    <span className="text-muted small d-block">Components</span>
                    <span className="fw-medium text-dark">{form.components.join(", ") || "None"}</span>
                  </div>
                )}

                <div className="col-12">
                  <span className="text-muted small d-block">Photos Uploaded</span>
                  <span className="badge bg-primary-subtle text-primary">{form.photos.length} photo(s)</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="alert alert-danger py-2 px-3 small mb-3">
                <i className="ti ti-alert-circle me-1"></i> {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Navigation Buttons */}
      <div className="card-footer bg-white p-3 border-top d-flex justify-content-between align-items-center">
        {stepIndex > 0 ? (
          <button type="button" className="btn btn-outline-secondary" onClick={back}>
            <i className="ti ti-arrow-left me-1"></i> Back
          </button>
        ) : (
          <div></div>
        )}

        {step !== "review" ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={next}
            disabled={step === "basics" && !form.name.trim()}
          >
            Continue <i className="ti ti-arrow-right ms-1"></i>
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary px-4 fw-bold"
            onClick={handleSave}
            disabled={saving || uploadingCount > 0}
          >
            {saving ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status"></span> Saving Product…
              </>
            ) : uploadingCount > 0 ? (
              "Waiting for photos…"
            ) : (
              <>
                <i className="ti ti-check me-1"></i> Save Product
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
