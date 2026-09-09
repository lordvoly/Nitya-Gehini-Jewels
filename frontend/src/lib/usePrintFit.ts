import { useEffect, type RefObject } from "react";

// One portrait page's usable height in CSS px. A4 minus the 10mm @page
// margin (see shared.css's @media print) is ~1046px at 96dpi and US
// Letter ~980px; 850 clears both even with the browser's optional
// header/footer strip enabled.
const TARGET_PX = 850;
// Floor on the shrink so a receipt never becomes unreadable. 0.4 still
// keeps a ~2100px receipt (roughly 6 fully-detailed line items) on one
// page; only a booking bigger than that would begin to spill, which is
// well beyond anything this shop produces.
const MIN_SCALE = 0.4;

// Keeps a printed receipt on exactly one page. `ref` is the outer
// .receipt-page; it wraps a single .receipt-fit child holding all the
// content. Just before printing this measures .receipt-fit's natural
// height and, if it exceeds one page, scales it down with
// `transform: scale()` (exact, since transform doesn't reflow) while
// pinning the outer .receipt-page to the resulting visual height with
// overflow:hidden — so the browser paginates it as one page instead of
// spilling onto a second sheet. Everything is cleared again after
// printing so the on-screen view is never left scaled.
export function usePrintFit(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const reset = () => {
      const outer = ref.current;
      const inner = outer?.querySelector<HTMLElement>(".receipt-fit");
      if (inner) {
        inner.style.removeProperty("transform");
        inner.style.removeProperty("transform-origin");
      }
      if (outer) {
        outer.style.removeProperty("height");
        outer.style.removeProperty("overflow");
      }
    };

    const fit = () => {
      const outer = ref.current;
      const inner = outer?.querySelector<HTMLElement>(".receipt-fit");
      if (!outer || !inner) return;
      reset();

      // The .no-print toolbar is still in flow during `beforeprint`
      // (print styles haven't applied yet); hide it just for the measure
      // so we don't over-shrink to compensate for something that won't
      // actually be on the page.
      const hidden = Array.from(inner.querySelectorAll<HTMLElement>(".no-print"));
      const prevDisplay = hidden.map((n) => n.style.display);
      hidden.forEach((n) => (n.style.display = "none"));
      const natural = inner.scrollHeight;
      hidden.forEach((n, i) => (n.style.display = prevDisplay[i]));

      if (natural > TARGET_PX) {
        const scale = Math.max(MIN_SCALE, TARGET_PX / natural);
        inner.style.transformOrigin = "top center";
        inner.style.transform = `scale(${scale})`;
        void inner.offsetHeight; // flush before measuring the transformed box

        // Pin the outer box to the transformed content's real height plus
        // the outer's own padding (the inner still occupies `natural` px
        // in layout — transform doesn't change that — so without the pin
        // it would reserve a second page; overflow:hidden trims the
        // leftover). getBoundingClientRect DOES reflect a transform.
        const scaledContent = inner.getBoundingClientRect().height;
        const cs = getComputedStyle(outer);
        const pad = parseFloat(cs.paddingTop || "0") + parseFloat(cs.paddingBottom || "0");
        outer.style.height = `${Math.ceil(scaledContent + pad) + 2}px`;
        outer.style.overflow = "hidden";
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
