import { useState } from "react";
import { Drawer } from "../../ui/Overlay";
import { formatMoney } from "../../../lib/format.js";

export default function ReleaseDrawer({ open, onClose, owed, initialAmount, release, onSent }) {
  const [amount, setAmount] = useState(() => String(initialAmount || (owed > 0 ? owed : "") || ""));
  const [note, setNote] = useState("");
  const valid = Number(amount) > 0;
  const close = () => {
    release.reset();
    onClose();
  };
  return (
    <Drawer
      open={open}
      onClose={release.busy ? undefined : close}
      title="Ask for the balance"
      subtitle="A decided claim is not sent again. Ask the payer to release what is still owed on it."
      width={520}
      footer={
        <>
          <button type="button" className="cv-btn" onClick={close} disabled={release.busy}>
            Cancel
          </button>
          <button
            type="button"
            className="cv-btn is-primary"
            disabled={release.busy || !valid}
            onClick={() =>
              release.run({ amount, note }).then((res) => {
                if (res) {
                  onSent?.(res);
                  onClose();
                }
              })
            }
          >
            {release.busy ? "Sending…" : `Ask for ${valid ? formatMoney(Number(amount)) : "the balance"}`}
          </button>
        </>
      }
    >
      {owed > 0 && <p className="cv-drawer-intro">The payer approved {formatMoney(owed)} less than was claimed.</p>}
      <label className="cv-field-stack">
        <span className="cv-field-key">Amount still owed (INR)</span>
        <input className="cv-ctl" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="cv-field-stack cv-sub-note-top">
        <span className="cv-field-key">Note to the payer (optional)</span>
        <textarea className="cv-ctl cv-textarea" placeholder="Why the balance is owed" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {release.error && (
        <div className="cv-notice is-bad cv-drawer-note" role="alert">
          <div className="cv-notice-body">{release.error}</div>
        </div>
      )}
    </Drawer>
  );
}
