import { useState, useEffect, useRef, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Home, RefreshCw, AlertCircle } from "lucide-react";
import { api } from "../../api";
import { usePoll } from "../../hooks/usePoll";
import { useReadOnly, READ_ONLY_TITLE } from "../../readOnly";
import { Button, LoadingBlock, formatMoney, NextStep } from "../Common";
import { formatDate, formatDateTime } from "../../format.js";
import { ackState, groupPaymentEvents, stageLabel } from "../../paymentEvents.js";
import { projectCaseStatus } from "../case/caseStages";
import { Section } from "../case/CaseFile";

const POLL_INTERVAL_MS = 30000;

const grossOf = (p) => p.gross_amount ?? p.total_payment_amount ?? p.notice_amount ?? 0;
const netOf = (p) => p.net_payment_amount ?? p.total_payment_amount ?? p.notice_amount ?? 0;
const total = (list, of) => list.reduce((sum, p) => sum + (Number(of(p)) || 0), 0);

// Why no payment is coming, when the claim says so. Null means the screen waits.
function noPaymentReason(claimLeg) {
  if (claimLeg === "rejected") return { title: "The claim was rejected", text: "No payment will follow unless an appeal succeeds.", label: "Open Reprocess", to: "../reprocess" };
  if (claimLeg === "queried") return { title: "The claim has an open query", text: "The payer will not pay until it is answered.", label: "Back to claim", to: "../claim" };
  if (claimLeg === "submitting") return { title: "The claim is with the payer", text: "Payment follows once the payer approves it.", label: "Back to claim", to: "../claim" };
  if (claimLeg === "draft" || claimLeg === "error") return { title: "No claim has been sent", text: "Payment follows an approved final claim.", label: "Back to claim", to: "../claim" };
  return null;
}

