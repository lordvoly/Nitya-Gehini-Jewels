import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AddItemWizard } from "../components/items/AddItemWizard";
import { ItemEditForm } from "../components/items/ItemEditForm";
import { ItemsList, type ItemsFilter } from "../components/items/ItemsList";
import { deleteItem, fetchItems, reactivateItem, retireItem, type Item } from "../lib/items";
import "../styles/shared.css";

export default function ItemsPage() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<"add" | "list">("list");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  // Deep link from elsewhere (e.g. the Dashboard's "Active items" card):
  // /items?filter=active. Read once on mount, same as BookingsPage's
  // ?booking= pattern — only meant to set the list's initial filter, not
  // fight the user if they change it afterward.
  const filterParam = searchParams.get("filter");
  const initialFilter: ItemsFilter = filterParam === "active" || filterParam === "retired" ? filterParam : "all";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchItems());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(item: Item) {
    await deleteItem(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
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
    <div className="page">
      <div className="page-tabs">
        <button
          className={view === "add" && !editingItem ? "tab active" : "tab"}
          onClick={() => {
            setEditingItem(null);
            setView("add");
          }}
        >
          + Add Item
        </button>
        <button
          className={view === "list" || editingItem ? "tab active" : "tab"}
          onClick={() => {
            setEditingItem(null);
            setView("list");
          }}
        >
          All Items ({items.length})
        </button>
      </div>

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
          onItemCreated={(item) => setItems((prev) => [item, ...prev])}
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
          initialFilter={initialFilter}
        />
      )}
    </div>
  );
}
