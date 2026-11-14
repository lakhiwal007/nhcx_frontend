import { useRef, useState } from "react";

// The open item of a checklist-and-detail case step. `picked` is null until staff
// choose or act on an item, so the screen follows its own first item until then.
export function useCasePane(initial = null) {
  const [picked, setPicked] = useState(initial);
  const paneRef = useRef(null);
  const openItem = (id) => {
    setPicked(id);
    // On a narrow screen the detail sits under the checklist, out of sight.
    if (window.matchMedia("(max-width: 900px)").matches) paneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return { picked, setPicked, paneRef, openItem };
}

// A settled, moved-on or view-only case has nothing left for staff to do, so its
// rows state the record instead of asking for action.
export const asRecord = (row) => {
  if (!row || (row.tone !== "warn" && row.tone !== "bad")) return row;
  return { ...row, tone: "idle", fact: row.fact === "Choose one" ? "None chosen" : row.fact };
};
