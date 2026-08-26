import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { fetchItem, fetchItemHistory, fetchItemRevenue, deleteItem, type Item, type ItemHistoryRow, type ItemRevenue } from "../lib/items";
import { PhotoLightbox } from "../components/items/PhotoLightbox";
import { itemStatusPill, bookingItemStatusPill } from "../lib/statusPill";
import { formatDateDisplay } from "../lib/dates";
import { useSlowLoadHint } from "../lib/useSlowLoadHint";
import { ItemDetailSkeleton } from "../components/common/Skeleton";
import "../styles/shared.css";

// A real route (/items/:id), not a query-param-embedded view like
// CustomerDetail/BookingDetail — this page is reached from more than one
// context (the Items list, and now every booking-item row's thumbnail/name
// via BookingDetail), so it needs a real, linkable URL rather than a tab
// swap within ItemsPage. "Back" uses browser history rather than a fixed
// destination for the same reason — there's no single "came from" page.
export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<Item | null>(null);
  const [history, setHistory] = useState<ItemHistoryRow[]>([]);
  const [revenue, setRevenue] = useState<ItemRevenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchItem(id), fetchItemHistory(id), fetchItemRevenue(id)])
      .then(([i, h, r]) => {
        if (cancelled) return;
        setItem(i);
        setHistory(h);
        setRevenue(r);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load item");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const showSlowHint = useSlowLoadHint(loading);

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteItem(id);
      // The item no longer exists to show — same "nothing left to stay
      // on" reasoning as ItemsPage's own list-row delete, just navigating
      // away instead of filtering a row out of a list already on screen.
      navigate("/items");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete item");
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  if (loading)
    return (
      <>
        <ItemDetailSkeleton />
        {showSlowHint && (
          <p className="wizard-hint slow-load-hint">
            Still loading. The server may be waking up after a period of inactivity, which can take up to a minute.
          </p>
        )}
      </>
    );
  if (error || !item) return <div className="page wizard-error">{error ?? "Item not found"}</div>;

  const pill = itemStatusPill(item.status);

  return (
    <div className="page">
      <div className="wizard-card">
        <div className="wizard-step">
          {item.photos.length > 0 ? (
            <button
              type="button"
              className="item-detail-photo-button"
              onClick={() => setLightboxOpen(true)}
              aria-label="View full-size photo"
            >
              <img src={item.photos[0]} alt={item.name} className="item-detail-photo" />
            </button>
          ) : (
            <div className="item-detail-photo item-detail-photo-placeholder">No Photo</div>
          )}

          <p className="item-detail-code">{item.item_code}</p>
          <h2 className="item-detail-name">{item.name}</h2>
          <ul className="review-list">
            <li>Category: {item.category}</li>
            <li>
              Type: {item.item_type === "set" ? "Set" : "Single"} ·{" "}
              {item.tracking_type === "quantity" ? `Qty ${item.quantity_on_hand ?? 0} on hand` : "Unique"}
            </li>
            <li>
              Status:{" "}
              <span className="pill-group">
                <span className={`pill ${pill.className}`}>{pill.label}</span>
                {!item.is_active && <span className="pill pill-neutral">Retired</span>}
              </span>
            </li>
            <li>Rental price: {item.rental_price != null ? `₹${item.rental_price}` : "—"}</li>
            <li>Sale price: {item.sale_price != null ? `₹${item.sale_price}` : "—"}</li>
            {/* Total agreed value earned across every non-cancelled booking,
                all-time — not cash collected so far, see ItemRevenue's own
                doc comment. The one figure this page exists to answer:
                "has this item paid for itself." */}
            <li>
              <strong>Total Earnings: ₹{revenue?.grand_total ?? 0}</strong>
            </li>
            {item.components && item.components.length > 0 && <li>Components: {item.components.join(", ")}</li>}
          </ul>

          {deleteError && <p className="wizard-error">{deleteError}</p>}
          <div className="wizard-nav">
            <button type="button" className="btn-icon" aria-label="Back" onClick={() => navigate(-1)}>
              <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
            </button>
            <div className="line-item-actions">
              {confirmingDelete ? (
                <>
                  <span>Delete this item?</span>
                  <button type="button" className="btn-danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? "…" : "Yes, Delete"}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-icon btn-icon-danger"
                  aria-label="Delete"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="wizard-card" style={{ marginTop: 16 }}>
        <div className="wizard-step">
          <h2>Booking History ({history.length})</h2>
          {history.length === 0 ? (
            <p className="wizard-hint">This item hasn't been booked yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Dates</th>
                    <th>Status</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => {
                    const rowPill = bookingItemStatusPill(row);
                    return (
                      <tr key={row.id}>
                        <td data-label="Booking">
                          <Link to={`/bookings?booking=${row.booking_id}`}>{row.booking_code ?? "—"}</Link>
                        </td>
                        <td data-label="Customer">{row.customer_name ?? "—"}</td>
                        <td data-label="Type">{row.type === "rental" ? "Rental" : "Sale"}</td>
                        <td data-label="Dates">
                          {formatDateDisplay(row.pickup_date)}
                          {row.return_date ? ` → ${formatDateDisplay(row.return_date)}` : ""}
                        </td>
                        <td data-label="Status">
                          <span className={`pill ${rowPill.className}`}>{rowPill.label}</span>
                        </td>
                        <td data-label="Amount">
                          {row.is_foc ? (
                            <>
                              <span className="receipt-item-name-cancelled">₹{row.price_charged}</span>{" "}
                              <span className="pill pill-foc receipt-item-pill">FOC</span>
                            </>
                          ) : (
                            `₹${row.price_charged}`
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {lightboxOpen && <PhotoLightbox photos={item.photos} startIndex={0} onClose={() => setLightboxOpen(false)} />}
    </div>
  );
}
