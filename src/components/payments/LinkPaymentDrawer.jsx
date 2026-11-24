import { useEffect, useState } from "react";
import { api, markHandled } from "../../api";
import { useSend } from "../../hooks/util/useSend";
import { Drawer } from "../ui/Overlay";
import Dropdown from "../ui/Dropdown";
import PayerName from "../ui/PayerName";
import { formatCaseRef, formatDate, formatMoney } from "../../lib/format.js";

const OTHER = "__other__";

export default function LinkPaymentDrawer({ payment, onClose, onLinked }) {
  const open = !!payment;
  const [cases, setCases] = useState({ loaded: false, list: [] });
  const [choice, setChoice] = useState("");
  const [typed, setTyped] = useState("");

  const [openedFor, setOpenedFor] = useState(null);
  if ((payment?.id ?? null) !== openedFor) {
    setOpenedFor(payment?.id ?? null);
    setChoice("");
    setTyped("");
    if (payment) setCases({ loaded: false, list: [] });
  }

  useEffect(() => {
    if (!open || cases.loaded) return undefined;
    let live = true;
    api
      .getDashboardClaims({ limit: 200 })
      .then((res) => live && setCases({ loaded: true, list: res?.claims || [] }))
      .catch((err) => {
        markHandled(err);
        if (live) setCases({ loaded: true, list: [] });
      });
    return () => {
      live = false;
    };
  }, [open, cases.loaded]);

  const options = [
    ...cases.list.map((c) => ({ value: String(c.cashless_case_id ?? c.id), label: `${formatCaseRef(c.cashless_case_id ?? c.id)} · ${c.patient_name || c.child_name || "—"} · ${c.payer_name || c.payer_id || "no payer"}` })),
    { value: OTHER, label: "Another case number…" },
  ];
  const caseId = choice && choice !== OTHER ? Number(choice) : Number(typed.trim().replace(/^case-/i, ""));
  const valid = caseId > 0;
  const chosen = cases.list.find((c) => String(c.cashless_case_id ?? c.id) === choice);

  const link = useSend(
    async () => {
      const res = await api.linkPayment(payment.id, { cashless_case_id: caseId });
      onLinked?.(res);
      onClose();
      return res;
    },
    { success: `Payment linked to ${formatCaseRef(caseId)}` },
  );
  const close = () => {
    link.reset();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={link.busy ? undefined : close}
      title="Link this payment to a case"
      subtitle="The payer did not name a case this hospital knows. Choose the case this payment is for. After that, the payer can be told the payment arrived."
      width={560}
      footer={
        <div className="cv-drawer-actions">
          <button type="button" className="cv-btn" onClick={close} disabled={link.busy}>
            Cancel
          </button>
          <button type="button" className="cv-btn is-primary" disabled={!valid || link.busy} onClick={link.run}>
            {link.busy ? "Linking…" : valid ? `Link to ${formatCaseRef(caseId)}` : "Link"}
          </button>
        </div>
      }
    >
      {payment && (
        <div className="cm-form">
          <div className="cm-facts">
            <div className="cv-kv"><span>Payment</span><span className="cv-mono">{payment.payment_reference || payment.notice_identifier || "—"}</span></div>
            <div className="cv-kv"><span>Payer</span><span><PayerName id={payment.payer_id} name={payment.payer_name} /></span></div>
            <div className="cv-kv"><span>Payer named</span><span className="cv-mono">{payment.claim_reference || "nothing"}</span></div>
            <div className="cv-kv"><span>Net credited</span><span className="money">{formatMoney(payment.net_payment_amount)}</span></div>
            <div className="cv-kv"><span>Paid on</span><span>{payment.payment_date ? formatDate(payment.payment_date) : "—"}</span></div>
          </div>
          <div className="cv-field-stack">
            <span className="cv-field-key">Case</span>
            {cases.loaded ? <Dropdown ariaLabel="Case" value={choice} options={options} placeholder="Choose the case this pays for" onChange={setChoice} /> : <span className="cv-card-meta">Loading the cases…</span>}
            {choice === OTHER && <input className="cv-ctl cv-ctl-fill" aria-label="Case number" placeholder="Case number, e.g. CASE-41" value={typed} onChange={(e) => setTyped(e.target.value)} />}
          </div>
          {chosen && (
            <div className="cv-notice is-info">
              <div className="cv-notice-body">
                {formatCaseRef(chosen.cashless_case_id ?? chosen.id)} · {chosen.patient_name || chosen.child_name} · {chosen.policy_number || "no policy on record"}
                {chosen.approved_amount != null ? ` · approved ${formatMoney(chosen.approved_amount)}` : ""}
              </div>
            </div>
          )}
          {link.error && (
            <div className="cv-notice is-bad" role="alert">
              <div className="cv-notice-body">{link.error}</div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
