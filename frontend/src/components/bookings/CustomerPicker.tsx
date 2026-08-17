import { useEffect, useState } from "react";
import { AddCustomerForm } from "../customers/AddCustomerForm";
import { Modal } from "../common/Modal";
import { fetchCustomers, type Customer } from "../../lib/customers";

// Search-first: look the customer up by phone/name before ever offering to
// create a new one, since phone dedupe only helps if the operator actually
// searches first rather than reflexively adding a new record.
export function CustomerPicker({
  selected,
  onSelect,
}: {
  selected: Customer | null;
  onSelect: (customer: Customer | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      fetchCustomers({ search: term }).then((data) => {
        if (!cancelled) setResults(data);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [term]);

  if (selected) {
    return (
      <div className="found-panel">
        <p>
          <strong>{selected.name}</strong> — {selected.phone}
        </p>
        <button type="button" className="btn-secondary" onClick={() => onSelect(null)}>
          Change Customer
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        className="search-input"
        type="text"
        placeholder="Search customer by name or phone…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      {results.length > 0 && (
        <div className="option-list">
          {results.map((c) => (
            <button type="button" key={c.id} className="toggle-btn" onClick={() => onSelect(c)}>
              {c.name} — {c.phone}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="btn-secondary" onClick={() => setShowAddModal(true)}>
        + Add New Customer
      </button>
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)}>
          <AddCustomerForm
            onCustomerReady={(customer) => {
              onSelect(customer);
              setShowAddModal(false);
            }}
            onCancel={() => setShowAddModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}
