import { useState } from "react";
import { AddCustomerForm } from "../components/customers/AddCustomerForm";
import { CustomerEditForm } from "../components/customers/CustomerEditForm";
import { CustomersList } from "../components/customers/CustomersList";
import type { Customer } from "../lib/customers";
import "../styles/shared.css";

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
    <div className="page">
      <div className="page-tabs">
        <button
          className={view === "add" && !editingCustomer ? "tab active" : "tab"}
          onClick={() => resetToTab("add")}
        >
          + Add Customer
        </button>
        <button
          className={view === "list" || editingCustomer ? "tab active" : "tab"}
          onClick={() => resetToTab("list")}
        >
          All Customers
        </button>
      </div>

      {editingCustomer ? (
        <CustomerEditForm
          customer={editingCustomer}
          onCancel={() => setEditingCustomer(null)}
          onSaved={() => setEditingCustomer(null)}
        />
      ) : view === "add" ? (
        result ? (
          <div className="wizard-card wizard-success">
            <p className="success-check">{result.wasExisting ? "✓ Found existing customer" : "✓ Saved"}</p>
            <p className="success-code">{result.customer.name}</p>
            <p>{result.customer.phone}</p>
            <div className="wizard-actions">
              <button className="btn-primary" onClick={() => setResult(null)}>
                Add Another
              </button>
              <button className="btn-secondary" onClick={() => setView("list")}>
                View All Customers
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
