import { useState } from "react";
import { AddCustomerForm } from "../components/customers/AddCustomerForm";
import { CustomerEditForm } from "../components/customers/CustomerEditForm";
import { CustomersList } from "../components/customers/CustomersList";
import type { Customer } from "../lib/customers";

export default function CustomersPage() {
  const [view, setView] = useState<"add" | "list">("list");
  const [result, setResult] = useState<{ customer: Customer; wasExisting: boolean } | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  function resetToTab(next: "add" | "list") {
    setResult(null);
    setEditingCustomer(null);
    setView(next);
  }

  return (
    <div className="container-fluid p-0">
      {/* Page Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="h3 mb-1 fw-semibold text-dark">Customer Directory</h1>
          <p className="text-muted mb-0 small">Manage customer contacts, verification records, and notes</p>
        </div>
        <div className="d-flex gap-2">
          {view === "list" && !editingCustomer ? (
            <button className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={() => resetToTab("add")}>
              <i className="ti ti-user-plus"></i> Add Customer
            </button>
          ) : (
            <button className="btn btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => resetToTab("list")}>
              <i className="ti ti-arrow-left"></i> View All Customers
            </button>
          )}
        </div>
      </div>

      {/* Nav Pills */}
      <ul className="nav nav-pills mb-4 bg-white p-2 rounded-3 border shadow-sm" style={{ maxWidth: 350 }}>
        <li className="nav-item flex-fill text-center">
          <button
            className={`nav-link w-100 fw-medium ${view === "list" || editingCustomer ? "active" : ""}`}
            onClick={() => resetToTab("list")}
          >
            <i className="ti ti-users me-1"></i> All Customers
          </button>
        </li>
        <li className="nav-item flex-fill text-center">
          <button
            className={`nav-link w-100 fw-medium ${view === "add" && !editingCustomer ? "active" : ""}`}
            onClick={() => resetToTab("add")}
          >
            <i className="ti ti-user-plus me-1"></i> Add Customer
          </button>
        </li>
      </ul>

      {/* Body Content */}
      {editingCustomer ? (
        <CustomerEditForm
          customer={editingCustomer}
          onCancel={() => setEditingCustomer(null)}
          onSaved={() => setEditingCustomer(null)}
        />
      ) : view === "add" ? (
        result ? (
          <div className="card border-0 shadow-sm text-center p-5">
            <div className="avatar avatar-xl rounded-circle bg-success-subtle text-success mx-auto d-flex align-items-center justify-content-center mb-3">
              <i className="ti ti-check fs-1"></i>
            </div>
            <h4 className="fw-bold text-dark mb-1">
              {result.wasExisting ? "Found Existing Customer" : "Customer Saved Successfully!"}
            </h4>
            <p className="text-muted mb-1 fs-5 fw-semibold">{result.customer.name}</p>
            <p className="text-muted small mb-4">{result.customer.phone}</p>
            <div className="d-flex justify-content-center gap-2">
              <button className="btn btn-primary" onClick={() => setResult(null)}>
                <i className="ti ti-plus me-1"></i> Add Another Customer
              </button>
              <button className="btn btn-outline-secondary" onClick={() => setView("list")}>
                <i className="ti ti-users me-1"></i> View All Customers
              </button>
            </div>
          </div>
        ) : (
          <AddCustomerForm onCustomerReady={(customer, wasExisting) => setResult({ customer, wasExisting })} />
        )
      ) : (
        <CustomersList onEdit={setEditingCustomer} />
      )}
    </div>
  );
}
