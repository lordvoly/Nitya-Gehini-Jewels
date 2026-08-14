import { useEffect, useState } from "react";
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
  filterItemId = null,
  onClearItemFilter,
}: {
  onProcessReturn: (booking: Booking, item: BookingItem) => void;
  onViewDetail: (bookingId: string) => void;
  onEditBooking: (bookingId: string) => void;
  // Deep link from the Items list's "Out"/"Booked" badges: show only this
  // item's currently active bookings (the ones actually behind that badge),
  // not its full history. See BookingsPage's ?item=<id> handling.
  filterItemId?: string | null;
  onClearItemFilter?: () => void;
}) {
  const [term, setTerm] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  // Same debounced, cancelled-flag-guarded search as CustomersList: a
  // 300ms pause before the request fires, and a newer search's response
  // can't be clobbered by an older one landing late. When filterItemId is
  // set, search is bypassed entirely — the item filter takes over.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(
      () => {
        const params = filterItemId ? { item_id: filterItemId } : term ? { search: term } : undefined;
        fetchBookings(params)
          .then((data) => {
            if (cancelled) return;
            // The backend filter returns every booking that has ever
            // included this item, any status — narrow to the ones actually
            // still active for this item, matching what the badge meant.
            const filtered = filterItemId
              ? data.filter((b) =>
                  b.booking_items.some(
                    (bi) => bi.item_id === filterItemId && (bi.status === "booked" || bi.status === "out"),
                  ),
                )
              : data;
            setBookings(filtered);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      filterItemId ? 0 : 300,
    );
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [term, filterItemId]);

  return (
    <div>
      {filterItemId ? (
        <div className="found-panel">
          <p>
            Showing this item's current bookings only.{" "}
            <button type="button" className="btn-secondary" onClick={onClearItemFilter}>
              Show All Bookings
            </button>
          </p>
        </div>
      ) : (
        <input
          className="search-input"
          type="text"
          placeholder="Search by booking code or customer…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      )}
      <div className="list-header">
        <h2>
          {filterItemId
            ? `Current Bookings (${bookings.length})`
            : term
              ? `Results (${bookings.length})`
              : `All Bookings (${bookings.length})`}
        </h2>
        {loading && <span className="wizard-hint">{filterItemId ? "Loading…" : "Searching…"}</span>}
      </div>

      {bookings.length === 0 && !loading && (
        <div className="empty-state">
          {filterItemId ? (
            <>
              <h3>Nothing currently booked</h3>
              <p>This item has no active bookings right now.</p>
            </>
          ) : term ? (
            <>
              <h3>No bookings match</h3>
              <p>Nothing found for "{term}" — check the spelling or try just the booking code.</p>
            </>
          ) : (
            <>
              <h3>No bookings yet</h3>
              <p>Create your first rental or sale to see it here.</p>
            </>
          )}
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
