import type { ReactNode } from "react";
import { createPortal } from "react-dom";

// Rendered via a portal into document.body — not just for stacking/overflow,
// but because a modal can contain its own <form> (e.g. AddCustomerForm), and
// if it stayed a DOM descendant of a caller's <form> (e.g. the booking
// form), that's an invalid nested-<form> and the browser mishandles submit
// events (a native full-page submit instead of React's onSubmit), wiping
// all form state.
export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
