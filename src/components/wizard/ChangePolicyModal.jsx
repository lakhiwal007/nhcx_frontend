import { Button } from "../Common";
import { Modal } from "../Overlay";

// Asked before a case that already exists moves to another policy, from either
// the policy list or a cover returned by discovery.
export default function ChangePolicyModal({ open, from, to, onCancel, onConfirm }) {
  return (
    <Modal open={open} onClose={onCancel} title="Change this case's policy?" width={460}>
      <p className="pp-change-text">
        {from ? (
          <>
            This case is on <strong>{from}</strong>.{" "}
          </>
        ) : null}
        Moving to <strong>{to}</strong> runs eligibility again for the new policy. Anything already sent under the old policy
        stays with it and does not carry over.
      </p>
      <div className="pp-change-actions">
        <Button variant="outline" size="small" onClick={onCancel}>
          Keep current policy
        </Button>
        <Button variant="primary" size="small" onClick={onConfirm}>
          Change policy
        </Button>
      </div>
    </Modal>
  );
}
