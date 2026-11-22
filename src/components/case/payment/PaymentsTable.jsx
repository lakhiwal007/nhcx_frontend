import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDate, formatDateTime, formatMoney } from "../../../lib/format.js";
import { ackLabel, stageWord } from "../../../domain/paymentEvents.js";
import TechnicalDetails from "../step/TechnicalDetails";

const money = (v) => (v == null ? "—" : formatMoney(v));
const ackTone = (state) => (state === "failed" ? "is-bad" : state === "pending" ? "is-info" : "is-ok");

function NoticeRows({ pay }) {
  const notices = pay.history || [pay];
  const breakdown = notices.flatMap((n) => n.detail_items || []);
  return (
    <div className="pay-detail">
      <div className="cv-cols">
        <div>
          <div className="cv-kv"><span>UTR</span><span className="cv-mono">{pay.utr || (pay.settled ? "Not sent by the payer" : "Not yet")}</span></div>
          <div className="cv-kv"><span>Transfer type</span><span>{pay.utr_type || "—"}</span></div>
          <div className="cv-kv"><span>Paid on</span><span>{pay.payment_date ? formatDate(pay.payment_date) : "—"}</span></div>
        </div>
        <div>
          <div className="cv-kv"><span>Claim reference</span><span className="cv-mono">{pay.claim_reference || "—"}</span></div>
          <div className="cv-kv"><span>Notice amount</span><span className="money">{money(pay.notice_amount)}</span></div>
          {pay.payment_status && <div className="cv-kv"><span>Payer's status</span><span>{pay.payment_status}</span></div>}
        </div>
      </div>
      <div className="cv-tw pay-notices">
        <table aria-label={`Notices for ${pay.payment_reference || "this payment"}`}>
          <thead>
            <tr>
              <th>Notice</th>
              <th>Received</th>
              <th className="is-num">Net</th>
              <th>Confirmation</th>
            </tr>
          </thead>
          <tbody>
            {notices.map((n, i) => (
              <tr key={n.event_key || n.correlation_id || i}>
                <td>{stageWord(n.payment_stage) || "—"}</td>
                <td>{n.received_at ? formatDateTime(n.received_at) : "—"}</td>
                <td className="is-num">{money(n.net_payment_amount)}</td>
                <td>
                  {ackLabel(n)}
                  {n.acknowledgement_status === "failed" && n.acknowledgement_error && <div className="cv-card-meta">{n.acknowledgement_error}</div>}
                </td>
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
      <TechnicalDetails ids={[{ label: "Payment id", value: pay.id }, { label: "Notice id", value: pay.notice_identifier }, { label: "Reconciliation id", value: pay.recon_identifier }, { label: "Correlation id", value: pay.correlation_id }]} />
    </div>
  );
}

function RetryRow({ pay, busy, result, onRetry }) {
  const [editing, setEditing] = useState(false);
  const [claimNumber, setClaimNumber] = useState("");
  return (
    <div className="pay-retry">
      {result?.error && (
        <div className="cv-notice is-bad" role="alert">
          <div className="cv-notice-body">{result.error}</div>
        </div>
      )}
      <div className="pay-retry-row">
        <button type="button" className="cv-btn" disabled={busy} onClick={() => onRetry(pay, claimNumber)}>
          {busy ? "Confirming…" : "Confirm the payment again"}
        </button>
        <button type="button" className="cv-link" onClick={() => setEditing((v) => !v)}>
          {editing ? "Keep the payer's claim number" : "Send a different claim number"}
        </button>
      </div>
      {editing && (
        <label className="cv-field-stack pay-override">
          <span className="cv-field-key">Claim number to send back</span>
          <input className="cv-ctl" placeholder={pay.claim_reference || "CLM-…"} value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} />
          <span className="cv-card-meta">The amount and UTR are the payer's own figures and go back as received.</span>
        </label>
      )}
    </div>
  );
}

export default function PaymentsTable({ payments, ackOf, acking = {}, results = {}, onRetry, canRetry, expandFailed = false }) {
  const [openKeys, setOpenKeys] = useState(() => new Set(expandFailed ? payments.filter((p) => ackOf(p) === "failed").map((p) => p.group_key) : []));
  const toggle = (key) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  if (!payments.length) return <div className="cv-card-intro">No payment notices yet.</div>;
  return (
    <div className="cv-tw cv-in-card">
      <table>
        <thead>
          <tr>
            <th className="pay-toggle-col" aria-label="Details" />
            <th>Payment</th>
            <th>Stage</th>
            <th className="is-num">Gross</th>
            <th className="is-num">TDS</th>
            <th className="is-num">Net</th>
            <th>UTR</th>
            <th>Confirmation</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((pay) => {
            const key = pay.group_key;
            const ack = ackOf(pay);
            const isOpen = openKeys.has(key);
            const retry = ack === "failed" && canRetry?.(pay);
            return (
              <Fragment key={key}>
                <tr className={isOpen ? "is-selected" : undefined}>
                  <td className="pay-toggle-col">
                    <button type="button" className="cv-icon-btn" aria-expanded={isOpen} aria-label={isOpen ? "Hide details" : "Show details"} onClick={() => toggle(key)}>
                      {isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                    </button>
                  </td>
                  <td>
                    <div className="cv-mono">{pay.payment_reference || pay.notice_identifier || "—"}</div>
                    <div className="cv-card-meta">{pay.notice_count > 1 ? `${pay.notice_count} notices` : "1 notice"}</div>
                  </td>
                  <td>{stageWord(pay.payment_stage) || "—"}</td>
                  <td className="is-num">{money(pay.gross_amount)}</td>
                  <td className="is-num">{money(pay.tds_amount)}</td>
                  <td className="is-num is-strong">{money(pay.net_payment_amount)}</td>
                  <td className="cv-mono">{pay.utr || (pay.settled ? "Missing" : "—")}</td>
                  <td>
                    <span className={`cv-chip ${ackTone(ack)}`}>{ackLabel(ack)}</span>
                    {pay.acknowledged_at && ack !== "failed" && <div className="cv-card-meta">{formatDateTime(pay.acknowledged_at)}</div>}
                  </td>
                </tr>
                {(isOpen || retry) && (
                  <tr className="pay-subrow">
                    <td colSpan={8}>
                      {retry && <RetryRow pay={pay} busy={!!acking[key]} result={results[key]} onRetry={onRetry} />}
                      {isOpen && <NoticeRows pay={pay} />}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
