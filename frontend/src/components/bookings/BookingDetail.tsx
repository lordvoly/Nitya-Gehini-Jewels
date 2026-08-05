import { useEffect, useState } from "react";
import { fetchBooking, type BookingDetail as BookingDetailData } from "../../lib/bookings";

export function BookingDetail({ bookingId, onBack }: { bookingId: string; onBack: () => void }) {
  const [booking, setBooking] = useState<BookingDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchBooking(bookingId)
      .then(setBooking)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load booking"))
      .finally(() => setLoading(false));
  }, [bookingId]);

  return (
    <div className="wizard-card">
      <div className="wizard-step">
        <h2>{loading ? "Loading…" : booking?.booking_code}</h2>
        {error && <p className="wizard-error">{error}</p>}
        {booking && (
          <>
            <p className="wizard-hint">
              {booking.items?.item_code} — {booking.items?.name} · {booking.customers?.name}
            </p>
            <ul className="review-list">
              <li>Type: {booking.type}</li>
              <li>Status: {booking.status}</li>
              <li>
                Dates: {booking.pickup_date}
                {booking.return_date ? ` → ${booking.return_date}` : ""}
              </li>
              <li>Price charged: ₹{booking.price_charged}</li>
            </ul>

            {/* Only meaningful for a unique item — there's a real physical
                hand-off between consecutive bookings. A quantity item can
                have many bookings active at once, so "next in line" isn't a
                single well-defined thing there. */}
            {booking.items?.tracking_type === "unique" && booking.next_booking && (
              <div className="found-panel">
                <p>
                  <strong>When Returns →</strong> {booking.next_booking.booking_code} —{" "}
                  {booking.next_booking.customer_name} ({booking.next_booking.pickup_date})
                </p>
              </div>
            )}
          </>
        )}
      </div>
      <div className="wizard-nav">
        <button className="btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
