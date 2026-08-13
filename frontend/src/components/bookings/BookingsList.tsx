import { useEffect, useState } from "react";
import { fetchBookings, type Booking, type BookingItem } from "../../lib/bookings";
import { bookingItemStatusPill, bookingComputedStatusPill } from "../../lib/statusPill";
import { formatDateDisplay } from "../../lib/dates";

export function BookingsList({
  onProcessReturn,
  onViewDetail,
  onEditBooking,
}: {
  onProcessReturn: (booking: Booking, item: BookingItem) => void;
  onViewDetail: (bookingId: string) => void;
  onEditBooking: (bookingId: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      fetchBookings(term ? { search: term } : undefined)
        .then((data) => {
          if (!cancelled) setBookings(data);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [term]);

  return (
    <div>
      {/* Search Header Bar */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3 d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div className="input-group" style={{ maxWidth: 380 }}>
            <span className="input-group-text bg-white border-end-0 text-muted">
              <i className="ti ti-search fs-5"></i>
            </span>
            <input
              className="form-control border-start-0 ps-0"
              type="text"
              placeholder="Search by booking code or customer name…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div className="text-muted small">
            {loading ? (
              <span className="d-flex align-items-center gap-1">
                <span className="spinner-border spinner-border-sm text-primary" role="status"></span> Searching…
              </span>
            ) : (
              <span>
                Total Bookings: <strong>{bookings.length}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {bookings.length === 0 && !loading && (
        <div className="card border-0 shadow-sm text-center py-5 text-muted">
          <i className="ti ti-calendar-off fs-1 text-muted d-block mb-2"></i>
          {term ? (
            <>
              <h5 className="fw-semibold text-dark mb-1">No matching bookings</h5>
              <p className="small mb-0">Nothing found for "{term}" — check spelling or booking code.</p>
            </>
          ) : (
            <>
              <h5 className="fw-semibold text-dark mb-1">No bookings recorded yet</h5>
              <p className="small mb-0">Create your first rental or sale to manage reservations here.</p>
            </>
          )}
        </div>
      )}

      {/* Bookings Card List */}
      <div className="row g-3">
        {bookings.map((b) => {
          const statusPill = bookingComputedStatusPill(b.computed_status, b.resolved_item_count, b.active_item_count);
          const isFullyPaid = b.balance_due <= 0;

          return (
            <div className="col-12" key={b.id}>
              <div className="card border-0 shadow-sm hover-shadow transition">
                {/* Header */}
                <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between flex-wrap gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-primary text-white font-monospace fs-6 px-3 py-2">
                      {b.booking_code}
                    </span>
                    <div>
                      <h6 className="mb-0 fw-bold text-dark">{b.customers?.name ?? "—"}</h6>
                      {b.customers?.phone && (
                        <span className="text-muted fs-7 me-2">
                          <i className="ti ti-phone me-1"></i>
                          {b.customers.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-2">
                    <span
                      className={`badge px-3 py-2 fs-7 ${
                        statusPill.className === "pill-attention"
                          ? "bg-danger-subtle text-danger"
                          : statusPill.className === "pill-active"
                          ? "bg-warning-subtle text-warning"
                          : "bg-success-subtle text-success"
                      }`}
                    >
                      {statusPill.label} {statusPill.fraction ? `(${statusPill.fraction})` : ""}
                    </span>

                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => onViewDetail(b.id)}
                    >
                      <i className="ti ti-eye me-1"></i> View Detail
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm"
                      onClick={() => onEditBooking(b.id)}
                    >
                      <i className="ti ti-edit me-1"></i> Edit
                    </button>
                  </div>
                </div>

                {/* Body & Line Items */}
                <div className="card-body p-3 bg-light">
                  {/* Financials Strip */}
                  <div className="d-flex align-items-center gap-4 mb-3 p-2 bg-white rounded border small">
                    <div>
                      <span className="text-muted me-1">Paid:</span>
                      <strong className="text-success">₹{b.total_paid.toLocaleString("en-IN")}</strong>
                    </div>
                    <div>
                      <span className="text-muted me-1">Balance Due:</span>
                      <strong className={isFullyPaid ? "text-success" : "text-danger"}>
                        ₹{b.balance_due.toLocaleString("en-IN")}
                      </strong>
                    </div>
                  {(() => {
                    const depositHeld = b.booking_items.reduce((acc, bi) => acc + (bi.deposit_collected && !bi.deposit_refunded ? bi.deposit_amount : 0), 0);
                    return depositHeld > 0 ? (
                      <div>
                        <span className="text-muted me-1">Deposit Held:</span>
                        <strong className="text-primary">₹{depositHeld.toLocaleString("en-IN")}</strong>
                      </div>
                    ) : null;
                  })()}
                  </div>

                  {/* Items List */}
                  <div className="d-flex flex-column gap-2">
                    {b.booking_items.map((bi) => {
                      const itemPill = bookingItemStatusPill(bi.status);
                      const canReturn = bi.type === "rental" && (bi.status === "booked" || bi.status === "out");

                      return (
                        <div
                          className="bg-white p-3 rounded border d-flex align-items-center justify-content-between flex-wrap gap-2"
                          key={bi.id}
                        >
                          <div>
                            <div className="d-flex align-items-center gap-2 mb-1">
                              <span className="badge bg-light text-dark border font-monospace fs-7">
                                {bi.items?.item_code}
                              </span>
                              <strong className="text-dark">{bi.items?.name}</strong>
                              <span className="badge bg-secondary-subtle text-secondary fs-7">
                                {bi.type === "rental" ? "Rental" : "Sale"}
                              </span>
                            </div>
                            <div className="text-muted fs-7">
                              <i className="ti ti-calendar me-1"></i>
                              {formatDateDisplay(bi.pickup_date)}
                              {bi.return_date ? ` → ${formatDateDisplay(bi.return_date)}` : ""}
                            </div>

                            {bi.items?.tracking_type === "unique" &&
                              (bi.future_booking_items && bi.future_booking_items.length > 0 ? (
                                <button
                                  type="button"
                                  className="btn p-0 border-0 text-danger fs-7 text-start mt-1 d-block"
                                  onClick={() => onViewDetail(bi.future_booking_items![0].booking_id!)}
                                >
                                  <i className="ti ti-alert-circle me-1"></i>
                                  Next: {bi.future_booking_items[0].booking_code} —{" "}
                                  {bi.future_booking_items[0].customer_name ?? "—"} ({formatDateDisplay(bi.future_booking_items[0].pickup_date)})
                                </button>
                              ) : (
                                <span className="text-muted fs-7 d-block mt-1">No bookings ahead</span>
                              ))}
                          </div>

                          <div className="d-flex align-items-center gap-2">
                            <span
                              className={`badge px-2 py-1 fs-7 ${
                                itemPill.className === "pill-attention"
                                  ? "bg-danger-subtle text-danger"
                                  : itemPill.className === "pill-active"
                                  ? "bg-warning-subtle text-warning"
                                  : "bg-success-subtle text-success"
                              }`}
                            >
                              {itemPill.label}
                            </span>

                            {canReturn && (
                              <button
                                type="button"
                                className="btn btn-warning btn-sm fw-semibold"
                                onClick={() => onProcessReturn(b, bi)}
                              >
                                <i className="ti ti-corner-up-left me-1"></i> Process Return
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
