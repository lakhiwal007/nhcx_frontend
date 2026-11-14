import { useState } from "react";
import { Drawer } from "../../ui/Overlay";
import LinesEditor from "../forms/LinesEditor";
import PayerWords from "../step/PayerWords";

const recompute = (item, field, raw) => {
  const value = Number(raw);
  const next = { ...item, [field]: Number.isNaN(value) ? raw : value };
  if (field === "quantity" || field === "unit_price") {
    const qty = Number(field === "quantity" ? value : item.quantity) || 0;
    const price = Number(field === "unit_price" ? value : item.unit_price) || 0;
    next.net_amount = Math.round(qty * price * 100) / 100;
  }
  return next;
};

export default function DischargeResubmitDrawer({ open, onClose, queried, notes, items, send, onSent }) {
  const [edited, setEdited] = useState(null);
  const [answer, setAnswer] = useState("");
  const lines = edited ?? items ?? [];
  const total = lines.reduce((s, it) => s + (Number(it.net_amount) || 0), 0);
  const canSend = !send.busy && (!queried || answer.trim());
  const close = () => {
    send.reset();
    onClose();
  };
  return (
    <Drawer
      open={open}
      onClose={send.busy ? undefined : close}
      title={queried ? "Answer the discharge claim query" : "Resend the discharge claim"}
      subtitle={
        queried
          ? "The discharge claim goes back with your answer, the documents attached on this step and the lines below. The final claim stays untouched."
          : "The discharge claim goes back with the lines below and the documents attached on this step. The final claim stays untouched."
      }
      width={720}
      footer={
        <>
          <button type="button" className="cv-btn" onClick={close} disabled={send.busy}>
            Cancel
          </button>
          <button
            type="button"
            className="cv-btn is-primary"
            disabled={!canSend}
            onClick={() =>
              send.run({ items: edited || undefined, answer }).then((res) => {
                if (res) {
                  onSent?.(res);
                  onClose();
                }
              })
            }
          >
            {send.busy ? "Sending…" : queried ? "Send the answer" : "Resend the discharge claim"}
          </button>
        </>
      }
    >
      {queried && (
        <section className="cv-ask">
          <h4 className="cv-sub">The payer asked</h4>
          <PayerWords notes={notes} empty="The payer's question did not come with any text." />
        </section>
      )}
      {queried && (
        <label className="cv-field-stack cv-drawer-note">
          <span className="cv-field-key">Your answer</span>
          <textarea className="cv-ctl cv-textarea" placeholder="Answer the payer's question about the discharge claim" value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </label>
      )}
      <section className="cv-card">
        <div className="cv-card-head">
          <h3 className="cv-card-title">Lines</h3>
          {edited && (
            <span className="cv-card-tools">
              <button type="button" className="cv-link" onClick={() => setEdited(null)}>
                Reset to hospital record
              </button>
            </span>
          )}
        </div>
        <LinesEditor items={lines} total={total} onChange={(i, field, raw) => setEdited(lines.map((it, n) => (n === i ? recompute(it, field, raw) : it)))} totalLabel="Discharge claim" />
      </section>
      {send.error && (
        <div className="cv-notice is-bad cv-drawer-note" role="alert">
          <div className="cv-notice-body">{send.error}</div>
        </div>
      )}
    </Drawer>
  );
}
