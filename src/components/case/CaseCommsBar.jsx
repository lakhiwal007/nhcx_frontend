import { MessageSquare, AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../Common";
import { formatRelative } from "../../format.js";
import { commHeadline, commPreview } from "../CommunicationDetail";

export default function CaseCommsBar({ communications = [], onOpen }) {
  const unread = communications.filter((c) => !c.provider_read);
  const actionable = communications.filter((c) => c.pending_tasks?.length > 0);
  // Unread first, then anything still needing action, then the thread itself.
  // A case whose messages have all been read still has payer correspondence
  // worth reaching from any stage — hiding the bar outright loses it.
  const surfaced =
    unread.length > 0 ? unread : actionable.length > 0 ? actionable : communications;

  if (surfaced.length === 0) return null;

  const latest = [...surfaced].sort(
    (a, b) => (Date.parse(b.sent_at) || 0) - (Date.parse(a.sent_at) || 0),
  )[0];
  const needsAction = actionable.length > 0;
  const preview = commPreview(latest);

  return (
    <AnimatePresence>
      <motion.div
        className={`cx-commsbar${needsAction ? " is-action" : ""}`}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
      >
        <span className="cx-commsbar-icon" aria-hidden="true">
          {needsAction ? <AlertTriangle size={16} /> : <MessageSquare size={16} />}
        </span>

        <div className="cx-commsbar-body">
          <div className="cx-commsbar-head">
            <strong>
              {unread.length > 0
                ? `${unread.length} unread message${unread.length > 1 ? "s" : ""} from the payer`
                : actionable.length > 0
                  ? `${actionable.length} message${actionable.length > 1 ? "s" : ""} needing action`
                  : `${surfaced.length} message${surfaced.length > 1 ? "s" : ""} with the payer`}
            </strong>
            {needsAction && <span className="cx-commsbar-flag">Action required</span>}
            <span className="cx-commsbar-time">
              <Clock size={11} /> {formatRelative(latest.sent_at)}
            </span>
          </div>
          <div className="cx-commsbar-latest">
            <span className="cx-commsbar-topic">{commHeadline(latest)}</span>
            {preview && <span className="cx-commsbar-preview">{preview}</span>}
          </div>
          {surfaced.length > 1 && (
            <div className="cx-commsbar-rest">
              {surfaced
                .filter((c) => c.correlation_id !== latest.correlation_id)
                .slice(0, 3)
                .map((c) => (
                  <button
                    type="button"
                    key={c.correlation_id}
                    className="cx-commsbar-chip"
                    onClick={() => onOpen(c.correlation_id)}
                  >
                    {commHeadline(c)}
                    <ChevronRight size={11} />
                  </button>
                ))}
            </div>
          )}
        </div>

        <Button
          variant={needsAction ? "primary" : "outline"}
          size="small"
          onClick={() => onOpen(latest.correlation_id)}
        >
          {needsAction ? "Review & Act" : "Review"}
        </Button>
      </motion.div>
    </AnimatePresence>
  );
}
