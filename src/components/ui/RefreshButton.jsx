import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatTime } from "../../lib/format.js";

const HINT = "Reads the latest. Nothing is sent to the payer.";

export default function RefreshButton({ onClick, busy = false, at = null, iconOnly = false, label = "Refresh", title, className = "" }) {
  const [running, setRunning] = useState(false);
  const spinning = busy || running;

  const run = async (event) => {
    event.stopPropagation();
    if (spinning) return;
    setRunning(true);
    try {
      await onClick?.();
    } finally {
      setRunning(false);
    }
  };

  const hint = [title || HINT, at ? `Updated ${formatTime(new Date(at))}.` : null].filter(Boolean).join(" ");

  return (
    <button type="button" className={`refresh-btn${iconOnly ? " is-icon" : ""}${spinning ? " is-busy" : ""} ${className}`.trim()} onClick={run} disabled={spinning} title={hint} aria-label={iconOnly ? label : undefined}>
      <RefreshCw size={iconOnly ? 14 : 15} aria-hidden="true" />
      {!iconOnly && (spinning ? "Refreshing…" : label)}
    </button>
  );
}
