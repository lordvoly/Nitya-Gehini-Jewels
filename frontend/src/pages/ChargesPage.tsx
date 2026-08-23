import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchItemCharges, resolveItemCharge, type ItemCharge } from "../lib/itemCharges";
import { formatDateDisplay } from "../lib/dates";
import { useSlowLoadHint } from "../lib/useSlowLoadHint";
import { ListPageSkeleton } from "../components/common/Skeleton";
import "../styles/shared.css";

// Universal view across ALL bookings, not scoped to any one booking — the
// only place an operator can see every still-outstanding lost/damaged-item
// charge in one list, per §8's lost-and-found design.
export default function ChargesPage() {
  const [charges, setCharges] = useState<ItemCharge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [refundDrafts, setRefundDrafts] = useState<Record<string, string>>({});
  const [resolveErrors, setResolveErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    return fetchItemCharges(false)
      .then((data) => {
        setCharges(data);
        setRefundDrafts(Object.fromEntries(data.map((c) => [c.id, String(c.charge_amount)])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load outstanding charges"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleResolve(charge: ItemCharge) {
    const amountStr = refundDrafts[charge.id] ?? "";
    const amount = Number(amountStr);
    if (!(amount > 0)) {
      setResolveErrors((e) => ({ ...e, [charge.id]: "Enter a refund amount greater than 0" }));
      return;
    }
    setResolveErrors((e) => ({ ...e, [charge.id]: "" }));
    setSavingId(charge.id);
    try {
      await resolveItemCharge(charge.id, amount);
      setResolvingId(null);
      await load();
    } catch (err) {
      setResolveErrors((e) => ({ ...e, [charge.id]: err instanceof Error ? err.message : "Failed to resolve" }));
    } finally {
      setSavingId(null);
    }
  }

  const showSlowHint = useSlowLoadHint(!charges && !error);

  if (!charges && !error)
    return (
      <>
        <ListPageSkeleton />
        {showSlowHint && (
          <p className="wizard-hint slow-load-hint">
            Still loading — the server may be waking up after a period of inactivity. This can take up to a minute.
          </p>
        )}
      </>
    );

  return (
    <div className="page">
      <h2>Outstanding Charges</h2>
      <p className="wizard-hint">Lost or damaged items charged at return, not yet resolved.</p>

      {error && <p className="wizard-error">{error}</p>}

      {charges && charges.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing outstanding</h3>
          <p>Every lost-and-found charge has been resolved.</p>
        </div>
      ) : (
        charges?.map((c) => {
          const bookingCode = c.booking_items?.bookings?.booking_code ?? "—";
          const bookingUuid = c.booking_items?.bookings?.id;
          const customerName = c.booking_items?.bookings?.customers?.name ?? "—";
          const itemLabel = c.booking_items?.items ? `${c.booking_items.items.item_code} — ${c.booking_items.items.name}` : "—";

          return (
            <div className="line-item-card" key={c.id}>
              <div className="line-item-card-header">
                <h3>{bookingUuid ? <Link to={`/bookings?booking=${bookingUuid}`}>{bookingCode}</Link> : bookingCode}</h3>
                <span className="wizard-hint">{formatDateDisplay(c.charged_at)}</span>
              </div>
              <p>
                {customerName} · {itemLabel}
              </p>
              <p>
                <strong>{c.description}</strong> — ₹{c.charge_amount}
              </p>

              {resolvingId === c.id ? (
                <>
                  <label className="field-label">
                    Refund Amount (₹)
                    <input
                      type="number"
                      min={0}
                      value={refundDrafts[c.id] ?? ""}
                      onChange={(e) => setRefundDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    />
                  </label>
                  {resolveErrors[c.id] && <p className="line-item-error">{resolveErrors[c.id]}</p>}
                  <div className="line-item-card-header" style={{ marginTop: 10 }}>
                    <button type="button" className="btn-primary" disabled={savingId === c.id} onClick={() => handleResolve(c)}>
                      {savingId === c.id ? "Saving…" : "Confirm Resolve"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setResolvingId(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div className="line-item-card-header" style={{ marginTop: 10 }}>
                  <button type="button" className="btn-primary" onClick={() => setResolvingId(c.id)}>
                    Resolve
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
