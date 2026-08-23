import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { fetchPublicReceipt, type PublicReceipt } from "../lib/publicReceipt";
import { formatDateDisplay } from "../lib/dates";
import { useSlowLoadHint } from "../lib/useSlowLoadHint";
import { ReceiptSkeleton } from "../components/common/Skeleton";
import ngjLogo from "../assets/images/ngj-logo.png";
import "../styles/shared.css";

// The public counterpart to ReceiptPage.tsx — reachable with no login at
// all (see App.tsx: this route is deliberately NOT wrapped in
// ProtectedRoute) via a WhatsApp-shared link. Renders only the narrow
// PublicReceipt shape the backend hands back; there is no fuller booking
// object sitting in memory here to accidentally over-render from.
export default function PublicReceiptPage() {
  const { token } = useParams<{ token: string }>();
  const [receipt, setReceipt] = useState<PublicReceipt | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetchPublicReceipt(token)
      .then((r) => {
        setReceipt(r);
        // Self-referential on purpose — this is the one link a customer
        // actually has access to. The staff ReceiptPage's QR points at the
        // internal /bookings?booking= deep link instead, which would just
        // bounce a signed-out scanner to /login.
        return QRCode.toDataURL(window.location.href, { margin: 1, width: 220 });
      })
      .then(setQrDataUrl)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load receipt"))
      .finally(() => setLoading(false));
  }, [token]);

  const showSlowHint = useSlowLoadHint(loading);

  if (loading)
    return (
      <>
        <ReceiptSkeleton />
        {showSlowHint && (
          <p className="wizard-hint slow-load-hint">
            Still loading — the server may be waking up after a period of inactivity. This can take up to a minute.
          </p>
        )}
      </>
    );
  if (error) return <div className="page wizard-error">{error}</div>;
  if (!receipt) return null;

  return (
    <div className="page receipt-page">
      <div className="no-print receipt-actions">
        <button className="btn-primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div className="receipt-header">
        <img src={ngjLogo} alt="Nitya Gehini Jewels" className="receipt-logo" />
        <div className="receipt-shop-name">{receipt.shop.name}</div>
        {receipt.shop.address && <div className="receipt-shop-line">{receipt.shop.address}</div>}
        {receipt.shop.phone && <div className="receipt-shop-line">{receipt.shop.phone}</div>}
      </div>

      <div className="receipt-meta">
        <div>
          <div className="receipt-meta-label">Booking No.</div>
          <strong>{receipt.booking_code}</strong>
          <div className="wizard-hint">{formatDateDisplay(receipt.booking_date)}</div>
        </div>
        <div className="receipt-meta-right">
          <div className="receipt-meta-label">Customer</div>
          <div>{receipt.customer_name}</div>
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
          {receipt.items.map((bi, i) => {
            const cancelled = bi.status === "cancelled";
            return (
              <tr key={i} className={cancelled ? "receipt-item-cancelled" : undefined}>
                <td data-label="Item">
                  <span className={cancelled ? "receipt-item-name-cancelled" : undefined}>
                    {bi.item_code} — {bi.name}
                    {bi.quantity_booked > 1 && ` × ${bi.quantity_booked}`}
                  </span>
                  {cancelled && <span className="pill pill-neutral receipt-item-pill">Cancelled</span>}
                  {bi.components.length > 0 && (
                    <div className="receipt-item-addons">Components: {bi.components.join(", ")}</div>
                  )}
                  {bi.custom_addons.length > 0 && (
                    <div className="receipt-item-addons">Additional: {bi.custom_addons.join(", ")}</div>
                  )}
                  {!cancelled && bi.deposit && (
                    <div className="receipt-item-deposit">
                      Security Deposit: ₹{bi.deposit.amount}
                      {bi.deposit.refunded
                        ? ` (Refunded${bi.deposit.refund_date ? ` ${formatDateDisplay(bi.deposit.refund_date)}` : ""})`
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
                  {bi.is_foc ? <span className="pill pill-foc receipt-item-pill">FOC</span> : `₹${bi.price_charged}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {receipt.items.some((bi) => bi.status === "cancelled") && (
        <p className="wizard-hint receipt-cancelled-note">
          Cancelled items are shown for a complete record but aren't included in the total below.
        </p>
      )}

      <div className="receipt-totals">
        <div className="receipt-totals-row">
          <span>Total</span>
          <span className="receipt-totals-value">₹{receipt.price_charged}</span>
        </div>
        <div className="receipt-totals-row">
          <span>Amount Paid</span>
          <span className="receipt-totals-value">₹{receipt.total_paid}</span>
        </div>
        <div className="receipt-totals-row receipt-totals-balance">
          <span>Balance Due</span>
          <span className="receipt-totals-value">₹{receipt.balance_due}</span>
        </div>
      </div>

      {qrDataUrl && (
        <div className="receipt-qr">
          <img src={qrDataUrl} alt="QR code linking to this receipt" width={140} height={140} />
          <p className="wizard-hint">Scan to view this receipt</p>
        </div>
      )}
    </div>
  );
}
