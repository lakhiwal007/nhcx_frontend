import { Check } from "lucide-react";
import ConfirmModal from "../../ui/ConfirmModal";

export default function ReviewSendModal({ open, facts = [], done = [], stillOpen = 0, sendLabel = "Send", busy = false, onCancel, onConfirm }) {
  return (
    <ConfirmModal
      open={open}
      title="Check before you send"
      subtitle="This is what the payer will get. You cannot change it after you send."
      confirmLabel={sendLabel}
      cancelLabel="Go back"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <div className="cv-review-facts">
        {facts
          .filter((f) => f && f[1] != null && f[1] !== "")
          .map(([label, value]) => (
            <div key={label} className="cv-rkv">
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
      </div>
      {done.length > 0 && (
        <>
          <p className="cv-card-meta cv-review-title">Going with it</p>
          <ul className="cv-review-list">
            {done.map((row, i) => (
              <li key={row.id} style={{ "--i": i }}>
                <Check size={14} aria-hidden="true" />
                <span>{row.name}</span>
                <em>{row.fact}</em>
              </li>
            ))}
          </ul>
        </>
      )}
      {stillOpen > 0 && (
        <div className="cv-notice is-warn cv-review-note">
          <div className="cv-notice-body">
            {stillOpen === 1 ? "1 thing you could still check. You can send without it." : `${stillOpen} things you could still check. You can send without them.`}
          </div>
        </div>
      )}
    </ConfirmModal>
  );
}
