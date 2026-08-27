import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchItemCharges, resolveItemCharge, type ItemCharge } from "../lib/itemCharges";
import { fetchPendingItems, resolvePendingItem, chargePendingItem, type PendingItem } from "../lib/pendingItems";
import { formatDateDisplay } from "../lib/dates";
import { useSlowLoadHint } from "../lib/useSlowLoadHint";
import { ListPageSkeleton } from "../components/common/Skeleton";
import "../styles/shared.css";

function pendingKey(p: PendingItem): string {
  return `${p.booking_item_id}:${p.component_name}`;
}

// The "not charged" counterpart to the Outstanding Charges list below —
// a checklist entry flagged missing at return time that never became a
// formal charge at all. Two ways out: it genuinely comes back (Mark
// Returned, no money involved) or the shop gives up chasing it and charges
// for it now (Charge for This, which moves it into the ordinary Outstanding
// Charges section above on the next load — same item_charges/payments
// shape the return flow's own "Charge for this" already creates).
function PendingItemsSection({ onChargedOut }: { onChargedOut: () => void }) {
  const [pending, setPending] = useState<PendingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [chargingKey, setChargingKey] = useState<string | null>(null);
  const [chargeDrafts, setChargeDrafts] = useState<Record<string, string>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    return fetchPendingItems()
      .then(setPending)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load pending items"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkReturned(p: PendingItem) {
    const key = pendingKey(p);
    setActionErrors((e) => ({ ...e, [key]: "" }));
    setSavingKey(key);
    try {
      await resolvePendingItem(p.booking_id, p.booking_item_id, p.component_name);
      setResolvingKey(null);
      await load();
    } catch (err) {
      setActionErrors((e) => ({ ...e, [key]: err instanceof Error ? err.message : "Failed to mark returned" }));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleCharge(p: PendingItem) {
    const key = pendingKey(p);
    const amount = Number(chargeDrafts[key] ?? "");
    if (!(amount > 0)) {
      setActionErrors((e) => ({ ...e, [key]: "Enter a charge amount greater than 0" }));
      return;
    }
    setActionErrors((e) => ({ ...e, [key]: "" }));
    setSavingKey(key);
    try {
      await chargePendingItem(p.booking_id, p.booking_item_id, p.component_name, amount);
      setChargingKey(null);
      await load();
      onChargedOut();
    } catch (err) {
      setActionErrors((e) => ({ ...e, [key]: err instanceof Error ? err.message : "Failed to record charge" }));
    } finally {
      setSavingKey(null);
    }
  }

  const showSlowHint = useSlowLoadHint(!pending && !error);

  if (!pending && !error) {
    return (
      <>
        <ListPageSkeleton />
        {showSlowHint && (
          <p className="wizard-hint slow-load-hint">
            Still loading. The server may be waking up after a period of inactivity, which can take up to a minute.
          </p>
        )}
      </>
    );
  }

  return (
    <div>
      {error && <p className="wizard-error">{error}</p>}

      {pending && pending.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing pending</h3>
          <p>Every return has been fully checked off, or already charged for.</p>
        </div>
      ) : (
        pending?.map((p) => {
          const key = pendingKey(p);
          return (
            <div className="line-item-card" key={key}>
              <div className="line-item-card-header">
                <h3>
                  <Link to={`/bookings?booking=${p.booking_id}`}>{p.booking_code}</Link>
                </h3>
                {p.actual_return_date && <span className="wizard-hint">{formatDateDisplay(p.actual_return_date)}</span>}
              </div>
              <p>
                {p.customer_name} · {p.item_code} — {p.item_name}
              </p>
              <p>
                <strong>{p.component_name}</strong>
              </p>
              {p.return_notes && <p className="wizard-hint">"{p.return_notes}"</p>}

              {resolvingKey === key ? (
                <>
                  <p className="wizard-hint">Confirm this has genuinely come back?</p>
                  {actionErrors[key] && <p className="line-item-error">{actionErrors[key]}</p>}
                  <div className="line-item-card-header" style={{ marginTop: 10 }}>
                    <button type="button" className="btn-primary" disabled={savingKey === key} onClick={() => handleMarkReturned(p)}>
                      {savingKey === key ? "Saving…" : "Confirm Returned"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setResolvingKey(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : chargingKey === key ? (
                <>
                  <label className="field-label">
                    Charge Amount (₹)
                    <input
                      type="number"
                      min={0}
                      value={chargeDrafts[key] ?? ""}
                      onChange={(e) => setChargeDrafts((d) => ({ ...d, [key]: e.target.value }))}
                    />
                  </label>
                  {actionErrors[key] && <p className="line-item-error">{actionErrors[key]}</p>}
                  <div className="line-item-card-header" style={{ marginTop: 10 }}>
                    <button type="button" className="btn-primary" disabled={savingKey === key} onClick={() => handleCharge(p)}>
                      {savingKey === key ? "Saving…" : "Confirm Charge"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setChargingKey(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div className="line-item-card-header" style={{ marginTop: 10 }}>
                  <button type="button" className="btn-primary" onClick={() => setResolvingKey(key)}>
                    Mark Returned
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setChargingKey(key)}>
                    Charge for This
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

// Universal view across ALL bookings, not scoped to any one booking — the
// only place an operator can see every still-outstanding lost/damaged-item
// charge in one list, per §8's lost-and-found design. Now also the one
// place to see items flagged missing at return time that were never even
// charged for (PendingItemsSection above) — a distinct, earlier stage of
// the same lost-and-found concern.
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
            Still loading. The server may be waking up after a period of inactivity, which can take up to a minute.
          </p>
        )}
      </>
    );

  return (
    <div className="page">
      <h2>Charges</h2>

      <div className="dashboard-section">
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

      <div className="dashboard-section">
        <h2>Pending — Not Charged</h2>
        <p className="wizard-hint">
          Flagged as still missing when a return was processed, but never formally charged for.
        </p>
        <PendingItemsSection onChargedOut={load} />
      </div>
    </div>
  );
}
