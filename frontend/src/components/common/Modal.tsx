import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return createPortal(
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0 shadow-lg rounded-3">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
