import { useMemo, useState } from "react";
import type { Item } from "../../lib/items";
import { itemStatusPill } from "../../lib/statusPill";
import { PhotoLightbox } from "./PhotoLightbox";

export type ItemsFilter = "all" | "active" | "retired";
type Filter = ItemsFilter;

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
  initialFilter = "all",
}: {
  items: Item[];
  loading: boolean;
  onRefresh: () => void;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => Promise<void>;
  onRetire: (item: Item) => Promise<void>;
  onReactivate: (item: Item) => Promise<void>;
  initialFilter?: ItemsFilter;
}) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
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
      // Matches on code OR name, and never stops at the first hit — two
      // items sharing a name (or a near-miss) both surface, each with its
      // own code right there in the row, so the operator can tell them
      // apart rather than guessing which one they meant.
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
    <div>
      <div className="list-header">
        <h2>Items ({filteredItems.length})</h2>
        <button className="btn-secondary" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <input
        className="search-input"
        type="text"
        placeholder="Search by name or code…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="toggle-group filter-group">
        <button className={filter === "all" ? "toggle-btn active" : "toggle-btn"} onClick={() => setFilter("all")}>
          All
        </button>
        <button
          className={filter === "active" ? "toggle-btn active" : "toggle-btn"}
          onClick={() => setFilter("active")}
        >
          Active
        </button>
        <button
          className={filter === "retired" ? "toggle-btn active" : "toggle-btn"}
          onClick={() => setFilter("retired")}
        >
          Retired
        </button>
      </div>

      {actionError && <p className="wizard-error">{actionError}</p>}

      {filteredItems.length === 0 && !loading && (
        <div className="empty-state">
          {search.trim() ? (
            <>
              <h3>No matches</h3>
              <p>Nothing found for "{search.trim()}" — try just the code, or part of the name.</p>
            </>
          ) : (
            <>
              <h3>{empty.title}</h3>
              <p>{empty.hint}</p>
            </>
          )}
        </div>
      )}

      {filteredItems.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Type</th>
                <th>Status</th>
                <th>Rental</th>
                <th>Sale</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const pill = itemStatusPill(item.status);
                return (
                  <tr key={item.id}>
                    <td>
                      {item.photos[0] && (
                        <button
                          type="button"
                          className="thumb-button"
                          onClick={() => setViewingPhotosOf(item)}
                          aria-label={`View photos of ${item.name}`}
                        >
                          <img src={item.photos[0]} alt="" className="row-thumb" />
                        </button>
                      )}
                    </td>
                    <td data-label="Code">{item.item_code}</td>
                    <td data-label="Name">{item.name}</td>
                    <td data-label="Category">{item.category}</td>
                    <td data-label="Type">
                      {item.item_type === "set" ? "Set" : "Single"} ·{" "}
                      {item.tracking_type === "quantity" ? `Qty ${item.quantity_on_hand ?? 0}` : "Unique"}
                    </td>
                    <td data-label="Status">
                      {!item.is_active ? (
                        <span className="pill pill-neutral">Retired</span>
                      ) : (
                        <span className={`pill ${pill.className}`}>{pill.label}</span>
                      )}
                    </td>
                    <td data-label="Rental">{item.rental_price != null ? `₹${item.rental_price}` : "—"}</td>
                    <td data-label="Sale">{item.sale_price != null ? `₹${item.sale_price}` : "—"}</td>
                    <td className="row-actions">
                      {confirmingId === item.id ? (
                        <>
                          <span>Delete this item?</span>
                          <button
                            className="btn-danger"
                            onClick={() => confirmDelete(item)}
                            disabled={deletingId === item.id}
                          >
                            {deletingId === item.id ? "…" : "Yes, Delete"}
                          </button>
                          <button className="btn-secondary" onClick={() => setConfirmingId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn-secondary" onClick={() => onEdit(item)}>
                            Edit
                          </button>
                          {item.is_active ? (
                            <button
                              className="btn-secondary"
                              onClick={() => handleRetire(item)}
                              disabled={togglingId === item.id}
                            >
                              {togglingId === item.id ? "…" : "Retire"}
                            </button>
                          ) : (
                            <button
                              className="btn-secondary"
                              onClick={() => handleReactivate(item)}
                              disabled={togglingId === item.id}
                            >
                              {togglingId === item.id ? "…" : "Reactivate"}
                            </button>
                          )}
                          <button className="btn-danger" onClick={() => setConfirmingId(item.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
