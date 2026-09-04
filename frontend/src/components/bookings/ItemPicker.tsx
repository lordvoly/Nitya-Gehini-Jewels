import { useEffect, useRef, useState } from "react";
import type { Item } from "../../lib/items";

const MAX_RESULTS = 25;

function itemLabel(item: Item): string {
  const suffix = item.tracking_type === "quantity" ? ` (${item.quantity_on_hand ?? 0} on hand)` : "";
  return `${item.item_code} — ${item.name}${suffix}`;
}

// Hybrid combobox — a real dropdown to browse the full eligible list (the
// old <select>'s "quick pick" behavior), but with a text field over it that
// narrows the list live as soon as the operator starts typing. Filters
// client-side (like ItemsList's own search) since the eligible items list
// is already fully loaded on the booking form — no backend round-trip
// needed. Opening the dropdown always starts from the full list (query
// resets to "" on focus) so browsing is never blocked by whatever was
// previously selected. Same anchored-menu/outside-click/Escape pattern as
// FilterDropdown (common/FilterDropdown.tsx), just full-width and
// scrollable instead of that one's compact fixed option set.
export function ItemPicker({
  items,
  selected,
  onSelect,
}: {
  items: Item[];
  selected: Item | null;
  onSelect: (itemId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const trimmed = query.trim().toLowerCase();
  const results = trimmed
    ? items.filter((i) => i.item_code.toLowerCase().includes(trimmed) || i.name.toLowerCase().includes(trimmed))
    : items;
  const shown = results.slice(0, MAX_RESULTS);

  return (
    <div className="combo-picker" ref={wrapperRef}>
      <div className="combo-picker-field">
        <input
          className="search-input"
          type="text"
          placeholder="Search or select an item…"
          value={open ? query : selected ? itemLabel(selected) : ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        />
        {selected && !open && (
          <button
            type="button"
            className="combo-picker-clear"
            aria-label="Clear selected item"
            onClick={() => onSelect("")}
          >
            ×
          </button>
        )}
      </div>
      {open &&
        (shown.length > 0 ? (
          <div className="combo-picker-menu" role="listbox">
            {shown.map((i) => (
              <button
                type="button"
                key={i.id}
                className="combo-picker-option"
                role="option"
                aria-selected={i.id === selected?.id}
                onClick={() => {
                  onSelect(i.id);
                  setOpen(false);
                }}
              >
                {itemLabel(i)}
              </button>
            ))}
            {results.length > shown.length && (
              <p className="wizard-hint combo-picker-hint">
                {results.length - shown.length} more match{results.length - shown.length === 1 ? "" : "es"} — keep
                typing to narrow it down.
              </p>
            )}
          </div>
        ) : (
          <div className="combo-picker-menu">
            <p className="wizard-hint combo-picker-hint">No items match "{query}".</p>
          </div>
        ))}
    </div>
  );
}
