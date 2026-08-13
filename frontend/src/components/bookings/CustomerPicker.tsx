import { useEffect, useState } from "react";
import { AddCustomerForm } from "../customers/AddCustomerForm";
import { Modal } from "../common/Modal";
import { fetchCustomers, type Customer } from "../../lib/customers";

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
      fetchCustomers(term).then((data) => {
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
      <div className="p-3 bg-light rounded border d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-3">
          <div className="avatar avatar-md rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center">
            {selected.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h6 className="mb-0 fw-bold text-dark">{selected.name}</h6>
            <span className="text-muted small">
              <i className="ti ti-phone me-1"></i>
              {selected.phone}
            </span>
          </div>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onSelect(null)}>
          <i className="ti ti-refresh me-1"></i> Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="input-group mb-2">
        <span className="input-group-text bg-white">
          <i className="ti ti-search text-muted"></i>
        </span>
        <input
          className="form-control"
          type="text"
          placeholder="Search customer by name or phone…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {results.length > 0 && (
        <div className="list-group mb-3 shadow-sm border">
          {results.map((c) => (
            <button
              type="button"
              key={c.id}
              className="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2"
              onClick={() => onSelect(c)}
            >
              <div>
                <strong className="text-dark me-2">{c.name}</strong>
                <span className="text-muted small">{c.phone}</span>
              </div>
              <i className="ti ti-chevron-right text-muted fs-7"></i>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1 mt-1"
        onClick={() => setShowAddModal(true)}
      >
        <i className="ti ti-user-plus"></i> Add New Customer
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
