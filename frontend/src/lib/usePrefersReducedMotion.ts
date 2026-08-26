import { useEffect, useState } from "react";

// The two recharts-based charts (Most-Booked's bars, Revenue Trend's
// area) animate on mount via recharts' own isAnimationActive prop —
// SVG attribute interpolation the app's existing CSS-only
// prefers-reduced-motion block (shared.css) can't reach, so this is a
// second, JS-level way of reading the same OS-level signal, same
// live-toggle behavior confirmed for the CSS version in an earlier
// session (SystemParametersInfo/SPI_SETCLIENTAREAANIMATION, not just
// DevTools emulation).
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}
