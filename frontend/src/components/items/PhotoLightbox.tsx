import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";

// Full-size photo viewer for an item's thumbnail — built on the same shared
// Modal used by AddCustomerForm/CustomerPicker rather than a one-off overlay.
export function PhotoLightbox({
  photos,
  startIndex,
  onClose,
}: {
  photos: string[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const multi = photos.length > 1;

  function showPrev() {
    setIndex((i) => (i - 1 + photos.length) % photos.length);
  }
  function showNext() {
    setIndex((i) => (i + 1) % photos.length);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (multi && e.key === "ArrowLeft") showPrev();
      if (multi && e.key === "ArrowRight") showNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi, onClose]);

  return (
    <Modal onClose={onClose}>
      <div className="lightbox-image-wrap">
        <img src={photos[index]} alt={`Item photo ${index + 1} of ${photos.length}`} className="lightbox-image" />
        {multi && (
          <span className="lightbox-counter">
            {index + 1} / {photos.length}
          </span>
        )}
      </div>
      <div className="lightbox-controls">
        {multi && (
          <button type="button" className="btn-secondary" onClick={showPrev} aria-label="Previous photo">
            ‹ Prev
          </button>
        )}
        <button type="button" className="btn-primary" onClick={onClose}>
          Close
        </button>
        {multi && (
          <button type="button" className="btn-secondary" onClick={showNext} aria-label="Next photo">
            Next ›
          </button>
        )}
      </div>
    </Modal>
  );
}
