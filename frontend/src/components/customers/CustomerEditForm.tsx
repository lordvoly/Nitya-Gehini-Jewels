import { useState } from "react";
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  updateCustomer,
  type Customer,
  type CustomerType,
} from "../../lib/customers";

function formFromCustomer(customer: Customer) {
  return {
    name: customer.name,
    phone: customer.phone,
    phoneSecondary: customer.phone_secondary ?? "",
    email: customer.email ?? "",
    address: customer.address,
    customerType: customer.customer_type,
    notes: customer.notes ?? "",
  };
}

export function CustomerEditForm({
  customer,
  onSaved,
  onCancel,
}: {
  customer: Customer;
  onSaved: (customer: Customer) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(formFromCustomer(customer));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof ReturnType<typeof formFromCustomer>>(
    key: K,
    value: ReturnType<typeof formFromCustomer>[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSubmit = form.name.trim().length > 0 && form.phone.trim().length > 0 && form.address.trim().length > 0;

  async function handleSave() {
    if (!canSubmit) return;
    setError(null);
    setSaving(true);
    try {
      const saved = await updateCustomer(customer.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        phone_secondary: form.phoneSecondary.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim(),
        notes: form.notes.trim() || null,
        customer_type: form.customerType as CustomerType,
      });
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
        <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
          <i className="ti ti-edit text-primary"></i> Edit Customer: {customer.name}
        </h5>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
          <i className="ti ti-x me-1"></i> Cancel
        </button>
      </div>

      <div className="card-body p-4">
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Full Name *</label>
            <input
              type="text"
              className="form-control"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Primary Phone *</label>
            <div className="input-group">
              <span className="input-group-text bg-white">
                <i className="ti ti-phone text-muted"></i>
              </span>
              <input
                type="tel"
                className="form-control"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Alternate Phone</label>
            <div className="input-group">
              <span className="input-group-text bg-white">
                <i className="ti ti-device-mobile text-muted"></i>
              </span>
              <input
                type="tel"
                className="form-control"
                value={form.phoneSecondary}
                onChange={(e) => update("phoneSecondary", e.target.value)}
              />
            </div>
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Email Address</label>
            <div className="input-group">
              <span className="input-group-text bg-white">
                <i className="ti ti-mail text-muted"></i>
              </span>
              <input
                type="email"
                className="form-control"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>
          </div>

          <div className="col-12">
            <label className="form-label fw-medium small">Address *</label>
            <textarea
              className="form-control"
              rows={2}
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
            />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Customer Type</label>
            <div className="btn-group w-100">
              {CUSTOMER_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  className={`btn ${form.customerType === t ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => update("customerType", t)}
                >
                  {CUSTOMER_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
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
          disabled={saving || !canSubmit}
        >
          {saving ? "Saving Changes…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
