import { useEffect, useState } from "react";

// True once `loading` has been true for longer than `delayMs`. Render's
// free tier spins the backend down after a period of inactivity — the
// first request after that can take up to ~50s, long enough that a
// skeleton sitting still with no explanation starts to look broken rather
// than "in progress". This lets a page show a "waking up" reassurance only
// once a load is genuinely taking a while, not on every normal sub-second
// load where it would just be noise.
export function useSlowLoadHint(loading: boolean, delayMs = 6000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const handle = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(handle);
  }, [loading, delayMs]);

  return slow;
}
