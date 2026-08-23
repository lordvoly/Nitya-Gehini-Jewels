import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { fetchBooking, type Booking } from "../lib/bookings";
import { fetchShopSettings, type ShopSettings } from "../lib/shopSettings";
import { formatDateDisplay } from "../lib/dates";
import { bookingItemStatusPill } from "../lib/statusPill";
import { buildWhatsAppLink } from "../lib/whatsapp";
import ngjLogo from "../assets/images/ngj-logo.png";
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

  const publicUrl = `${window.location.origin}/r/${booking.share_token}`;
  const message = `Hi ${booking.customers?.name ?? ""}, here's your invoice from ${shop.name}: ${publicUrl}`;
  const whatsapp = buildWhatsAppLink(booking.customers?.phone, message);

  return (
    <div className="page receipt-page">
      <div className="no-print receipt-actions">
        <button className="btn-primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        {/* A real <a> with target="_blank", not window.location — so this
            behaves as a genuine user-initiated navigation on mobile
            browsers rather than something that can get blocked or racy. */}
        {"url" in whatsapp ? (
          <a href={whatsapp.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            Send via WhatsApp
          </a>
        ) : (
          <button className="btn-secondary" disabled title={whatsapp.error}>
            Send via WhatsApp
          </button>
        )}
      </div>
      {!("url" in whatsapp) && <p className="wizard-hint no-print">{whatsapp.error} — can't send via WhatsApp.</p>}

      <div className="receipt-header">
        <img src={ngjLogo} alt="Nitya Gehini Jewels" className="receipt-logo" />
        <div className="receipt-shop-name">{shop.name}</div>
        {shop.address && <div className="receipt-shop-line">{shop.address}</div>}
        {shop.phone && <div className="receipt-shop-line">{shop.phone}</div>}
      </div>

      <div className="receipt-meta">
        <div>
          <div className="receipt-meta-label">Booking No.</div>
          <strong>{booking.booking_code}</strong>
          <div className="wizard-hint">{formatDateDisplay(booking.created_at.slice(0, 10))}</div>
        </div>
        <div className="receipt-meta-right">
          <div className="receipt-meta-label">Customer</div>
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
                  {/* Free-text extras added at booking time (nath, sheeshpatti,
                      etc.) — booking_items.custom_addons, distinct from
                      items.components (the item's own reusable template).
                      Shown regardless of cancelled, same as everything else in
                      this cell, so a cancelled line's own history stays intact. */}
                  {bi.custom_addons.length > 0 && (
                    <div className="receipt-item-addons">Additional: {bi.custom_addons.join(", ")}</div>
                  )}
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
          <span className="receipt-totals-value">₹{booking.price_charged}</span>
        </div>
        <div className="receipt-totals-row">
          <span>Amount Paid</span>
          <span className="receipt-totals-value">₹{booking.total_paid}</span>
        </div>
        <div className="receipt-totals-row receipt-totals-balance">
          <span>Balance Due</span>
          <span className="receipt-totals-value">₹{booking.balance_due}</span>
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
