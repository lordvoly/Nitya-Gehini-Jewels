import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil } from "lucide-react";
import { fetchCustomer, fetchCustomerRevenue, CUSTOMER_TYPE_LABELS, type Customer, type CustomerRevenue } from "../../lib/customers";
import { BookingsList } from "../bookings/BookingsList";
import { BookingDetailSkeleton } from "../common/Skeleton";
import { useSlowLoadHint } from "../../lib/useSlowLoadHint";

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
  const [revenue, setRevenue] = useState<CustomerRevenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const showSlowHint = useSlowLoadHint(loading);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchCustomer(customerId), fetchCustomerRevenue(customerId)])
      .then(([c, r]) => {
        if (!cancelled) {
          setCustomer(c);
          setRevenue(r);
        }
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
        {loading && <BookingDetailSkeleton />}
        {loading && showSlowHint && (
          <p className="wizard-hint slow-load-hint">
            Still loading. The server may be waking up after a period of inactivity, which can take up to a minute.
          </p>
        )}
        {!loading && <h2>{customer?.name ?? "Customer not found"}</h2>}
        {!loading && error && <p className="wizard-error">{error}</p>}

        {!loading && customer && (
          <ul className="review-list">
            <li>Phone: {customer.phone}</li>
            {customer.phone_secondary && <li>Alternate Phone: {customer.phone_secondary}</li>}
            <li>Email: {customer.email ?? "—"}</li>
            <li>Address: {customer.address}</li>
            <li>Type: {CUSTOMER_TYPE_LABELS[customer.customer_type]}</li>
            {/* Total agreed value across every one of their bookings,
                all-time — not cash actually collected (see
                CustomerRevenue's own doc comment), same "earned" figure
                Item Detail's own Total Earnings shows for one item. */}
            <li>
              <strong>Total Business: ₹{revenue?.total_business ?? 0}</strong>
            </li>
            {customer.notes && <li>Notes: {customer.notes}</li>}
          </ul>
        )}

        {!loading && (
          <div className="wizard-nav">
            <button className="btn-icon" aria-label="Back" onClick={onBack}>
              <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
            </button>
            {customer && (
              <button className="btn-icon" aria-label="Edit" onClick={() => onEdit(customer)}>
                <Pencil size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {!loading && customer && (
        <div className="wizard-step">
          {/* No heading here — BookingsList renders its own "Bookings (N)"
              once filterCustomerId is set, so a second static heading right
              above it was pure duplication. */}
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
