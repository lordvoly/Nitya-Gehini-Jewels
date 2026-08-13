import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchItemCharges, resolveItemCharge, type ItemCharge } from "../lib/itemCharges";
import { formatDateDisplay } from "../lib/dates";

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

  if (!charges && !error) {
    return (
      <div className="d-flex align-items-center justify-content-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid p-0">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="h3 mb-1 fw-semibold text-dark">Outstanding Item Charges</h1>
          <p className="text-muted mb-0 small">Manage lost or damaged piece fees charged during rental returns</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 small mb-4">
          <i className="ti ti-alert-triangle me-1"></i> {error}
        </div>
      )}

      {charges && charges.length === 0 ? (
        <div className="card border-0 shadow-sm text-center py-5 text-muted">
          <i className="ti ti-circle-check fs-1 text-success d-block mb-2"></i>
          <h5 className="fw-semibold text-dark mb-1">No Outstanding Charges</h5>
          <p className="small mb-0">Every lost-and-found charge has been successfully resolved.</p>
        </div>
      ) : (
        <div className="row g-3">
          {charges?.map((c) => {
            const bookingCode = c.booking_items?.bookings?.booking_code ?? "—";
            const bookingUuid = c.booking_items?.bookings?.id;
            const customerName = c.booking_items?.bookings?.customers?.name ?? "—";
            const itemLabel = c.booking_items?.items ? `${c.booking_items.items.item_code} — ${c.booking_items.items.name}` : "—";

            return (
              <div className="col-12 col-md-6 col-xl-4" key={c.id}>
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
                    <div>
                      {bookingUuid ? (
                        <Link to={`/bookings?booking=${bookingUuid}`} className="badge bg-primary text-white font-monospace text-decoration-none fs-6">
                          {bookingCode}
                        </Link>
                      ) : (
                        <span className="badge bg-light text-dark border font-monospace">{bookingCode}</span>
                      )}
                    </div>
                    <span className="text-muted fs-7">
                      <i className="ti ti-calendar me-1"></i>
                      {formatDateDisplay(c.charged_at)}
                    </span>
                  </div>

                  <div className="card-body p-3">
                    <div className="text-muted small mb-1">Customer: <strong className="text-dark">{customerName}</strong></div>
                    <div className="text-muted small mb-3">Item: <strong className="text-dark">{itemLabel}</strong></div>

                    <div className="p-3 bg-danger-subtle border border-danger-subtle rounded mb-3">
                      <span className="text-danger small fw-semibold d-block text-uppercase mb-1">Charge Reason</span>
                      <strong className="text-dark d-block mb-1">{c.description}</strong>
                      <span className="fs-5 fw-bold text-danger">₹{c.charge_amount.toLocaleString("en-IN")}</span>
                    </div>

                    {resolvingId === c.id ? (
                      <div className="p-3 bg-light rounded border">
                        <label className="form-label fw-medium small">Refund / Settlement Amount (₹)</label>
                        <div className="input-group input-group-sm mb-2">
                          <span className="input-group-text bg-white">₹</span>
                          <input
                            type="number"
                            className="form-control"
                            min={0}
                            value={refundDrafts[c.id] ?? ""}
                            onChange={(e) => setRefundDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                          />
                        </div>

                        {resolveErrors[c.id] && (
                          <div className="alert alert-danger py-1 px-2 small mb-2">{resolveErrors[c.id]}</div>
                        )}

                        <div className="d-flex justify-content-end gap-2 mt-2">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => setResolvingId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm fw-semibold"
                            disabled={savingId === c.id}
                            onClick={() => handleResolve(c)}
                          >
                            {savingId === c.id ? "Resolving…" : "Confirm Settlement"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline-primary w-100 fw-semibold btn-sm"
                        onClick={() => setResolvingId(c.id)}
                      >
                        <i className="ti ti-check me-1"></i> Resolve Charge
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
