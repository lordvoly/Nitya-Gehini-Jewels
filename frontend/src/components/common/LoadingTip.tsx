import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { LOADING_TIPS } from "../../lib/loadingTips";

// Rendered at the top of every shared Skeleton layout (see Skeleton.tsx) —
// cycles through LOADING_TIPS while a page is loading, so a cold-start
// wait (Render's free tier can take up to ~50s to wake, see
// useSlowLoadHint) shows something worth reading instead of a silent
// shimmer. Starts on a random tip (not always index 0) so two different
// loads don't keep opening on the same one, then advances on a fixed
// timer for as long as this stays mounted. The parent unmounts this the
// moment `loading` flips false (it's only ever rendered inside a
// Skeleton), so it can never linger over real content.
const ROTATE_MS = 4500;

export function LoadingTip() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * LOADING_TIPS.length));

  useEffect(() => {
    const handle = setInterval(() => {
      setIndex((i) => (i + 1) % LOADING_TIPS.length);
    }, ROTATE_MS);
    return () => clearInterval(handle);
  }, []);

  return (
    <div className="loading-tip" aria-live="polite">
      <Lightbulb size={16} strokeWidth={2} aria-hidden="true" />
      {/* key forces a remount per tip change so the fade-in plays again —
          see .loading-tip-text's animation in shared.css. */}
      <span key={index} className="loading-tip-text">
        {LOADING_TIPS[index]}
      </span>
    </div>
  );
}
