import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AddCustomerForm } from "../components/customers/AddCustomerForm";
import { CustomerDetail } from "../components/customers/CustomerDetail";
import { CustomerEditForm } from "../components/customers/CustomerEditForm";
import { CustomersList } from "../components/customers/CustomersList";
import type { Customer } from "../lib/customers";
import "../styles/shared.css";

export default function CustomersPage() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<"add" | "list">("list");
  const [result, setResult] = useState<{ customer: Customer; wasExisting: boolean } | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomerId, setViewingCustomerId] = useState<string | null>(null);

  // Deep link from elsewhere (e.g. a customer's name on BookingDetail or a
  // BookingsList card): /customers?customer=<id>. Read once on mount, same
  // pattern as BookingsPage's ?booking=/?item=.
  useEffect(() => {
    const id = searchParams.get("customer");
    if (id) setViewingCustomerId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetToTab(next: "add" | "list") {
    setResult(null);
    setEditingCustomer(null);
    setViewingCustomerId(null);
    setView(next);
  }

  return (
    <div className="page">
      <div className="page-tabs">
        <button
          className={view === "add" && !editingCustomer && !viewingCustomerId ? "tab active" : "tab"}
          onClick={() => resetToTab("add")}
        >
          + Add Customer
        </button>
        <button
          className={view === "list" || editingCustomer || viewingCustomerId ? "tab active" : "tab"}
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
      ) : viewingCustomerId ? (
        <CustomerDetail
          customerId={viewingCustomerId}
          onBack={() => setViewingCustomerId(null)}
          onEdit={setEditingCustomer}
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
        <CustomersList onEdit={setEditingCustomer} onView={(c) => setViewingCustomerId(c.id)} />
      )}
    </div>
  );
}
