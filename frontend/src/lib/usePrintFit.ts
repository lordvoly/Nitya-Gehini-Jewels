import { useEffect, type RefObject } from "react";

// Target height in CSS px for the printed receipt. Deliberately well
// under one real page (A4 ~1046px / US Letter ~980px of printable height
// at 96dpi with the 10mm @page margin) because `zoom` rewraps text as it
// shrinks and the final height lands a few percent above this estimate.
const TARGET_PX = 820;
// Floor on the shrink so a receipt never becomes unreadable. Even at this
// floor nothing is ever hidden — `zoom` reflows, it doesn't clip — a
// pathologically large booking would just run a little past one page.
const MIN_ZOOM = 0.6;

// Keeps a printed receipt to one page. Just before printing it measures
// the receipt's natural height (toolbar excluded) and, if that is over a
// page, sets a CSS `zoom` so the whole thing reflows smaller. `zoom` is
// used rather than `transform: scale()` + an overflow-clipped box: the
// clipped-box approach hid the QR / footer in some PDFs, whereas `zoom`
// physically reflows the layout so every part of the receipt is always
// rendered, just at a smaller size. Cleared again after printing.
export function usePrintFit(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const reset = () => {
      ref.current?.style.removeProperty("zoom");
    };

    const fit = () => {
      const el = ref.current;
      if (!el) return;
      el.style.removeProperty("zoom");

      // The .no-print toolbar is still in flow during `beforeprint`
      // (print styles haven't applied yet); exclude it from the measure
      // so we don't shrink to compensate for something that won't be on
      // the printed page.
      const hidden = Array.from(el.querySelectorAll<HTMLElement>(".no-print"));
      const prevDisplay = hidden.map((n) => n.style.display);
      hidden.forEach((n) => (n.style.display = "none"));
      const natural = el.scrollHeight;
      hidden.forEach((n, i) => (n.style.display = prevDisplay[i]));

      if (natural > TARGET_PX) {
        el.style.setProperty("zoom", String(Math.max(MIN_ZOOM, TARGET_PX / natural)));
      }
    };

    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);
    // Safari has no before/afterprint — it toggles a `print` media query.
    const mql = window.matchMedia("print");
    const onChange = (e: MediaQueryListEvent) => (e.matches ? fit() : reset());
    mql.addEventListener?.("change", onChange);

    return () => {
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", reset);
      mql.removeEventListener?.("change", onChange);
      reset();
    };
  }, [ref]);
}
