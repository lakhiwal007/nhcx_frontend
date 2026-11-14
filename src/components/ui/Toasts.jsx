import { useSyncExternalStore } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { getToasts, subscribeToasts, toast } from "../../lib/toast";

const ICONS = { success: CheckCircle2, info: Info, error: AlertCircle };
const TONE_CLASS = { success: "is-ok", info: "is-info", error: "is-bad" };

function Toast({ item }) {
  const Icon = ICONS[item.tone] || Info;
  return (
    <div className={`toast ${TONE_CLASS[item.tone] || ""}`}>
      <Icon size={16} className="toast-icon" aria-hidden="true" />
      <div className="toast-text">
        {item.message}
        {item.count > 1 && <span className="toast-count"> (×{item.count})</span>}
      </div>
      <button type="button" className="toast-close" onClick={() => toast.dismiss(item.id)} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

export default function Toasts() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  const quiet = items.filter((t) => t.tone !== "error");
  const loud = items.filter((t) => t.tone === "error");
  return (
    <div className="toasts">
      <div role="status" aria-live="polite" className="toasts-group">
        {quiet.map((item) => <Toast key={item.id} item={item} />)}
      </div>
      <div role="alert" className="toasts-group">
        {loud.map((item) => <Toast key={item.id} item={item} />)}
      </div>
    </div>
  );
}
