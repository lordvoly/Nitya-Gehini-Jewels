import { useState, type FormEvent } from "react";
import { CUSTOMER_TYPE_LABELS, CUSTOMER_TYPES, createCustomer, type Customer, type CustomerType } from "../../lib/customers";

export function AddCustomerForm({
  onCustomerReady,
  onCancel,
}: {
  onCustomerReady: (customer: Customer, wasExisting: boolean) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneSecondary, setPhoneSecondary] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [customerType, setCustomerType] = useState<CustomerType>("regular");
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
        phone_secondary: phoneSecondary.trim() || null,
        email: email.trim() || null,
        address: address.trim(),
        notes: notes.trim() || null,
        customer_type: customerType,
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
      <div className="card border-0 shadow-sm p-4 border-warning">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="avatar avatar-md rounded-circle bg-warning-subtle text-warning d-flex align-items-center justify-content-center">
            <i className="ti ti-alert-triangle fs-3"></i>
          </div>
          <div>
            <h5 className="fw-bold text-dark mb-0">Customer Already Exists</h5>
            <span className="text-muted small">A record with this phone number was found in the database.</span>
          </div>
        </div>

        <div className="p-3 bg-light rounded border mb-3">
          <div className="fw-bold text-dark fs-6">{duplicate.name}</div>
          <div className="text-muted small">
            Phone: {duplicate.phone} {duplicate.email ? `| Email: ${duplicate.email}` : ""}
          </div>
          <div className="text-muted small mt-1">Address: {duplicate.address}</div>
        </div>

        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setDuplicate(null)}>
            Edit Details Instead
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onCustomerReady(duplicate, true)}>
            Use Existing Customer
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="card border-0 shadow-sm" onSubmit={handleSubmit}>
      <div className="card-header bg-white p-4 border-bottom">
        <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
          <i className="ti ti-user-plus text-primary"></i> Add New Customer
        </h5>
      </div>

      <div className="card-body p-4">
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Full Name *</label>
            <input
              type="text"
              className="form-control"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ananya Sharma"
              required
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
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                required
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
                value={phoneSecondary}
                onChange={(e) => setPhoneSecondary(e.target.value)}
                placeholder="Optional secondary contact"
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ananya@example.com"
              />
            </div>
          </div>

          <div className="col-12">
            <label className="form-label fw-medium small">Residential Address *</label>
            <textarea
              className="form-control"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder="Complete home/billing address"
              required
            />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label fw-medium small">Customer Classification</label>
            <div className="btn-group w-100">
              {CUSTOMER_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  className={`btn ${customerType === t ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setCustomerType(t)}
                >
                  {CUSTOMER_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="col-12">
            <label className="form-label fw-medium small">Notes & Special Requirements</label>
            <textarea
              className="form-control"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes regarding preferences, trust level, past orders..."
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
        {onCancel && (
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="btn btn-primary fw-semibold px-4"
          disabled={!canSubmit || saving}
        >
          {saving ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status"></span> Saving Customer…
            </>
          ) : (
            <>
              <i className="ti ti-check me-1"></i> Save Customer
            </>
          )}
        </button>
      </div>
    </form>
  );
}
