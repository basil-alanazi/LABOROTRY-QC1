import { useEffect } from "react";
import { createPortal } from "react-dom";

// Renders children directly on <body>, outside #root. While mounted, it
// marks <body> with data-print-portal, which index.css's @media print
// rule uses to hide #root entirely at print time (not just make it
// invisible). That way a single printed card is unaffected by the
// on-screen modal's own print:hidden wrapper and isn't laid out behind
// or alongside the rest of the single-page app, so it prints as its own
// one-page document instead of being duplicated across however many
// pages the hidden app behind it would have spanned.
export default function PrintPortal({ children }) {
  useEffect(() => {
    document.body.setAttribute("data-print-portal", "true");
    return () => document.body.removeAttribute("data-print-portal");
  }, []);
  return createPortal(<div className="hidden print:block">{children}</div>, document.body);
}
