import { useCallback, useEffect, useState } from "react";
import { fetchBookings, type BookingWithDetails } from "../../lib/bookings";

export function BookingsList({ onProcessReturn }: { onProcessReturn: (booking: BookingWithDetails) => void }) {
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
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
      {bookings.length === 0 && !loading && <p>No bookings yet.</p>}
      {bookings.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Type</th>
                <th>Item</th>
                <th>Customer</th>
                <th>Dates</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.booking_code}</td>
                  <td>{b.type}</td>
                  <td>{b.items ? `${b.items.item_code} — ${b.items.name}` : "—"}</td>
                  <td>{b.customers?.name ?? "—"}</td>
                  <td>
                    {b.pickup_date}
                    {b.return_date ? ` → ${b.return_date}` : ""}
                  </td>
                  <td>{b.status}</td>
                  <td>
                    {b.type === "rental" && (b.status === "booked" || b.status === "out") && (
                      <button className="btn-secondary" onClick={() => onProcessReturn(b)}>
                        Process Return
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
