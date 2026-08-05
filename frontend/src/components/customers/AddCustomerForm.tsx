import { useState, type FormEvent } from "react";
import { createCustomer, type Customer } from "../../lib/customers";

// Deliberately self-contained (no page-level state, no routing) so it can be
// dropped into a modal from the future booking screen — "create or find a
// customer without leaving the booking" — as well as used as its own page.
export function AddCustomerForm({
  onCustomerReady,
  onCancel,
}: {
  onCustomerReady: (customer: Customer, wasExisting: boolean) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Customer | null>(null);

  const canSubmit = name.trim().length > 0 && phone.trim().length > 0 && address.trim().length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaving(true);
    try {
      const result = await createCustomer({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        address: address.trim(),
        notes: notes.trim() || null,
      });
      if (result.type === "created") {
        onCustomerReady(result.customer, false);
      } else {
        setDuplicate(result.existingCustomer);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save customer");
    } finally {
      setSaving(false);
    }
  }

  if (duplicate) {
    return (
      <div className="found-panel">
        <p>
          <strong>A customer with this phone number already exists:</strong>
        </p>
        <p>
          {duplicate.name} — {duplicate.phone}
        </p>
        {duplicate.email && <p>{duplicate.email}</p>}
        <p>{duplicate.address}</p>
        <div className="wizard-actions">
          <button className="btn-primary" onClick={() => onCustomerReady(duplicate, true)}>
            Use This Customer
          </button>
          <button className="btn-secondary" onClick={() => setDuplicate(null)}>
            Edit Details Instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="wizard-card" onSubmit={handleSubmit}>
      <div className="wizard-step">
        <h2>Add Customer</h2>
        <label className="field-label">
          Name
          <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field-label">
          Phone
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 98765 43210"
          />
        </label>
        <label className="field-label">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
        </label>
        <label className="field-label">
          Address
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
        </label>
        <label className="field-label">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
        </label>
        {error && <p className="wizard-error">{error}</p>}
      </div>
      <div className="wizard-nav">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={!canSubmit || saving}>
          {saving ? "Saving…" : "Save Customer"}
        </button>
      </div>
    </form>
  );
}
