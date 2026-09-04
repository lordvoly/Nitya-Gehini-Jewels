import { useState } from "react";
import type { Item } from "../../lib/items";

const MAX_RESULTS = 25;

function itemLabel(item: Item): string {
  const suffix = item.tracking_type === "quantity" ? ` (${item.quantity_on_hand ?? 0} on hand)` : "";
  return `${item.item_code} — ${item.name}${suffix}`;
}

// Same search-first pattern as CustomerPicker, but filtered client-side
// (like ItemsList's own search) since the eligible items list is already
// fully loaded on the booking form — no backend round-trip needed.
export function ItemPicker({
  items,
  selected,
  onSelect,
}: {
  items: Item[];
  selected: Item | null;
  onSelect: (itemId: string) => void;
}) {
  const [term, setTerm] = useState("");

  if (selected) {
    return (
      <div className="found-panel">
        <p>
          <strong>{itemLabel(selected)}</strong>
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setTerm("");
            onSelect("");
          }}
        >
          Change Item
        </button>
      </div>
    );
  }

  const query = term.trim().toLowerCase();
  const results = query
    ? items.filter((i) => i.item_code.toLowerCase().includes(query) || i.name.toLowerCase().includes(query))
    : items;
  const shown = results.slice(0, MAX_RESULTS);

  return (
    <div>
      <input
        className="search-input"
        type="text"
        placeholder="Search item by name or code…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      {shown.length > 0 ? (
        <div className="option-list">
          {shown.map((i) => (
            <button type="button" key={i.id} className="toggle-btn" onClick={() => onSelect(i.id)}>
              {itemLabel(i)}
            </button>
          ))}
          {results.length > shown.length && (
            <p className="wizard-hint">
              {results.length - shown.length} more match{results.length - shown.length === 1 ? "" : "es"} — keep
              typing to narrow it down.
            </p>
          )}
        </div>
      ) : (
        <p className="wizard-hint">No items match "{term}".</p>
      )}
    </div>
  );
}
