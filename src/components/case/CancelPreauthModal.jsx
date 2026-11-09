import { useState } from "react";
import ConfirmModal from "../ConfirmModal";
import { formatMoney } from "../../format.js";

const CANCEL_REASONS = [
  { value: "treatmentplanchanged", label: "Treatment plan changed during hospitalisation" },
  { value: "patientrequest", label: "Patient requested cancellation" },
  { value: "financialconstraints", label: "Financial constraints" },
  { value: "alternativetreatment", label: "Alternative treatment chosen" },
  { value: "duplicateclaim", label: "Duplicate claim or pre-auth" },
  { value: "administrativeerror", label: "Administrative error" },
  { value: "other", label: "Other reason" },
];

export default function CancelPreauthModal({ open, onClose, preauthRef, approvedAmount, cancel }) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const needsNote = reason === "other" && !description.trim();
  const close = () => {
    cancel.reset();
    onClose();
  };
  return (
    <ConfirmModal
      open={open}
      title="Cancel this pre-auth?"
      subtitle="Cancellation cannot be undone."
      confirmLabel="Cancel the pre-auth"
      cancelLabel="Keep it"
      danger
      busy={cancel.busy}
      disabled={!reason || needsNote}
      error={cancel.error}
      onCancel={close}
      onConfirm={() => cancel.run({ reason, description }).then((res) => res && onClose())}
    >
      <p>
        {preauthRef ? (
          <>
            The pre-auth reference <strong>{preauthRef}</strong>
            {approvedAmount != null && (
              <>
                {" "}
                and its approved amount of <strong>{formatMoney(approvedAmount)}</strong>
              </>
            )}{" "}
            will be voided with the payer.
          </>
        ) : (
          "The request is withdrawn from the payer before it decides."
        )}
      </p>
      <label className="cv-field-stack">
        <span className="cv-field-key">Reason</span>
        <select className="cv-ctl" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="" disabled>
            Choose a reason
          </option>
          {CANCEL_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label className="cv-field-stack cv-sub-note-top">
        <span className="cv-field-key">{reason === "other" ? "Reason, in your words (the payer reads only this)" : "Description (optional)"}</span>
        <textarea className="cv-ctl cv-textarea" placeholder="Anything the payer should know about the cancellation" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
    </ConfirmModal>
  );
}
