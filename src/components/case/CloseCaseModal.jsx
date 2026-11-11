import { useState } from "react";
import { api, markHandled } from "../../api";
import ConfirmModal from "../ConfirmModal";
import Dropdown from "../Dropdown";
import { formatCaseRef } from "../../format.js";
import { CLOSE_REASONS } from "./closeReasons.js";

const NOTE_MAX = 500;

export default function CloseCaseModal({ open, caseId, blocker, onClose, onClosed }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const cancel = () => {
    setError(null);
    onClose();
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.closeCase(caseId, { reason, note: note.trim() || undefined });
      setReason("");
      setNote("");
      onClosed();
    } catch (err) {
      markHandled(err);
      setError(err?.message || "The case could not be closed.");
    } finally {
      setBusy(false);
    }
  };

  if (blocker) {
    return (
      <ConfirmModal open={open} title={`${formatCaseRef(caseId)} cannot be closed yet`} confirmLabel="OK" cancelLabel="Back" onCancel={cancel} onConfirm={cancel}>
        <p className="cc-close-text">{blocker}</p>
      </ConfirmModal>
    );
  }

  return (
    <ConfirmModal
      open={open}
      title={`Close ${formatCaseRef(caseId)}?`}
      subtitle="The case leaves the work queue and becomes read-only. Nothing is sent to the payer. It can be reopened later."
      confirmLabel="Close case"
      danger
      busy={busy}
      disabled={!reason || (reason === "other" && !note.trim())}
      error={error}
      onCancel={cancel}
      onConfirm={confirm}
    >
      <div className="cc-close-form">
        <div className="cc-close-field">
          <span className="cc-close-label">Why is it being closed?</span>
          <Dropdown ariaLabel="Reason for closing" value={reason} options={CLOSE_REASONS} onChange={setReason} placeholder="Choose a reason" />
        </div>
        <div className="cc-close-field">
          <span className="cc-close-label">{reason === "other" ? "Say why" : "Note (optional)"}</span>
          <textarea
            className="cv-ctl cc-close-note"
            aria-label="Note"
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </ConfirmModal>
  );
}
