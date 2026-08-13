import { useEffect, useState } from "react";
import { CUSTOMER_TYPE_LABELS, deleteCustomer, fetchCustomers, type Customer } from "../../lib/customers";

export function CustomersList({ onEdit }: { onEdit: (customer: Customer) => void }) {
  const [term, setTerm] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      fetchCustomers(term)
        .then((data) => {
          if (!cancelled) setCustomers(data);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [term]);

  async function confirmDelete(customer: Customer) {
    setDeletingId(customer.id);
    setActionError(null);
    try {
      await deleteCustomer(customer.id);
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      setConfirmingId(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete customer");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="card border-0 shadow-sm">
      {/* Search Header */}
      <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div className="input-group" style={{ maxWidth: 360 }}>
          <span className="input-group-text bg-white border-end-0 text-muted">
            <i className="ti ti-search fs-5"></i>
          </span>
          <input
            className="form-control border-start-0 ps-0"
            type="text"
            placeholder="Search by name or phone…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <div className="text-muted small">
          {loading ? (
            <span className="d-flex align-items-center gap-1">
              <span className="spinner-border spinner-border-sm text-primary" role="status"></span> Searching…
            </span>
          ) : (
            <span>
              Total: <strong>{customers.length}</strong> customer{customers.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {actionError && (
        <div className="alert alert-danger m-3 py-2 px-3 small">
          <i className="ti ti-alert-circle me-1"></i> {actionError}
        </div>
      )}

      {/* Customers Table */}
      <div className="table-responsive">
        {customers.length === 0 && !loading ? (
          <div className="text-center py-5 text-muted">
            <i className="ti ti-users-minus fs-1 text-muted d-block mb-2"></i>
            {term ? (
              <>
                <h5 className="fw-semibold text-dark mb-1">No matches found</h5>
                <p className="small mb-0">Nobody found for "{term}" — check spelling or phone number.</p>
              </>
            ) : (
              <>
                <h5 className="fw-semibold text-dark mb-1">No customers registered yet</h5>
                <p className="small mb-0">Add your first customer to start tracking rentals and bookings.</p>
              </>
            )}
          </div>
        ) : (
          <table className="table align-middle text-nowrap table-hover mb-0">
            <thead className="table-light border-light">
              <tr className="small text-uppercase text-muted fw-semibold">
                <th>Customer</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
                <th>Type</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const initials = c.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <tr key={c.id}>
                    <td>
                      <div className="d-flex align-items-center gap-3">
                        <div className="avatar avatar-md rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center">
                          {initials || "CU"}
                        </div>
                        <div>
                          <h6 className="mb-0 fw-semibold text-dark">{c.name}</h6>
                          {c.phone_secondary && (
                            <span className="text-muted fs-7">
                              Alt Phone: {c.phone_secondary}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="fw-medium text-dark">
                      <i className="ti ti-phone text-muted me-1 fs-7"></i>
                      {c.phone}
                    </td>
                    <td className="text-muted">
                      {c.email ? (
                        <>
                          <i className="ti ti-mail text-muted me-1 fs-7"></i>
                          {c.email}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-muted">
                      <span className="d-inline-block text-truncate" style={{ maxWidth: 200 }}>
                        {c.address || "—"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge rounded-pill px-2 py-1 fs-7 ${
                          c.customer_type === "influencer" || c.customer_type === "mua"
                            ? "bg-warning-subtle text-warning border"
                            : "bg-light text-dark border"
                        }`}
                      >
                        {CUSTOMER_TYPE_LABELS[c.customer_type]}
                      </span>
                    </td>
                    <td className="text-end">
                      {confirmingId === c.id ? (
                        <div className="d-flex align-items-center justify-content-end gap-1">
                          <span className="small text-danger me-1">Delete customer?</span>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => confirmDelete(c)}
                            disabled={deletingId === c.id}
                          >
                            {deletingId === c.id ? "…" : "Yes"}
                          </button>
                          <button className="btn btn-light btn-sm" onClick={() => setConfirmingId(null)}>
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="d-flex align-items-center justify-content-end gap-1">
                          <button
                            type="button"
                            className="btn btn-light btn-icon btn-sm text-primary"
                            onClick={() => onEdit(c)}
                            title="Edit Customer"
                          >
                            <i className="ti ti-edit fs-5"></i>
                          </button>
                          <button
                            type="button"
                            className="btn btn-light btn-icon btn-sm text-danger"
                            onClick={() => setConfirmingId(c.id)}
                            title="Delete Customer"
                          >
                            <i className="ti ti-trash fs-5"></i>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
