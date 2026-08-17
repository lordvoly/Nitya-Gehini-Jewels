import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { fetchBooking, type Booking } from "../lib/bookings";
import { fetchShopSettings, type ShopSettings } from "../lib/shopSettings";
import { formatDateDisplay } from "../lib/dates";
import { bookingItemStatusPill } from "../lib/statusPill";
import "../styles/shared.css";

// Printable receipt — deliberately plain, no GST section (per explicit
// direction, not a placeholder to fill in later; see CLAUDE.md). "Download"
// is just the browser's own print dialog's Save-as-PDF destination, no new
// PDF library needed, same reasoning as the print approach used elsewhere.
export default function ReceiptPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingId) return;
    Promise.all([fetchBooking(bookingId), fetchShopSettings()])
      .then(([b, s]) => {
        setBooking(b);
        setShop(s);
        // Same URL BookingDetail itself lives at — the deep-link pattern
        // already used from Dashboard/Reports/Charges, not a new route.
        const url = `${window.location.origin}/bookings?booking=${b.id}`;
        return QRCode.toDataURL(url, { margin: 1, width: 220 });
      })
      .then(setQrDataUrl)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load receipt"))
      .finally(() => setLoading(false));
  }, [bookingId]);

  if (loading) return <div className="page">Loading…</div>;
  if (error) return <div className="page wizard-error">{error}</div>;
  if (!booking || !shop) return null;

  return (
    <div className="page receipt-page">
      <div className="no-print wizard-actions" style={{ marginBottom: 20 }}>
        <button className="btn-primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div className="receipt-header">
        <div className="receipt-shop-name">{shop.name}</div>
        {shop.address && <div className="receipt-shop-line">{shop.address}</div>}
        {shop.phone && <div className="receipt-shop-line">{shop.phone}</div>}
      </div>

      <div className="receipt-meta">
        <div>
          <strong>{booking.booking_code}</strong>
          <div className="wizard-hint">{formatDateDisplay(booking.created_at.slice(0, 10))}</div>
        </div>
        <div className="receipt-meta-right">
          <div>{booking.customers?.name}</div>
          <div className="wizard-hint">{booking.customers?.phone}</div>
        </div>
      </div>

      <table className="data-table receipt-items">
        <thead>
          <tr>
            <th>Item</th>
            <th>Type</th>
            <th>Dates</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          {booking.booking_items.map((bi) => {
            const cancelled = bi.status === "cancelled";
            const pill = bookingItemStatusPill(bi);
            return (
              <tr key={bi.id} className={cancelled ? "receipt-item-cancelled" : undefined}>
                <td data-label="Item">
                  <span className={cancelled ? "receipt-item-name-cancelled" : undefined}>
                    {bi.items?.item_code} — {bi.items?.name}
                  </span>
                  {cancelled && <span className={`pill ${pill.className} receipt-item-pill`}>{pill.label}</span>}
                  {/* Deliberately outside the Total/Paid/Balance figures below —
                      a deposit never flows through booking_financials (see
                      CLAUDE.md), this is purely a paper record of what was
                      handed over and what came back. Shown only when a deposit
                      was actually collected; an agreed-but-never-taken deposit
                      (deposit_amount set, deposit_collected false) has nothing
                      to show on a receipt. */}
                  {!cancelled && bi.deposit_collected && (
                    <div className="receipt-item-deposit">
                      Security Deposit: ₹{bi.deposit_amount}
                      {bi.deposit_refunded
                        ? ` (Refunded${bi.deposit_refund_date ? ` ${formatDateDisplay(bi.deposit_refund_date)}` : ""})`
                        : " (Held — not yet refunded)"}
                    </div>
                  )}
                </td>
                <td data-label="Type">{bi.type === "rental" ? "Rental" : "Sale"}</td>
                <td data-label="Dates">
                  {bi.type === "rental"
                    ? `${formatDateDisplay(bi.pickup_date)}${bi.return_date ? ` → ${formatDateDisplay(bi.return_date)}` : ""}`
                    : formatDateDisplay(bi.pickup_date)}
                </td>
                <td data-label="Price">
                  {bi.is_foc ? (
                    <>
                      <span className="receipt-item-name-cancelled">₹{bi.price_charged}</span>{" "}
                      <span className="pill pill-foc receipt-item-pill">FOC</span>
                    </>
                  ) : (
                    `₹${bi.price_charged}`
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {booking.booking_items.some((bi) => bi.status === "cancelled") && (
        <p className="wizard-hint receipt-cancelled-note">
          Cancelled items are shown for a complete record but aren't included in the total below.
        </p>
      )}

      <div className="receipt-totals">
        <div className="receipt-totals-row">
          <span>Total</span>
          <span>₹{booking.price_charged}</span>
        </div>
        <div className="receipt-totals-row">
          <span>Amount Paid</span>
          <span>₹{booking.total_paid}</span>
        </div>
        <div className="receipt-totals-row receipt-totals-balance">
          <span>Balance Due</span>
          <span>₹{booking.balance_due}</span>
        </div>
      </div>

      {qrDataUrl && (
        <div className="receipt-qr">
          <img src={qrDataUrl} alt="QR code linking to this booking" width={140} height={140} />
          <p className="wizard-hint">Scan to view this booking</p>
        </div>
      )}
    </div>
  );
}
