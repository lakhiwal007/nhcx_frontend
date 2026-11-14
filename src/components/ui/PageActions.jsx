import { useContext } from "react";
import { createPortal } from "react-dom";
import { PageActionsSlot } from "../../lib/pageActions";

export default function PageActions({ children }) {
  const slot = useContext(PageActionsSlot);
  return slot ? createPortal(children, slot) : null;
}
