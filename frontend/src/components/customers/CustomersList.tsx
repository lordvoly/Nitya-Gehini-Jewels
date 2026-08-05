import { useEffect, useState } from "react";
import { fetchCustomers, type Customer } from "../../lib/customers";

export function CustomersList() {
  const [term, setTerm] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

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
      {customers.length === 0 && !loading && <p>No customers found.</p>}
      {customers.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.email ?? "—"}</td>
                  <td>{c.address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
