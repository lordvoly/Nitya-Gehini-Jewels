import { useMemo, useState } from "react";
import type { Item } from "../../lib/items";
import { itemStatusPill } from "../../lib/statusPill";
import { PhotoLightbox } from "./PhotoLightbox";

type Filter = "all" | "active" | "retired";

const EMPTY_COPY: Record<Filter, { title: string; hint: string }> = {
  all: { title: "No items yet", hint: "Add your first one to get started." },
  active: { title: "No active items", hint: "Everything's retired, or nothing's been added yet." },
  retired: { title: "No retired items", hint: "Retired pieces will show up here." },
};

export function ItemsList({
  items,
  loading,
  onRefresh,
  onEdit,
  onDelete,
  onRetire,
  onReactivate,
}: {
  items: Item[];
  loading: boolean;
  onRefresh: () => void;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => Promise<void>;
  onRetire: (item: Item) => Promise<void>;
  onReactivate: (item: Item) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewingPhotosOf, setViewingPhotosOf] = useState<Item | null>(null);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filter === "active") result = result.filter((i) => i.is_active);
    if (filter === "retired") result = result.filter((i) => !i.is_active);

    const term = search.trim().toLowerCase();
    if (term) {
      result = result.filter(
        (i) => i.item_code.toLowerCase().includes(term) || i.name.toLowerCase().includes(term),
      );
    }
    return result;
  }, [items, filter, search]);

  async function confirmDelete(item: Item) {
    setDeletingId(item.id);
    setActionError(null);
    try {
      await onDelete(item);
      setConfirmingId(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete item");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRetire(item: Item) {
    setTogglingId(item.id);
    setActionError(null);
    try {
      await onRetire(item);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to retire item");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleReactivate(item: Item) {
    setTogglingId(item.id);
    setActionError(null);
    try {
      await onReactivate(item);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to reactivate item");
    } finally {
      setTogglingId(null);
    }
  }

  const empty = EMPTY_COPY[filter];

  return (
    <div className="card border-0 shadow-sm">
      {/* Header Controls */}
      <div className="card-header bg-white p-3 border-bottom d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: 360 }}>
          <div className="input-group">
            <span className="input-group-text bg-white border-end-0 text-muted">
              <i className="ti ti-search fs-5"></i>
            </span>
            <input
              className="form-control border-start-0 ps-0"
              type="text"
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {/* Status Filter Buttons */}
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className={`btn ${filter === "all" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setFilter("all")}
            >
              All ({items.length})
            </button>
            <button
              type="button"
              className={`btn ${filter === "active" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setFilter("active")}
            >
              Active
            </button>
            <button
              type="button"
              className={`btn ${filter === "retired" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setFilter("retired")}
            >
              Retired
            </button>
          </div>

          <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={onRefresh} disabled={loading}>
            <i className="ti ti-refresh"></i> {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="alert alert-danger m-3 py-2 px-3 small">
          <i className="ti ti-alert-circle me-1"></i> {actionError}
        </div>
      )}

      {/* Table Container */}
      <div className="table-responsive">
        {filteredItems.length === 0 && !loading ? (
          <div className="text-center py-5 text-muted">
            <i className="ti ti-box-x fs-1 text-muted d-block mb-2"></i>
            {search.trim() ? (
              <>
                <h5 className="fw-semibold text-dark mb-1">No matches found</h5>
                <p className="small mb-0">Nothing found for "{search.trim()}" — try searching with a different keyword.</p>
              </>
            ) : (
              <>
                <h5 className="fw-semibold text-dark mb-1">{empty.title}</h5>
                <p className="small mb-0">{empty.hint}</p>
              </>
            )}
          </div>
        ) : (
          <table className="table align-middle text-nowrap table-hover mb-0">
            <thead className="table-light border-light">
              <tr className="small text-uppercase text-muted fw-semibold">
                <th style={{ width: 60 }}>Image</th>
                <th>Code</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Type / Stock</th>
                <th>Status</th>
                <th>Rental Rate</th>
                <th>Sale Price</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const pill = itemStatusPill(item.status);
                return (
                  <tr key={item.id}>
                    <td>
                      {item.photos[0] ? (
                        <button
                          type="button"
                          className="btn p-0 border-0"
                          onClick={() => setViewingPhotosOf(item)}
                          title="View Photos"
                        >
                          <img
                            src={item.photos[0]}
                            alt={item.name}
                            className="avatar avatar-md rounded border"
                            style={{ objectFit: "cover" }}
                          />
                        </button>
                      ) : (
                        <div className="avatar avatar-md rounded bg-light border d-flex align-items-center justify-content-center text-muted">
                          <i className="ti ti-photo fs-4"></i>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge bg-light text-dark font-monospace border fs-7">{item.item_code}</span>
                    </td>
                    <td>
                      <div className="fw-semibold text-dark fs-6">{item.name}</div>
                      {item.notes && (
                        <span className="text-muted fs-7 d-inline-block text-truncate" style={{ maxWidth: 200 }}>
                          {item.notes}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="badge bg-secondary-subtle text-secondary rounded-pill px-2 py-1 fs-7">
                        {item.category}
                      </span>
                    </td>
                    <td>
                      <span className="small text-muted">
                        {item.item_type === "set" ? "Set" : "Single"} ·{" "}
                        {item.tracking_type === "quantity" ? `Qty: ${item.quantity_on_hand ?? 0}` : "Unique"}
                      </span>
                    </td>
                    <td>
                      {!item.is_active ? (
                        <span className="badge bg-secondary-subtle text-secondary px-2 py-1 fs-7">Retired</span>
                      ) : (
                        <span className={`badge ${pill.className === "pill-attention" ? "bg-danger-subtle text-danger" : pill.className === "pill-active" ? "bg-success-subtle text-success" : "bg-info-subtle text-info"} px-2 py-1 fs-7`}>
                          {pill.label}
                        </span>
                      )}
                    </td>
                    <td className="fw-medium text-dark">
                      {item.rental_price != null ? `₹${item.rental_price.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="fw-medium text-dark">
                      {item.sale_price != null ? `₹${item.sale_price.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="text-end">
                      {confirmingId === item.id ? (
                        <div className="d-flex align-items-center justify-content-end gap-1">
                          <span className="small text-danger me-1">Confirm delete?</span>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => confirmDelete(item)}
                            disabled={deletingId === item.id}
                          >
                            {deletingId === item.id ? "…" : "Yes"}
                          </button>
                          <button className="btn btn-light btn-sm" onClick={() => setConfirmingId(null)}>
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="d-flex align-items-center justify-content-end gap-1">
                          <button
                            type="button"
                            className="btn btn-light btn-icon btn-sm text-primary"
                            onClick={() => onEdit(item)}
                            title="Edit Product"
                          >
                            <i className="ti ti-edit fs-5"></i>
                          </button>

                          {item.is_active ? (
                            <button
                              type="button"
                              className="btn btn-light btn-icon btn-sm text-warning"
                              onClick={() => handleRetire(item)}
                              disabled={togglingId === item.id}
                              title="Retire Item"
                            >
                              <i className="ti ti-player-pause fs-5"></i>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-light btn-icon btn-sm text-success"
                              onClick={() => handleReactivate(item)}
                              disabled={togglingId === item.id}
                              title="Reactivate Item"
                            >
                              <i className="ti ti-player-play fs-5"></i>
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn btn-light btn-icon btn-sm text-danger"
                            onClick={() => setConfirmingId(item.id)}
                            title="Delete Product"
                          >
                            <i className="ti ti-trash fs-5"></i>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {viewingPhotosOf && (
        <PhotoLightbox
          photos={viewingPhotosOf.photos}
          startIndex={0}
          onClose={() => setViewingPhotosOf(null)}
        />
      )}
    </div>
  );
}