export default function PaymentReconciliation({ ctx }) {
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const { caseState, cashlessCase, setCashlessCase, moneyLedger, refreshTimeline } = ctx;
  const caseId = caseState.cashless_case_id;
  const claimId = cashlessCase?.claim_id ?? caseState.claim_id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [paymentData, setPaymentData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acknowledging, setAcknowledging] = useState({});
  const [ackResults, setAckResults] = useState({});
  // Advanced ack override state keyed by payment group
  const [ackOverrides, setAckOverrides] = useState({});
  const [showOverrides, setShowOverrides] = useState({});
  const seenRef = useRef(null);

  const fetchPayment = async () => {
    if (!claimId) {
      setLoading(false);
      return;
    }
    try {
      setPaymentData(await api.searchPaymentStatus({ claim_id: claimId }));
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || "The payment status could not be read.");
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchPayment();
    setRefreshing(false);
  };

  useEffect(() => {
    const timer = setTimeout(fetchPayment, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId]);

  // A new notice moves the case: the chain and the money strip follow it.
  const noticeKey = paymentData ? `${paymentData.latest_stage}:${paymentData.total_events}` : null;
  useEffect(() => {
    if (!noticeKey) return;
    const seen = seenRef.current;
    seenRef.current = noticeKey;
    if (!seen || seen === noticeKey) return;
    refreshTimeline?.();
    if (caseId) {
      api.getCashlessStatus(caseId)
        .then((res) => setCashlessCase((prev) => (prev ? { ...prev, ...projectCaseStatus(res) } : prev)))
        .catch(() => {});
    }
  }, [noticeKey, caseId, refreshTimeline, setCashlessCase]);

  const payments = groupPaymentEvents(paymentData?.events || []);
  const ackOf = (pay) => (ackResults[pay.group_key]?.success ? "sent" : ackState(pay));
  const ackFailed = payments.filter((p) => ackOf(p) === "failed").length;
  const ackPending = payments.filter((p) => ackOf(p) === "pending").length;
  const settledPayments = payments.filter((p) => p.settled);
  const openPayments = payments.filter((p) => !p.settled);
  const allSettled = payments.length > 0 && openPayments.length === 0;
  const isNotFound = !loadError && (!paymentData || paymentData.status === "not_found" || paymentData.total_events === 0);
  const claimLeg = cashlessCase?.legs?.claim;
  const noPayment = isNotFound ? noPaymentReason(claimLeg) : null;

  usePoll(fetchPayment, {
    active: !loading && claimId && !noPayment && !(allSettled && ackPending === 0) ? claimId : null,
    intervalMs: POLL_INTERVAL_MS,
    immediate: false,
  });

  const handleAcknowledge = async (pay) => {
    const key = pay.group_key;
    const overrides = ackOverrides[key] || {};
    const amount = overrides.amount_received;
    if (amount && !(Number(amount) > 0)) {
      setAckResults((prev) => ({ ...prev, [key]: { success: false, message: "Enter an amount above zero." } }));
      return;
    }
    setAcknowledging((prev) => ({ ...prev, [key]: true }));
    try {
      const body = { payment_reference: pay.payment_reference || pay.notice_identifier };
      if (overrides.claim_number) body.claim_number = overrides.claim_number;
      if (amount) body.amount_received = Number(amount);
      if (overrides.utr) body.utr = overrides.utr;
      const res = await api.acknowledgePayment(body);
      if (res?.status === "failed") throw new Error(res.message || "The acknowledgement was refused.");
      setAckResults((prev) => ({ ...prev, [key]: { success: true, correlation_id: res?.correlation_id } }));
      setShowOverrides((prev) => ({ ...prev, [key]: false }));
      await fetchPayment();
    } catch (err) {
      setAckResults((prev) => ({ ...prev, [key]: { success: false, message: err.message } }));
    } finally {
      setAcknowledging((prev) => ({ ...prev, [key]: false }));
    }
  };

  const updateOverride = (key, field, value) => {
    setAckOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }));
  };

  if (loading) {
    return <LoadingBlock text="Fetching payment status…" />;
  }

  if (loadError && !paymentData) {
    return (
      <NextStep
        tone="bad"
        title="The payment status could not be read"
        actions={
          <>
            <button type="button" className="cv-btn" disabled={refreshing} onClick={refresh}>Retry</button>
            <button type="button" className="cv-btn" onClick={() => navigate("../claim")}>Back to claim</button>
          </>
        }
      >
        {loadError}
      </NextStep>
    );
  }

  if (noPayment) {
    return (
      <NextStep
        tone="info"
        title={noPayment.title}
        actions={<button type="button" className="cv-btn" onClick={() => navigate(noPayment.to)}>{noPayment.label}</button>}
      >
        {noPayment.text}
      </NextStep>
    );
  }

  const ledger = moneyLedger || {};
  const settlement = ledger.settlement || {};
  // Only settled money counts as paid, and the ledger holds only the last
  // settled notice, so the payments themselves are the authority.
  const hasEvents = payments.length > 0;
  const gross = hasEvents ? (settledPayments.length ? total(settledPayments, grossOf) : null) : settlement.gross ?? null;
  const tds = hasEvents ? total(settledPayments, (p) => p.tds_amount) : settlement.tds ?? null;
  const net = hasEvents ? (settledPayments.length ? total(settledPayments, netOf) : null) : settlement.net ?? null;
  const inProgress = openPayments.length ? total(openPayments, grossOf) : null;
  const approved = ledger.approved?.value ?? null;
  const shortBy = allSettled && approved != null && gross != null && gross < approved ? approved - gross : null;
  const toCollect = ledger.reconciliation?.to_collect_from_patient ?? ledger.patient_payable?.value ?? null;
  const latestUtr = hasEvents ? settledPayments.concat(openPayments).map((p) => p.utr).filter(Boolean).shift() || null : settlement.utr ?? null;
  const missingUtr = settledPayments.some((p) => !p.utr);

  const verdict = isNotFound
    ? { tone: "pending", label: "Awaiting payment" }
    : allSettled
      ? { tone: shortBy ? "warn" : "ok", label: shortBy ? "Settled short" : "Settled" }
      : settledPayments.length
        ? { tone: "pending", label: `${settledPayments.length} of ${payments.length} settled` }
        : { tone: "pending", label: stageLabel(paymentData?.latest_stage) ? `Payment ${stageLabel(paymentData.latest_stage)}` : "Payment in progress" };

  const statement = [
    approved != null && { label: "Approved by payer", value: approved },
    gross != null && { label: "Gross paid", value: gross },
    tds > 0 && { label: "TDS deducted", value: -tds },
    net != null && { label: "Net credited", value: net, total: true },
    inProgress != null && { label: "In progress", value: inProgress },
  ].filter(Boolean);

  const guide = isNotFound
    ? null
    : allSettled
      ? shortBy
        ? {
            tone: "warn",
            title: "Paid less than approved",
            text: "Compare the amounts below. If the shortfall isn't explained by TDS or a deduction you agree with, go to the Claim step and use Ask for the balance.",
          }
        : missingUtr
          ? { tone: "warn", title: "No UTR from the payer", text: "The payer has not sent a UTR, so this payment cannot be matched to the bank statement yet." }
          : { tone: "ok", title: "Paid in full", text: "Match the UTR below with the hospital's bank statement. Nothing else is needed for this case." }
      : { tone: "info", title: "The payer is paying in stages", text: "More notices may follow. Each one is acknowledged automatically; this page updates by itself." };

  return (
    <div className="wizard-step pd-screen">
      {guide && (
        <NextStep tone={guide.tone} title={guide.title} className="ds-guide">
          {guide.text}
        </NextStep>
      )}
      {loadError && <div className="ep-notice is-bad">{loadError} Still trying.</div>}
      {ackFailed > 0 && (
        <div className="ep-notice is-bad">
          {ackFailed} payment acknowledgement{ackFailed === 1 ? "" : "s"} failed to reach the payer. Retry from the
          payments table below.
        </div>
      )}

      <div className="pd-layout">
        <div className="pd-main">
          {isNotFound ? (
            <Section id="pay-none" title="No payment yet" info="payment_notice">
              <p className="ds-empty">
                The payer sends payment notices on its own schedule, typically hours to days after the claim is
                approved. Each notice is acknowledged automatically when it arrives.
              </p>
              <div className="ds-empty-actions">
                <Button variant="outline" size="small" icon={RefreshCw} disabled={refreshing} onClick={refresh}>
                  Check again
                </Button>
              </div>
            </Section>
          ) : (
            <>
              <Section
                id="pay-settlement"
                title="Settlement"
                info="utr"
                tip="TDS is tax the payer deducts and deposits for the hospital; net credited is what reaches the bank."
              >
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
                        const ref = pay.payment_reference || pay.notice_identifier;
                        const key = pay.group_key;
                        const ackResult = ackResults[key];
                        const isAcknowledging = acknowledging[key];
                        const ack = ackOf(pay);
                        const ackError = pay.history?.filter((n) => n.acknowledgement_error).pop()?.acknowledgement_error;
                        const editing = showOverrides[key] && !readOnly;
                        // Every notice the payer sent for this payment, shown inline.
                        const historyOpen = pay.notice_count > 1 && pay.history?.length > 0;
                        return (
                          <Fragment key={key}>
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
                                {ack === "done" ? (
                                  "Acknowledged"
                                ) : ack === "sent" ? (
                                  "Acknowledgement sent"
                                ) : ack === "pending" ? (
                                  <span className="ep-muted">In progress</span>
                                ) : (
                                  <div className="pay-ack">
                                    <span className="is-bad">Failed</span>
                                    {ref && (
                                      <button type="button" className="ep-action" disabled={isAcknowledging || readOnly} title={readOnly ? READ_ONLY_TITLE : undefined} onClick={() => handleAcknowledge(pay)}>
                                        {isAcknowledging ? "Retrying…" : "Retry"}
                                      </button>
                                    )}
                                    {ref && !readOnly && (
                                      <button type="button" className="pd-inline-link" onClick={() => setShowOverrides((p) => ({ ...p, [key]: !p[key] }))}>
                                        {editing ? "Close" : "Edit values"}
                                      </button>
                                    )}
                                  </div>
                                )}
                                {ackError && ack === "failed" && <div className="ep-muted">{ackError}</div>}
                                {ackResult && !ackResult.success && <div className="is-bad">{ackResult.message}</div>}
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
                                      <input className="input-modern pd-input" placeholder="Override claim number" value={ackOverrides[key]?.claim_number || ""} onChange={(e) => updateOverride(key, "claim_number", e.target.value)} />
                                    </label>
                                    <label>
                                      <span>Amount received</span>
                                      <input className="input-modern pd-input ep-mono" type="number" placeholder="Override amount" value={ackOverrides[key]?.amount_received || ""} onChange={(e) => updateOverride(key, "amount_received", e.target.value)} />
                                    </label>
                                    <label>
                                      <span>UTR</span>
                                      <input className="input-modern pd-input ep-mono" placeholder="Override UTR" value={ackOverrides[key]?.utr || ""} onChange={(e) => updateOverride(key, "utr", e.target.value)} />
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
            {missingUtr && <div className="ep-notice is-bad">UTR missing</div>}
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
              <Button variant={allSettled ? "primary" : "outline"} icon={allSettled ? Home : undefined} onClick={() => navigate("/dashboard")} className="pd-submit-btn">
                {allSettled ? "Done — back to cases" : "Back to cases"}
              </Button>
              <button type="button" className="pd-text-btn" disabled={refreshing} onClick={refresh}>
                <RefreshCw size={13} /> Refresh payment status
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
