import { useCallback, useEffect, useState } from "react";
import { fetchBookings, type Booking, type BookingItem } from "../../lib/bookings";
import { bookingItemStatusPill, bookingComputedStatusPill } from "../../lib/statusPill";
import { formatDateDisplay } from "../../lib/dates";

// One card per family transaction — a flat table row can't express "one
// booking, several items on independent schedules," which is the whole
// point of this schema (§8). Items and Customers keep the shared
// .data-table pattern; this is the one list that doesn't.
export function BookingsList({
  onProcessReturn,
  onViewDetail,
  onEditBooking,
}: {
  onProcessReturn: (booking: Booking, item: BookingItem) => void;
  onViewDetail: (bookingId: string) => void;
  onEditBooking: (bookingId: string) => void;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBookings(await fetchBookings());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <div className="list-header">
        <h2>All Bookings ({bookings.length})</h2>
        <button className="btn-secondary" onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {bookings.length === 0 && !loading && (
        <div className="empty-state">
          <h3>No bookings yet</h3>
          <p>Create your first rental or sale to see it here.</p>
        </div>
      )}

      {bookings.map((b) => {
        const statusPill = bookingComputedStatusPill(b.computed_status, b.resolved_item_count, b.active_item_count);
        return (
          <div className="booking-card" key={b.id}>
            <div className="booking-card-header">
              <div>
                <p className="booking-card-title">{b.booking_code}</p>
                <p className="booking-card-customer">{b.customers?.name ?? "—"}</p>
              </div>
              <div className="booking-card-status">
                <span className={`pill ${statusPill.className}`}>{statusPill.label}</span>
                {statusPill.fraction && <span className="status-fraction">{statusPill.fraction}</span>}
              </div>
            </div>

            <div className="booking-card-financials">
              <span>
                Paid: <strong>₹{b.total_paid}</strong>
              </span>
              <span>
                Balance: <strong>₹{b.balance_due}</strong>
              </span>
            </div>

            <div className="booking-card-items">
              {b.booking_items.map((bi) => {
                const itemPill = bookingItemStatusPill(bi.status);
                const canReturn = bi.type === "rental" && (bi.status === "booked" || bi.status === "out");
                return (
                  <div className="booking-card-item" key={bi.id}>
                    <div className="booking-card-item-info">
                      <strong>
                        {bi.items?.item_code} — {bi.items?.name}
                      </strong>
                      <span>
                        {bi.type === "rental" ? "Rental" : "Sale"} · {formatDateDisplay(bi.pickup_date)}
                        {bi.return_date ? ` → ${formatDateDisplay(bi.return_date)}` : ""}
                      </span>
                      {bi.items?.tracking_type === "unique" &&
                        (bi.future_booking_items && bi.future_booking_items.length > 0 ? (
                          <button
                            type="button"
                            className="booking-card-item-next booking-card-item-next-link"
                            onClick={() => onViewDetail(bi.future_booking_items![0].booking_id!)}
                          >
                            Next: {bi.future_booking_items[0].booking_code} —{" "}
                            {bi.future_booking_items[0].customer_name ?? "—"}, {formatDateDisplay(bi.future_booking_items[0].pickup_date)}
                          </button>
                        ) : (
                          <span className="booking-card-item-next">No bookings ahead</span>
                        ))}
                    </div>
                    <div className="booking-card-item-actions">
                      <span className={`pill ${itemPill.className}`}>{itemPill.label}</span>
                      {canReturn && (
                        <button className="btn-secondary" onClick={() => onProcessReturn(b, bi)}>
                          Process Return
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="booking-card-actions">
              <button className="btn-secondary" onClick={() => onViewDetail(b.id)}>
                View
              </button>
              <button className="btn-secondary" onClick={() => onEditBooking(b.id)}>
                Edit
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
