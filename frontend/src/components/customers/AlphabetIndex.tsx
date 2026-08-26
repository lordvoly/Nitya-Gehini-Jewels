import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

// How long the strip stays up after the page stops scrolling (or a
// tap/drag on the strip itself ends) before fading back out.
const HIDE_DELAY_MS = 1200;

// Android Contacts-style A-Z scrubber: a narrow vertical strip of letters,
// fixed to the right edge, that jumps the list to a section on tap and
// scrubs through sections as you drag up/down without lifting your finger.
// Pointer Events (not separate touch/mouse handlers) so the same code
// drives both a phone drag and a desktop mouse-down-and-drag. Hidden by
// default and only revealed while the page is actively scrolling (or the
// strip itself is being touched) — otherwise it sits over list content
// all the time even for a short list that doesn't need it.
export function AlphabetIndex({ letters, onSelect }: { letters: string[]; onSelect: (letter: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [bubbleY, setBubbleY] = useState(0);
  const [visible, setVisible] = useState(false);
  // A ref, not state, because it's read-and-written synchronously within a
  // single pointer-move handler purely to dedupe onSelect calls — it never
  // itself drives a render.
  const lastLetterRef = useRef<string | null>(null);
  // Mirrors `dragging` in a ref so the scroll listener's hide-timer
  // callback (registered once, outside React's render/state cycle) can
  // check the current value without becoming stale over the effect's
  // lifetime.
  const draggingRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleHide() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!draggingRef.current) setVisible(false);
    }, HIDE_DELAY_MS);
  }

  useEffect(() => {
    function handleScroll() {
      setVisible(true);
      scheduleHide();
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  function letterAtY(clientY: number): string | null {
    const el = containerRef.current;
    if (!el || letters.length === 0) return null;
    const rect = el.getBoundingClientRect();
    const relative = Math.min(Math.max(clientY - rect.top, 0), rect.height - 1);
    const index = Math.min(Math.floor((relative / rect.height) * letters.length), letters.length - 1);
    return letters[index];
  }

  function updateFromClientY(clientY: number) {
    const letter = letterAtY(clientY);
    if (!letter) return;
    setActiveLetter(letter);
    setBubbleY(clientY);
    if (letter !== lastLetterRef.current) {
      lastLetterRef.current = letter;
      onSelect(letter);
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // Capture so a finger sliding slightly off this narrow strip keeps
    // scrubbing instead of losing the drag — guarded because some
    // browsers throw if the pointer session isn't in a capturable state
    // (e.g. certain synthetic/automated input paths), which shouldn't
    // block the tap-to-jump behavior below.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Fall through — dragging still works via native hover/move as long
      // as the pointer stays over the strip, just without capture.
    }
    draggingRef.current = true;
    setDragging(true);
    // A tap/drag can start without a preceding scroll (once the strip is
    // already up), and must not fade out mid-interaction.
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setVisible(true);
    updateFromClientY(e.clientY);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    updateFromClientY(e.clientY);
  }

  function handlePointerEnd() {
    draggingRef.current = false;
    setDragging(false);
    setActiveLetter(null);
    lastLetterRef.current = null;
    scheduleHide();
  }

  if (letters.length < 2) return null;

  return (
    <>
      <div
        ref={containerRef}
        className={`alpha-index${visible ? " visible" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {letters.map((letter) => (
          <span key={letter} className={`alpha-index-letter${activeLetter === letter ? " active" : ""}`}>
            {letter}
          </span>
        ))}
      </div>
      {dragging && activeLetter && (
        <div className="alpha-index-bubble" style={{ top: bubbleY }} aria-hidden="true">
          {activeLetter}
        </div>
      )}
    </>
  );
}
