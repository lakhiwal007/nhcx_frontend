import { Modal } from "../ui/Overlay";
import "../case/policy/policy.css";

export default function ChangePolicyModal({ open, from, to, onCancel, onConfirm }) {
  return (
    <Modal open={open} onClose={onCancel} title="Change this case's policy?" width={460}>
      <p className="pp-change-text">
        {from ? (
          <>
            This case is on <strong>{from}</strong>.{" "}
          </>
        ) : null}
        Moving to <strong>{to}</strong> runs eligibility again for the new policy. Anything already sent under the old policy stays with it and does not
        carry over.
      </p>
      <div className="pp-change-actions">
        <button type="button" className="cv-btn" onClick={onCancel}>
          Keep current policy
        </button>
        <button type="button" className="cv-btn is-primary" onClick={onConfirm}>
          Change policy
        </button>
      </div>
    </Modal>
  );
}
