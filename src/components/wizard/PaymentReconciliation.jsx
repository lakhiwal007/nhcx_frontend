import { useState, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Home, RefreshCw, AlertCircle } from "lucide-react";
import { api } from "../../api";
import { useReadOnly, READ_ONLY_TITLE } from "../../readOnly";
import { Button, LoadingBlock, formatMoney } from "../Common";
import { formatDate, formatDateTime } from "../../format.js";
import { groupPaymentEvents, stageLabel } from "../../paymentEvents.js";
import { Section } from "../case/CaseFile";

export default function PaymentReconciliation({ ctx }) {
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const { caseState, moneyLedger } = ctx;

  const claimId = caseState.claim_id || caseState.draftData?.claim_id;
  const claimCorrelationId = caseState.claimCorrelationId;

  const [loading, setLoading] = useState(true);
  const [paymentData, setPaymentData] = useState(null);
  const [acknowledging, setAcknowledging] = useState({});
  const [ackResults, setAckResults] = useState({});
  // Advanced ack override state keyed by payment_reference
  const [ackOverrides, setAckOverrides] = useState({});
  const [showOverrides, setShowOverrides] = useState({});

  const fetchPayment = async () => {
    if (!claimId && !claimCorrelationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = claimId
        ? await api.searchPaymentStatus({ claim_id: claimId })
        : await api.getPaymentStatus(claimCorrelationId);
      setPaymentData(res);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayment();
  }, []);

  const handleAcknowledge = async (event) => {
    const ref = event.payment_reference;
    setAcknowledging((prev) => ({ ...prev, [ref]: true }));
    try {
      const overrides = ackOverrides[ref] || {};
      const body = { payment_reference: ref };
      if (overrides.claim_number) body.claim_number = overrides.claim_number;
      if (overrides.amount_received) body.amount_received = Number(overrides.amount_received);
      if (overrides.utr) body.utr = overrides.utr;
      const res = await api.acknowledgePayment(body);
      setAckResults((prev) => ({ ...prev, [ref]: { success: true, correlation_id: res.correlation_id } }));
      await fetchPayment();
    } catch (err) {
      setAckResults((prev) => ({ ...prev, [ref]: { success: false, message: err.message } }));
    } finally {
      setAcknowledging((prev) => ({ ...prev, [ref]: false }));
    }
  };

  const updateOverride = (ref, field, value) => {
    setAckOverrides((prev) => ({ ...prev, [ref]: { ...(prev[ref] || {}), [field]: value } }));
  };

  if (loading) {
    return <LoadingBlock text="Fetching payment status…" />;
  }

  const isNotFound = !paymentData || paymentData.status === "not_found" || paymentData.total_events === 0;
  const payments = groupPaymentEvents(paymentData?.events || []);
  const ledger = moneyLedger || {};
  const settlement = ledger.settlement || {};
  const sum = (key) => payments.reduce((s, p) => s + (Number(p[key]) || 0), 0);
  const gross = settlement.gross ?? (payments.length ? sum("gross_amount") : null);
  const tds = settlement.tds ?? (payments.length ? sum("tds_amount") : null);
  const net = settlement.net ?? (payments.length ? sum("net_payment_amount") : null);
  const approved = ledger.approved?.value ?? null;
  const shortBy = approved != null && gross != null && gross < approved ? approved - gross : null;
  const toCollect = ledger.reconciliation?.to_collect_from_patient ?? ledger.patient_payable?.value ?? null;
  const latestUtr = settlement.utr || payments.map((p) => p.utr).filter(Boolean).pop() || null;
  const ackFailed = payments.filter((p) => p.acknowledgement_status === "failed" && !ackResults[p.payment_reference]?.success).length;
  const ackPending = payments.filter((p) => p.acknowledgement_status === "pending").length;

  const verdict = isNotFound
    ? { tone: "pending", label: "Awaiting payment" }
    : paymentData?.settled
      ? { tone: shortBy ? "warn" : "ok", label: shortBy ? "Settled short" : "Settled" }
      : { tone: "pending", label: stageLabel(paymentData?.latest_stage) ? `Payment ${stageLabel(paymentData.latest_stage)}` : "Payment in progress" };

  const statement = [
    approved != null && { label: "Approved by payer", value: approved },
    gross != null && { label: "Gross paid", value: gross },
    tds > 0 && { label: "TDS deducted", value: -tds },
    net != null && { label: "Net credited", value: net, total: true },
  ].filter(Boolean);

  return (
    <div className="wizard-step pd-screen">
      {ackFailed > 0 && (
        <div className="ep-notice is-bad">
          {ackFailed} payment acknowledgement{ackFailed === 1 ? "" : "s"} failed to reach the payer. Retry from the
          payments table below.
        </div>
      )}

      <div className="pd-layout">
        <div className="pd-main">
          {isNotFound ? (
            <Section id="pay-none" title="No payment yet">
              <p className="ds-empty">
                The payer sends payment notices on its own schedule, typically hours to days after the claim is
                approved. Each notice is acknowledged automatically when it arrives.
              </p>
              <div className="ds-empty-actions">
                <Button variant="outline" size="small" icon={RefreshCw} onClick={fetchPayment}>
                  Check again
                </Button>
              </div>
            </Section>
          ) : (
            <>
              <Section id="pay-settlement" title="Settlement">
                <dl className="ds-statement">
                  {statement.map((r) => (
                    <div key={r.label} className={r.total ? "is-total" : undefined}>
                      <dt>{r.label}</dt>
                      <dd className="ep-mono">{r.value < 0 ? `− ${formatMoney(-r.value)}` : formatMoney(r.value)}</dd>
                    </div>
                  ))}
                  {shortBy != null && (
                    <div>
                      <dt className="is-bad">Short of approved amount</dt>
                      <dd className="ep-mono is-bad">{formatMoney(shortBy)}</dd>
                    </div>
                  )}
                  {toCollect > 0 && (
                    <div>
                      <dt>
                        Patient payable
                        {ledger.patient_payable?.formula && <span className="ep-muted"> · {ledger.patient_payable.formula}</span>}
                      </dt>
                      <dd className="ep-mono">{formatMoney(toCollect)}</dd>
                    </div>
                  )}
                </dl>
              </Section>

              <Section
                id="pay-notices"
                title="Payments"
                meta={`${payments.length} payment${payments.length === 1 ? "" : "s"}${paymentData?.total_events > payments.length ? ` · ${paymentData.total_events} notices` : ""}`}
              >
                <div className="ep-table-wrap">
                  <table className="ep-table ds-lines-table">
                    <thead>
                      <tr>
                        <th>Payment</th>
                        <th>Stage</th>
                        <th className="ep-num">Gross</th>
                        <th className="ep-num">TDS</th>
                        <th className="ep-num">Net</th>
                        <th>Acknowledgement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((pay) => {
                        const ref = pay.payment_reference;
                        const ackResult = ackResults[ref];
                        const isAcknowledging = acknowledging[ref];
                        const needsRetry = pay.acknowledgement_status === "failed" && !ackResult?.success;
                        const editing = showOverrides[ref];
                        // Every notice the payer sent for this payment, shown inline.
                        const historyOpen = pay.notice_count > 1 && pay.history?.length > 0;
                        return (
                          <Fragment key={pay.group_key}>
                            <tr>
                              <td className="ep-col-name">
                                <div className="ep-strong ep-mono">{ref || "—"}</div>
                                <div className="ep-muted">
                                  {[pay.payment_date && formatDate(pay.payment_date), pay.utr && `UTR ${pay.utr}`, pay.utr_type].filter(Boolean).join(" · ")}
                                </div>
                              </td>
                              <td className="ep-cap">{stageLabel(pay.payment_stage) || "—"}</td>
                              <td className="ep-num ep-mono">{formatMoney(pay.gross_amount)}</td>
                              <td className="ep-num ep-mono">{pay.tds_amount != null ? formatMoney(pay.tds_amount) : "—"}</td>
                              <td className="ep-num ep-mono ep-strong">{formatMoney(pay.net_payment_amount)}</td>
                              <td>
                                {pay.acknowledgement_status === "submitted" && !needsRetry ? (
                                  "Acknowledged"
                                ) : pay.acknowledgement_status === "pending" ? (
                                  <span className="ep-muted">Pending</span>
                                ) : (
                                  <div className="pay-ack">
                                    <span className="is-bad">Failed</span>
                                    <button type="button" className="ep-action" disabled={isAcknowledging || readOnly} title={readOnly ? READ_ONLY_TITLE : undefined} onClick={() => handleAcknowledge(pay)}>
                                      {isAcknowledging ? "Retrying…" : "Retry"}
                                    </button>
                                    <button type="button" className="pd-inline-link" onClick={() => setShowOverrides((p) => ({ ...p, [ref]: !p[ref] }))}>
                                      {editing ? "Close" : "Edit values"}
                                    </button>
                                  </div>
                                )}
                                {pay.acknowledgement_error && needsRetry && <div className="ep-muted">{pay.acknowledgement_error}</div>}
                                {ackResult && <div className={ackResult.success ? "ep-muted" : "is-bad"}>{ackResult.success ? "Acknowledgement sent" : ackResult.message}</div>}
                              </td>
                            </tr>
                            {historyOpen && (
                              <tr className="pay-subrow">
                                <td colSpan={6}>
                                  <div className="ep-muted pay-subrow-title">Notices received for this payment</div>
                                  {pay.history.map((notice, ni) => (
                                    <div key={notice.correlation_id || ni} className="pay-notice">
                                      <span className="ep-cap">{stageLabel(notice.payment_stage)}</span>
                                      <span className="ep-muted">
                                        {notice.received_at ? formatDateTime(notice.received_at) : notice.payment_date ? formatDate(notice.payment_date) : "—"}
                                      </span>
                                      <span className="ep-mono">{formatMoney(notice.net_payment_amount)}</span>
                                      <span className="ep-muted">{notice.acknowledgement_status === "submitted" ? "Acknowledged" : notice.acknowledgement_status || "Not acknowledged"}</span>
                                      <span className="ep-mono ep-muted pay-notice-id">{notice.correlation_id}</span>
                                    </div>
                                  ))}
                                </td>
                              </tr>
                            )}
                            {editing && (
                              <tr className="pay-subrow">
                                <td colSpan={6}>
                                  <div className="pay-overrides">
                                    <label>
                                      <span>Claim number</span>
                                      <input className="input-modern pd-input" placeholder="Override claim number" value={ackOverrides[ref]?.claim_number || ""} onChange={(e) => updateOverride(ref, "claim_number", e.target.value)} />
                                    </label>
                                    <label>
                                      <span>Amount received</span>
                                      <input className="input-modern pd-input ep-mono" type="number" placeholder="Override amount" value={ackOverrides[ref]?.amount_received || ""} onChange={(e) => updateOverride(ref, "amount_received", e.target.value)} />
                                    </label>
                                    <label>
                                      <span>UTR</span>
                                      <input className="input-modern pd-input ep-mono" placeholder="Override UTR" value={ackOverrides[ref]?.utr || ""} onChange={(e) => updateOverride(ref, "utr", e.target.value)} />
                                    </label>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            </>
          )}
        </div>

        <aside className="pd-side">
          <section className="ep-section pd-request">
            <header className="ep-section-head">
              <h3 className="ep-section-title">Payment</h3>
            </header>
            <div className={`ds-verdict is-${verdict.tone}`}>
              <span className="ep-dot" aria-hidden="true" />
              <span className="ds-verdict-label ep-cap">{verdict.label}</span>
            </div>
            {latestUtr && (
              <div className="ds-ref">
                <span className="ep-muted">UTR</span>
                <span className="ep-mono">{latestUtr}</span>
              </div>
            )}
            {net != null && (
              <div className="pd-amount">
                <div className="ep-muted">Net credited</div>
                <div className="pd-amount-value ep-mono">{formatMoney(net)}</div>
                {approved != null && <div className="ep-muted">of {formatMoney(approved)} approved</div>}
              </div>
            )}
            {!isNotFound && (
              <ul className="pd-ready" aria-label="Acknowledgements">
                <li className={ackFailed ? "is-todo" : ackPending ? "is-soft" : "is-ok"}>
                  {ackFailed || ackPending ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                  <span>
                    {ackFailed
                      ? `${ackFailed} acknowledgement${ackFailed === 1 ? "" : "s"} failed`
                      : ackPending
                        ? `${ackPending} acknowledgement${ackPending === 1 ? "" : "s"} pending`
                        : "All notices acknowledged"}
                  </span>
                </li>
              </ul>
            )}
            <div className="pd-submit">
              <Button variant={paymentData?.settled ? "primary" : "outline"} icon={paymentData?.settled ? Home : undefined} onClick={() => navigate("/dashboard")} className="pd-submit-btn">
                {paymentData?.settled ? "Done — back to cases" : "Back to cases"}
              </Button>
              <button type="button" className="pd-text-btn" onClick={fetchPayment}>
                <RefreshCw size={13} /> Refresh payment status
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
