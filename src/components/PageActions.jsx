import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

// The top bar holds a slot for the current screen's actions (Refresh, New case,
// Message payer…) so screens don't spend a row of their own on a header.
// App.jsx provides the slot element; a screen renders <PageActions>…</PageActions>.
// eslint-disable-next-line react-refresh/only-export-components
export const PageActionsSlot = createContext(null);

export default function PageActions({ children }) {
  const slot = useContext(PageActionsSlot);
  return slot ? createPortal(children, slot) : null;
}
