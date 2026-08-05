import { useState } from "react";
import { AddCustomerForm } from "../components/customers/AddCustomerForm";
import { CustomersList } from "../components/customers/CustomersList";
import type { Customer } from "../lib/customers";
import "../styles/shared.css";

export default function CustomersPage() {
  const [view, setView] = useState<"add" | "list">("add");
  const [result, setResult] = useState<{ customer: Customer; wasExisting: boolean } | null>(null);

  return (
    <div className="page">
      <div className="page-tabs">
        <button
          className={view === "add" ? "tab active" : "tab"}
          onClick={() => {
            setResult(null);
            setView("add");
          }}
        >
          + Add Customer
        </button>
        <button
          className={view === "list" ? "tab active" : "tab"}
          onClick={() => {
            setResult(null);
            setView("list");
          }}
        >
          All Customers
        </button>
      </div>

      {view === "add" ? (
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
        <CustomersList />
      )}
    </div>
  );
}
