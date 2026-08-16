import { useEffect, useRef, useState } from "react";

// A compact "Label: Current Value ▾" trigger that opens a small anchored
// menu of options — the collapsed-bar alternative to a row of always-
// visible toggle buttons (BookingsList's Show/Sort/Time controls). Purely
// presentational: it owns open/closed state and its own outside-click/
// Escape handling, but never touches the underlying filter value itself —
// the caller's onChange is the only thing that changes what's selected, so
// dismissing the menu (outside click or Escape) never applies anything.
export function FilterDropdown<T extends string>({
  label,
  value,
  options,
  optionLabels,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  optionLabels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  // Menus default to left-aligned under the trigger; the rightmost trigger
  // in a row would otherwise push its menu off the right edge on a narrow
  // viewport, so this flips to right-aligned once actually measured to
  // overflow — not guessed from position in the row, since that'd break
  // the moment the buttons' widths or order change.
  const [alignRight, setAlignRight] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) setAlignRight(true);
  }, [open]);

  function toggle() {
    setAlignRight(false);
    setOpen((o) => !o);
  }

  return (
    <div className="filter-dropdown" ref={wrapperRef}>
      <button type="button" className="filter-dropdown-trigger" onClick={toggle} aria-expanded={open} aria-haspopup="menu">
        <span className="filter-dropdown-trigger-text">
          {label}: {optionLabels[value]}
        </span>
        <span className="filter-dropdown-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className={`filter-dropdown-menu${alignRight ? " filter-dropdown-menu-right" : ""}`} ref={menuRef} role="menu">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="menuitemradio"
              aria-checked={opt === value}
              className={opt === value ? "filter-dropdown-option active" : "filter-dropdown-option"}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              {optionLabels[opt]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
