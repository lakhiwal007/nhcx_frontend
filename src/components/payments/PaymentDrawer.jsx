import { Link2 } from "lucide-react";
import { api } from "../../api";
import { useSend } from "../../hooks/util/useSend";
import { useReadOnly } from "../../lib/readOnly";
import { Drawer } from "../ui/Overlay";
import PayerName from "../ui/PayerName";
import TechnicalDetails from "../case/step/TechnicalDetails";
import { formatDate, formatDateTime, formatMoney, formatCaseRef } from "../../lib/format.js";
import { ackLabel, ackState, stageWord } from "../../domain/paymentEvents.js";

const money = (v) => (v == null ? "—" : formatMoney(v));

export default function PaymentDrawer({ payment, onClose, onOpenCase, onLink, onChanged }) {
  const readOnly = useReadOnly();
  const open = !!payment;
  const p = payment || {};
  const ack = payment ? ackState(payment) : null;
  const notices = p.history || (payment ? [payment] : []);
  const breakdown = notices.flatMap((n) => n.detail_items || []);
  const retry = useSend(
    async () => {
      const res = await api.acknowledgePayment({ payment_id: p.id, payment_reference: p.payment_reference || p.notice_identifier });
      onChanged?.();
      return res;
    },
    { success: "Acknowledgement sent to the payer" },
  );
  const unlinked = payment && p.claim_id == null;
  const canRetry = ack === "failed" && !readOnly && !!(p.payment_reference || p.notice_identifier);

  return (
    <Drawer
      open={open}
      onClose={retry.busy ? undefined : onClose}
      title={p.payment_reference || p.notice_identifier || "Payment"}
      subtitle={payment ? `${stageWord(p.payment_stage) || "—"} · ${ackLabel(payment)}${p.notice_count > 1 ? ` · ${p.notice_count} notices` : ""}` : null}
      width={600}
      footer={
        payment && (
          <div className="cv-drawer-actions">
            {unlinked && !readOnly ? (
              <button type="button" className="cv-btn is-primary" onClick={() => onLink(payment)}>
                <Link2 size={14} aria-hidden="true" /> Link to a case
              </button>
            ) : canRetry ? (
              <button type="button" className="cv-btn is-primary" disabled={retry.busy} onClick={retry.run}>
                {retry.busy ? "Retrying…" : "Retry acknowledgement"}
              </button>
            ) : p.cashless_case_id || p.claim_reference ? (
              <button type="button" className="cv-btn is-primary" onClick={() => onOpenCase(payment)}>
                Open the case
              </button>
            ) : null}
          </div>
        )
      }
    >
      {payment && (
        <div className="cm-detail">
          {ack === "failed" && (
            <div className="cv-notice is-bad" role="alert">
              <div className="cv-notice-body">
                <strong>The payer has not been told this payment arrived.</strong> {p.acknowledgement_error || notices.find((n) => n.acknowledgement_error)?.acknowledgement_error || ""} Retry the acknowledgement.
              </div>
            </div>
          )}
          {unlinked && (
            <div className="cv-notice is-warn">
              <div className="cv-notice-body">
                <strong>Not linked to a case.</strong> The payer named {p.claim_reference ? <span className="cv-mono">{p.claim_reference}</span> : "no claim"}, which matches no case here. Link it so the case's Payment step and the acknowledgement can follow.
              </div>
            </div>
          )}
          {retry.error && (
            <div className="cv-notice is-bad" role="alert">
              <div className="cv-notice-body">{retry.error}</div>
            </div>
          )}

          <div className="cm-facts">
            <div className="cv-kv is-total"><span>Net credited</span><span className="money">{money(p.net_payment_amount)}</span></div>
            <div className="cv-kv"><span>Gross</span><span className="money">{money(p.gross_amount)}</span></div>
            <div className="cv-kv"><span>TDS deducted</span><span className="money">{p.tds_amount != null ? formatMoney(Math.abs(p.tds_amount)) : "—"}</span></div>
            <div className="cv-kv"><span>Paid on</span><span>{p.payment_date ? formatDate(p.payment_date) : "—"}</span></div>
            <div className="cv-kv"><span>UTR</span><span className="cv-mono">{p.utr || (p.settled ? "Not sent by the payer" : "Not yet")}</span></div>
            {p.utr_type && <div className="cv-kv"><span>Transfer type</span><span>{p.utr_type}</span></div>}
          </div>

          <div className="cm-facts">
            <div className="cv-kv"><span>Payer</span><span><PayerName id={p.payer_id} name={p.payer_name} /></span></div>
            <div className="cv-kv"><span>Case</span><span className="cv-mono">{p.cashless_case_id ? formatCaseRef(p.cashless_case_id) : "Not linked"}</span></div>
            <div className="cv-kv"><span>Claim named by the payer</span><span className="cv-mono">{p.claim_reference || "—"}</span></div>
            {p.patient_name && <div className="cv-kv"><span>Patient</span><span>{p.patient_name}</span></div>}
            <div className="cv-kv"><span>Acknowledged</span><span>{ackLabel(payment)}{p.acknowledged_at && ack !== "failed" ? ` · ${formatDateTime(p.acknowledged_at)}` : ""}</span></div>
          </div>

          <section className="cm-section">
            <h4 className="cv-sub">Notices from the payer</h4>
            <div className="cv-tw">
              <table>
                <thead>
                  <tr>
                    <th>Notice</th>
                    <th>Received</th>
                    <th className="is-num">Net</th>
                    <th>Acknowledged</th>
                  </tr>
                </thead>
                <tbody>
                  {notices.map((n, i) => (
                    <tr key={n.event_key || n.correlation_id || i}>
                      <td>{stageWord(n.payment_stage) || "—"}</td>
                      <td>{n.received_at ? formatDateTime(n.received_at) : n.notice_created_at ? formatDateTime(n.notice_created_at) : "—"}</td>
                      <td className="is-num">{money(n.net_payment_amount)}</td>
                      <td>{ackLabel(n)}</td>
                    </tr>
                  ))}
                  {breakdown.map((item, i) => (
                    <tr key={`b-${i}`} className="pay-breakdown">
                      <td>{item.type_display || item.type || "Breakdown"}</td>
                      <td>{item.date ? formatDate(item.date) : "—"}</td>
                      <td className="is-num">{money(item.amount)}</td>
                      <td>{item.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <TechnicalDetails
            ids={[
              { label: "Payment id", value: p.id },
              { label: "Claim id", value: p.claim_id },
              { label: "Notice id", value: p.notice_identifier },
              { label: "Notice status", value: p.notice_status },
              { label: "Reconciliation id", value: p.recon_identifier },
              { label: "Correlation id", value: p.correlation_id },
              { label: "Event key", value: p.event_key },
              { label: "NHCX workflow", value: p.workflow_id != null ? String(p.workflow_id) : null },
              { label: "Provider", value: p.provider_id },
              { label: "Acknowledgement attempts", value: p.acknowledgement_attempts != null ? String(p.acknowledgement_attempts) : null },
            ]}
          />
        </div>
      )}
    </Drawer>
  );
}
