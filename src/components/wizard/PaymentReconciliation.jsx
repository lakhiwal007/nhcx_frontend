import { useState, useEffect, useRef, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { api } from "../../api";
import { usePoll } from "../../hooks/usePoll";
import { useReadOnly } from "../../readOnly";
import { LoadingBlock, formatMoney, NextStep } from "../Common";
import { formatDate, formatDateTime } from "../../format.js";
import { ackState, groupPaymentEvents, stageLabel } from "../../paymentEvents.js";
import { projectCaseStatus } from "../case/caseStages";
import CaseChecklist from "../case/CaseChecklist";
import { useCasePane } from "../case/useCasePane";
import { buildPaymentChecklist, firstPaymentItem } from "../case/paymentChecklist";

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
  const { picked, paneRef, openItem } = useCasePane();
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

  const backToCases = (
    <button type="button" className="cv-btn" onClick={() => navigate("/dashboard")}>Back to cases</button>
  );
  const checkAgain = (
    <button type="button" className="cv-btn is-primary" disabled={refreshing} onClick={refresh}>
      <RefreshCw size={14} /> {refreshing ? "Checking…" : "Check again"}
    </button>
  );
  const updateNote = loadError && <div className="cv-notice-hint cv-verdict-note is-bad"><strong>Not updated:</strong> {loadError} Still trying.</div>;

  if (isNotFound) {
    return (
      <div className="cv-elig">
        <div className="cv-notice cv-verdict is-info">
          <div className="cv-verdict-row">
            <span className="cv-chip is-info">Awaiting payment</span>
            <span className="cv-notice-body">The payer sends payment notices on its own schedule, usually hours to days after approval. This page updates by itself.</span>
            <span className="cv-verdict-actions">{backToCases}{checkAgain}</span>
          </div>
          {updateNote}
        </div>
      </div>
    );
  }

  const verdict = allSettled
    ? { tone: shortBy ? "warn" : "ok", label: shortBy ? "Settled short" : "Settled" }
    : { tone: "info", label: settledPayments.length ? `${settledPayments.length} of ${payments.length} settled` : `Payment ${stageLabel(paymentData?.latest_stage) || "in progress"}` };
  const note = ackFailed
    ? "The payer has not been told this payment arrived. Retry the acknowledgement."
    : shortBy
      ? "Paid less than approved. If TDS or a deduction you agree with does not explain it, ask for the balance."
      : missingUtr
        ? "The payer has not sent a UTR, so this payment cannot be matched to the bank statement yet."
        : allSettled
          ? "Match the UTR with the hospital's bank statement. Nothing else is needed for this case."
          : "More notices may follow. Each is acknowledged automatically and this page updates by itself.";

  const statement = [
    ["Approved by payer", approved != null && formatMoney(approved)],
    ["Gross paid", gross != null && formatMoney(gross)],
    ["TDS deducted", tds > 0 && `− ${formatMoney(tds)}`],
    ["Net credited", net != null && formatMoney(net)],
    ["In progress", inProgress != null && formatMoney(inProgress)],
    ["Short of approved amount", shortBy != null && formatMoney(shortBy)],
    [ledger.patient_payable?.formula ? `Patient payable (${ledger.patient_payable.formula})` : "Patient payable", toCollect > 0 && formatMoney(toCollect)],
  ].filter(([, value]) => value);

  const notices = paymentData?.events || [];
  const breakdown = payments.flatMap((pay) => (pay.history || []).flatMap((n) => (n.detail_items || []).map((item) => ({ ...item, payment: pay.payment_reference }))));
  const failedPayments = payments.filter((p) => ackOf(p) === "failed");
  const onlyFailed = failedPayments.length === 1 ? failedPayments[0] : null;
  const retryable = (pay) => !readOnly && !!(pay.payment_reference || pay.notice_identifier);

  const groups = buildPaymentChecklist({
    allSettled,
    shortBy,
    net,
    utr: latestUtr,
    missingUtr,
    payments: payments.length,
    notices: notices.length,
    ackFailed,
    ackPending,
  });
  const open = firstPaymentItem(groups, picked);
  const paneFor = (id) => ({ hidden: open !== id });

  return (
    <div className="cv-elig">
      <div className={`cv-notice cv-verdict is-${verdict.tone}`}>
        <div className="cv-verdict-row">
          <span className={`cv-chip is-${verdict.tone}`}>{verdict.label}</span>
          <span className="cv-notice-body">
            {net != null ? <><strong>{formatMoney(net)}</strong> credited</> : "Nothing credited yet"}
            {inProgress != null ? ` · ${formatMoney(inProgress)} in progress` : ""}
            {latestUtr && <span className="cv-mono cv-card-meta cv-bar-ref">{latestUtr}</span>}
          </span>
          <span className="cv-verdict-actions">
            {backToCases}
            {failedPayments.length > 1 ? (
              <button type="button" className="cv-btn is-primary" onClick={() => openItem("acks")}>Open acknowledgements</button>
            ) : onlyFailed && retryable(onlyFailed) ? (
              <button type="button" className="cv-btn is-primary" disabled={acknowledging[onlyFailed.group_key]} onClick={() => handleAcknowledge(onlyFailed)}>
                {acknowledging[onlyFailed.group_key] ? "Retrying…" : "Retry acknowledgement"}
              </button>
            ) : shortBy && !readOnly ? (
              <button type="button" className="cv-btn is-primary" onClick={() => navigate("../claim", { state: { openAction: "request_claim_release", releaseAmount: shortBy } })}>Ask for the balance</button>
            ) : !allSettled ? (
              checkAgain
            ) : null}
          </span>
        </div>
        <div className={`cv-notice-hint cv-verdict-note${ackFailed ? " is-bad" : ""}`}>{note}</div>
        {updateNote}
      </div>

      <div className="cv-work">
        <CaseChecklist groups={groups} open={open} onOpen={openItem} label="Payment checklist" />

        <div className="cv-work-pane" ref={paneRef}>
          <div {...paneFor("amounts")}>
            <section className="cv-card" aria-label="Amounts">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Amounts</h2>
                <span className="cv-card-meta">TDS is tax the payer deducts and deposits for the hospital</span>
              </div>
              <div className="cv-card-body">
                {statement.map(([label, value]) => (
                  <div key={label} className="cv-kv"><span>{label}</span><span>{value}</span></div>
                ))}
              </div>
            </section>
          </div>

          <div {...paneFor("utr")}>
            <section className="cv-card" aria-label="UTR">
              <div className="cv-card-head"><h2 className="cv-card-title">UTR</h2></div>
              <div className="cv-tw cv-in-card">
                <table>
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th>UTR</th>
                      <th style={{ width: 90 }}>Type</th>
                      <th style={{ width: 130 }}>Paid on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((pay) => (
                      <tr key={pay.group_key}>
                        <td className="cv-mono">{pay.payment_reference || "—"}</td>
                        <td className="cv-mono">{pay.utr || (pay.settled ? "Missing" : "—")}</td>
                        <td>{pay.utr_type || "—"}</td>
                        <td>{pay.payment_date ? formatDate(pay.payment_date) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div {...paneFor("payments")}>
            <section className="cv-card" aria-label="Payments">
              <div className="cv-card-head"><h2 className="cv-card-title">Payments</h2></div>
              <div className="cv-tw cv-in-card">
                <table>
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th style={{ width: 110 }}>Stage</th>
                      <th style={{ width: 110 }}>Notice</th>
                      <th style={{ width: 110 }}>Gross</th>
                      <th style={{ width: 100 }}>TDS</th>
                      <th style={{ width: 110 }}>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((pay) => (
                      <tr key={pay.group_key}>
                        <td>
                          <div className="cv-mono">{pay.payment_reference || "—"}</div>
                          <div className="cv-card-meta">{[pay.claim_reference, pay.recon_identifier, pay.payment_status].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="ep-cap">{stageLabel(pay.payment_stage) || "—"}</td>
                        <td>{formatMoney(pay.notice_amount)}</td>
                        <td>{formatMoney(pay.gross_amount)}</td>
                        <td>{formatMoney(pay.tds_amount)}</td>
                        <td>{formatMoney(pay.net_payment_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {breakdown.length > 0 && (
                <div className="cv-tw cv-in-card">
                  <table aria-label="Payment breakdown">
                    <thead>
                      <tr>
                        <th>Breakdown</th>
                        <th style={{ width: 130 }}>Date</th>
                        <th style={{ width: 110 }}>Amount</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.map((item, i) => (
                        <tr key={i}>
                          <td>{item.type_display || item.type || "—"}</td>
                          <td>{item.date ? formatDate(item.date) : "—"}</td>
                          <td>{formatMoney(item.amount)}</td>
                          <td>{item.reason || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div {...paneFor("notices")}>
            <section className="cv-card" aria-label="Notices">
              <div className="cv-card-head"><h2 className="cv-card-title">Notices</h2></div>
              <div className="cv-tw cv-in-card">
                <table>
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th style={{ width: 110 }}>Stage</th>
                      <th style={{ width: 170 }}>Received</th>
                      <th style={{ width: 110 }}>Net</th>
                      <th style={{ width: 130 }}>Acknowledged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notices.map((notice, i) => (
                      <tr key={notice.event_key || notice.correlation_id || i}>
                        <td className="cv-mono">{notice.payment_reference || "—"}</td>
                        <td className="ep-cap">{stageLabel(notice.payment_stage) || "—"}</td>
                        <td>{notice.received_at ? formatDateTime(notice.received_at) : "—"}</td>
                        <td>{formatMoney(notice.net_payment_amount)}</td>
                        <td>{notice.acknowledgement_status === "submitted" ? "Yes" : notice.acknowledgement_status === "failed" ? "Failed" : "In progress"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div {...paneFor("acks")}>
            <section className="cv-card" aria-label="Acknowledgements">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Acknowledgements</h2>
                <span className="cv-card-meta">Sent automatically; retry only when one fails</span>
              </div>
              <div className="cv-tw cv-in-card">
                <table>
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th style={{ width: 130 }}>Status</th>
                      <th style={{ width: 170 }}>Acknowledged at</th>
                      <th style={{ width: 210 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((pay) => {
                      const key = pay.group_key;
                      const ack = ackOf(pay);
                      const result = ackResults[key];
                      const ackError = pay.history?.filter((n) => n.acknowledgement_error).pop()?.acknowledgement_error;
                      const canRetry = ack === "failed" && retryable(pay);
                      const editing = showOverrides[key] && canRetry;
                      return (
                        <Fragment key={key}>
                          <tr>
                            <td>
                              <div className="cv-mono">{pay.payment_reference || pay.notice_identifier || "—"}</div>
                              {ack === "failed" && ackError && <div className="cv-card-meta">{ackError}</div>}
                              {result && !result.success && <div className="is-bad">{result.message}</div>}
                            </td>
                            <td>
                              <span className={`cv-chip ${ack === "failed" ? "is-bad" : ack === "pending" ? "is-info" : "is-ok"}`}>
                                {ack === "failed" ? "Failed" : ack === "pending" ? "In progress" : ack === "sent" ? "Sent" : "Acknowledged"}
                              </span>
                            </td>
                            <td>{pay.acknowledged_at ? formatDateTime(pay.acknowledged_at) : "—"}</td>
                            <td>
                              {canRetry ? (
                                <div className="pay-ack">
                                  <button type="button" className="cv-btn" disabled={acknowledging[key]} onClick={() => handleAcknowledge(pay)}>
                                    {acknowledging[key] ? "Retrying…" : "Retry"}
                                  </button>
                                  <button type="button" className="pd-inline-link" onClick={() => setShowOverrides((p) => ({ ...p, [key]: !p[key] }))}>
                                    {editing ? "Close" : "Edit values"}
                                  </button>
                                </div>
                              ) : "—"}
                            </td>
                          </tr>
                          {editing && (
                            <tr className="pay-subrow">
                              <td colSpan={4}>
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
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
