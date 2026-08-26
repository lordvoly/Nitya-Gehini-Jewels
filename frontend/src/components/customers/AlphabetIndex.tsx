import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

// Android Contacts-style A-Z scrubber: a narrow vertical strip of letters,
// fixed to the right edge, that jumps the list to a section on tap and
// scrubs through sections as you drag up/down without lifting your finger.
// Pointer Events (not separate touch/mouse handlers) so the same code
// drives both a phone drag and a desktop mouse-down-and-drag.
export function AlphabetIndex({ letters, onSelect }: { letters: string[]; onSelect: (letter: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [bubbleY, setBubbleY] = useState(0);
  // A ref, not state, because it's read-and-written synchronously within a
  // single pointer-move handler purely to dedupe onSelect calls — it never
  // itself drives a render.
  const lastLetterRef = useRef<string | null>(null);

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
    setDragging(true);
    updateFromClientY(e.clientY);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    updateFromClientY(e.clientY);
  }

  function handlePointerEnd() {
    setDragging(false);
    setActiveLetter(null);
    lastLetterRef.current = null;
  }

  if (letters.length < 2) return null;

  return (
    <>
      <div
        ref={containerRef}
        className="alpha-index"
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
