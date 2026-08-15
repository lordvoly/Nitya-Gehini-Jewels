import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCustomer, CUSTOMER_TYPE_LABELS, type Customer } from "../../lib/customers";
import { BookingsList } from "../bookings/BookingsList";

// Minimal by design: this customer's own fields, plus their booking
// history reusing BookingsList's own card rendering (readOnly — no
// Process Return / Edit Booking here, just view + link out to the real
// BookingDetail, so nothing about a booking is duplicated on this page).
export function CustomerDetail({
  customerId,
  onBack,
  onEdit,
}: {
  customerId: string;
  onBack: () => void;
  onEdit: (customer: Customer) => void;
}) {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCustomer(customerId)
      .then((c) => {
        if (!cancelled) setCustomer(c);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load customer");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return (
    <div className="wizard-card">
      <div className="wizard-step">
        <h2>{loading ? "Loading…" : customer?.name ?? "Customer not found"}</h2>
        {error && <p className="wizard-error">{error}</p>}

        {customer && (
          <>
            <ul className="review-list">
              <li>Phone: {customer.phone}</li>
              {customer.phone_secondary && <li>Alternate Phone: {customer.phone_secondary}</li>}
              <li>Email: {customer.email ?? "—"}</li>
              <li>Address: {customer.address}</li>
              <li>Type: {CUSTOMER_TYPE_LABELS[customer.customer_type]}</li>
              {customer.notes && <li>Notes: {customer.notes}</li>}
            </ul>

            <div className="wizard-nav">
              <button className="btn-secondary" onClick={onBack}>
                Back
              </button>
              <button className="btn-primary" onClick={() => onEdit(customer)}>
                Edit
              </button>
            </div>
          </>
        )}
      </div>

      {customer && (
        <div className="wizard-step">
          <h2>Bookings</h2>
          <BookingsList
            filterCustomerId={customerId}
            readOnly
            onViewDetail={(bookingId) => navigate(`/bookings?booking=${bookingId}`)}
          />
        </div>
      )}
    </div>
  );
}
