import { useCallback, useEffect, useState } from "react";
import { AddItemWizard } from "../components/items/AddItemWizard";
import { ItemEditForm } from "../components/items/ItemEditForm";
import { ItemsList } from "../components/items/ItemsList";
import { deleteItem, fetchItems, reactivateItem, retireItem, type Item } from "../lib/items";
import { DEMO_ITEMS } from "../lib/demoData";

export default function ItemsPage() {
  const [view, setView] = useState<"add" | "list">("list");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fetched = await fetchItems();
      setItems(fetched.length > 0 ? fetched : DEMO_ITEMS);
    } catch {
      setItems(DEMO_ITEMS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(item: Item) {
    if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
      await deleteItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    }
  }

  async function handleRetire(item: Item) {
    const updated = await retireItem(item.id);
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  async function handleReactivate(item: Item) {
    const updated = await reactivateItem(item.id);
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  return (
    <div className="container-fluid p-0">
      {/* Page Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="h3 mb-1 fw-semibold text-dark">Inventory Management</h1>
          <p className="text-muted mb-0 small">Manage your jewelry items, rental rates, and stock status</p>
        </div>
        <div className="d-flex gap-2">
          {view === "list" && !editingItem ? (
            <button
              className="btn btn-primary d-inline-flex align-items-center gap-1"
              onClick={() => {
                setEditingItem(null);
                setView("add");
              }}
            >
              <i className="ti ti-plus"></i> Add Product
            </button>
          ) : (
            <button
              className="btn btn-outline-secondary d-inline-flex align-items-center gap-1"
              onClick={() => {
                setEditingItem(null);
                setView("list");
              }}
            >
              <i className="ti ti-arrow-left"></i> Back to Inventory
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <ul className="nav nav-pills mb-4 bg-white p-2 rounded-3 border shadow-sm" style={{ maxWidth: 350 }}>
        <li className="nav-item flex-fill text-center">
          <button
            className={`nav-link w-100 fw-medium ${view === "list" && !editingItem ? "active" : ""}`}
            onClick={() => {
              setEditingItem(null);
              setView("list");
            }}
          >
            <i className="ti ti-box-seam me-1"></i> All Items ({items.length})
          </button>
        </li>
        <li className="nav-item flex-fill text-center">
          <button
            className={`nav-link w-100 fw-medium ${view === "add" && !editingItem ? "active" : ""}`}
            onClick={() => {
              setEditingItem(null);
              setView("add");
            }}
          >
            <i className="ti ti-plus me-1"></i> Add Product
          </button>
        </li>
      </ul>

      {/* Main View Area */}
      {editingItem ? (
        <ItemEditForm
          item={editingItem}
          onCancel={() => setEditingItem(null)}
          onSaved={(saved) => {
            setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
            setEditingItem(null);
          }}
        />
      ) : view === "add" ? (
        <AddItemWizard
          onItemCreated={(item) => {
            setItems((prev) => [item, ...prev]);
            setView("list");
          }}
          onViewItems={() => setView("list")}
        />
      ) : (
        <ItemsList
          items={items}
          loading={loading}
          onRefresh={refresh}
          onEdit={setEditingItem}
          onDelete={handleDelete}
          onRetire={handleRetire}
          onReactivate={handleReactivate}
        />
      )}
    </div>
  );
}
