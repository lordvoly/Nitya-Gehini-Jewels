import { useState } from "react";
import type { Item } from "../../lib/items";

export function ItemsList({
  items,
  loading,
  onRefresh,
  onEdit,
  onDelete,
}: {
  items: Item[];
  loading: boolean;
  onRefresh: () => void;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => Promise<void>;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete(item: Item) {
    setDeletingId(item.id);
    setDeleteError(null);
    try {
      await onDelete(item);
      setConfirmingId(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete item");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="items-list">
      <div className="items-list-header">
        <h2>All Items ({items.length})</h2>
        <button className="btn-secondary" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {deleteError && <p className="wizard-error">{deleteError}</p>}
      {items.length === 0 && !loading && <p>No items yet — add your first one.</p>}
      {items.length > 0 && (
        <div className="items-table-wrap">
          <table className="items-table">
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
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.photos[0] && <img src={item.photos[0]} alt="" className="row-thumb" />}</td>
                  <td>{item.item_code}</td>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td>
                    {item.item_type === "set" ? "Set" : "Single"} ·{" "}
                    {item.tracking_type === "quantity" ? `Qty ${item.quantity_on_hand ?? 0}` : "Unique"}
                  </td>
                  <td>{item.status.replace("_", " ")}</td>
                  <td>{item.rental_price != null ? `₹${item.rental_price}` : "—"}</td>
                  <td>{item.sale_price != null ? `₹${item.sale_price}` : "—"}</td>
                  <td className="row-actions">
                    {confirmingId === item.id ? (
                      <>
                        <span>Delete?</span>
                        <button
                          className="btn-secondary"
                          onClick={() => confirmDelete(item)}
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id ? "…" : "Yes"}
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
                        <button className="btn-secondary" onClick={() => setConfirmingId(item.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
