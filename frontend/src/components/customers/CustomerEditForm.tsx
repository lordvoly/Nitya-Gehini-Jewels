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
    dateOfBirth: customer.date_of_birth ?? "",
    dateOfWedding: customer.date_of_wedding ?? "",
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
        date_of_birth: form.dateOfBirth || null,
        date_of_wedding: form.dateOfWedding || null,
      });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wizard-card">
      <p className="wizard-progress">Editing {customer.name}</p>
      <div className="wizard-step">
        <h2>Edit Customer</h2>
        <label className="field-label">
          Name
          <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} />
        </label>
        <label className="field-label">
          Phone
          <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        </label>
        <label className="field-label">
          Alternate Phone
          <input
            type="tel"
            value={form.phoneSecondary}
            onChange={(e) => update("phoneSecondary", e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="field-label">
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="field-label">
          Address
          <textarea value={form.address} onChange={(e) => update("address", e.target.value)} rows={2} />
        </label>
        <p className="field-label">Customer Type</p>
        <div className="toggle-group">
          {CUSTOMER_TYPES.map((t) => (
            <button
              type="button"
              key={t}
              className={form.customerType === t ? "toggle-btn active" : "toggle-btn"}
              onClick={() => update("customerType", t)}
            >
              {CUSTOMER_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <label className="field-label">
          Date of Birth
          <input type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} />
        </label>
        <label className="field-label">
          Wedding Date
          <input type="date" value={form.dateOfWedding} onChange={(e) => update("dateOfWedding", e.target.value)} />
        </label>
        <label className="field-label">
          Notes
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={2}
            placeholder="Optional"
          />
        </label>
        {error && <p className="wizard-error">{error}</p>}
      </div>
      <div className="wizard-nav">
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || !canSubmit}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
