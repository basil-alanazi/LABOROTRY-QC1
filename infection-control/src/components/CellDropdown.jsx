import { useEffect } from "react";
import { createPortal } from "react-dom";

// A click-to-open dropdown anchored to a specific table cell's on-screen
// position (top/left are computed by the caller from the trigger
// button's getBoundingClientRect()). It renders through a portal to
// <body> instead of positioning relative to the cell itself, because the
// Employee Clinic grid's own scroll container clips anything absolutely
// positioned inside it that extends past the table's current height —
// the dropdown would be in the DOM but invisible. Closes on an outside
// click, Escape, or any scroll (its position isn't recalculated while
// open, so a scroll would otherwise leave it floating over the wrong
// cell).
export default function CellDropdown({ top, left, width = 288, onClose, children }) {
  useEffect(() => {
    function handleScroll() {
      onClose();
    }
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl"
        style={{ top, left, width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
