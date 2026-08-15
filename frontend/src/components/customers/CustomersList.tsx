import { useEffect, useState } from "react";
import { CUSTOMER_TYPE_LABELS, deleteCustomer, fetchCustomers, type Customer } from "../../lib/customers";

export function CustomersList({
  onEdit,
  onView,
}: {
  onEdit: (customer: Customer) => void;
  onView: (customer: Customer) => void;
}) {
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
          // A newer search may have started (and possibly already resolved)
          // while this request was in flight — an older response landing
          // late must not clobber the newer results.
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
    <div>
      <input
        className="search-input"
        type="text"
        placeholder="Search by name or phone…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <div className="list-header">
        <h2>{term ? `Results (${customers.length})` : `All Customers (${customers.length})`}</h2>
        {loading && <span className="wizard-hint">Searching…</span>}
      </div>

      {actionError && <p className="wizard-error">{actionError}</p>}

      {customers.length === 0 && !loading && (
        <div className="empty-state">
          {term ? (
            <>
              <h3>No matches</h3>
              <p>Nobody found for "{term}" — check the spelling or try just the phone number.</p>
            </>
          ) : (
            <>
              <h3>No customers yet</h3>
              <p>Add your first customer, or create one while booking.</p>
            </>
          )}
        </div>
      )}

      {customers.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td data-label="Name">
                    <button type="button" className="link-button" onClick={() => onView(c)}>
                      {c.name}
                    </button>
                  </td>
                  <td data-label="Phone">{c.phone}</td>
                  <td data-label="Email">{c.email ?? "—"}</td>
                  <td data-label="Address">{c.address}</td>
                  <td data-label="Type">{CUSTOMER_TYPE_LABELS[c.customer_type]}</td>
                  <td className="row-actions">
                    {confirmingId === c.id ? (
                      <>
                        <span>Delete this customer?</span>
                        <button
                          className="btn-danger"
                          onClick={() => confirmDelete(c)}
                          disabled={deletingId === c.id}
                        >
                          {deletingId === c.id ? "…" : "Yes, Delete"}
                        </button>
                        <button className="btn-secondary" onClick={() => setConfirmingId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-secondary" onClick={() => onEdit(c)}>
                          Edit
                        </button>
                        <button className="btn-danger" onClick={() => setConfirmingId(c.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
