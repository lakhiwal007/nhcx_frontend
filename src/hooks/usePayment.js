import { useRef, useState } from "react";
import { api, markHandled } from "../api";
import { toast } from "../toast";
import { useWorkflowStatus } from "./useWorkflowStatus";
import { ackState, groupPaymentEvents } from "../paymentEvents.js";

const POLL_INTERVAL_MS = 30000;

const grossOf = (p) => p.gross_amount ?? p.total_payment_amount ?? p.notice_amount ?? 0;
const netOf = (p) => p.net_payment_amount ?? p.total_payment_amount ?? p.notice_amount ?? 0;
const sum = (list, of) => list.reduce((acc, p) => acc + (Number(of(p)) || 0), 0);
const eventTime = (p) => Date.parse(p.received_at) || Date.parse(p.payment_date) || 0;

export function noPaymentReason(claimLeg) {
  if (claimLeg === "rejected") return { title: "The claim was rejected", text: "No payment will follow unless an appeal succeeds.", label: "Open Reprocess", to: "../reprocess" };
  if (claimLeg === "queried") return { title: "The claim has an open query", text: "The payer will not pay until it is answered.", label: "Back to claim", to: "../claim" };
  if (claimLeg === "submitting") return { title: "The claim is with the payer", text: "Payment follows once the payer approves it.", label: "Back to claim", to: "../claim" };
  if (claimLeg === "draft" || claimLeg === "error") return { title: "No claim has been sent", text: "Payment follows an approved final claim.", label: "Back to claim", to: "../claim" };
  return null;
}

const settledAndAcked = (events) => {
  const payments = groupPaymentEvents(events);
  return payments.length > 0 && payments.every((p) => p.settled && ackState(p) === "done");
};

export function usePayment(ctx) {
  const { caseState, cashlessCase, moneyLedger, refreshTimeline, reloadCase } = ctx;
  const caseId = caseState.cashless_case_id || null;
  const claimId = cashlessCase?.claim_id ?? caseState.claim_id ?? null;
  const claimLeg = cashlessCase?.legs?.claim;
  const seen = useRef(null);
  const [acking, setAcking] = useState({});
  const [results, setResults] = useState({});

  const status = useWorkflowStatus((signal) => api.searchPaymentStatus({ claim_id: claimId }, signal), {
    key: claimId,
    intervalMs: POLL_INTERVAL_MS,
    isTerminal: (res) => (res?.events?.length ? settledAndAcked(res.events) : !!noPaymentReason(claimLeg)),
    onData: (res) => {
      const key = `${res?.latest_stage}:${res?.total_events}`;
      const before = seen.current;
      seen.current = key;
      if (before && before !== key) {
        refreshTimeline?.();
        reloadCase?.();
      }
    },
  });

  const data = status.data;
  const loading = !!claimId && !data && !status.error;
  const events = data?.events || [];
  const payments = groupPaymentEvents(events);
  const ackOf = (pay) => (results[pay.group_key]?.sent ? "sent" : ackState(pay));
  const failedPayments = payments.filter((p) => ackOf(p) === "failed");
  const ackPending = payments.filter((p) => ackOf(p) === "pending").length;
  const settledPayments = payments.filter((p) => p.settled);
  const openPayments = payments.filter((p) => !p.settled);
  const allSettled = payments.length > 0 && openPayments.length === 0;
  const isNotFound = !!data && (data.status === "not_found" || !events.length);
  const noPayment = isNotFound ? noPaymentReason(claimLeg) : null;

  const ledger = moneyLedger || {};
  const settlement = ledger.settlement || {};
  const hasEvents = payments.length > 0;
  const gross = hasEvents ? (settledPayments.length ? sum(settledPayments, grossOf) : null) : settlement.gross ?? null;
  const tds = hasEvents ? sum(settledPayments, (p) => p.tds_amount) : settlement.tds ?? null;
  const net = hasEvents ? (settledPayments.length ? sum(settledPayments, netOf) : null) : settlement.net ?? null;
  const inProgress = openPayments.length ? sum(openPayments, grossOf) : null;
  const approved = ledger.approved?.value ?? null;
  const shortBy = allSettled && approved != null && gross != null && gross < approved ? approved - gross : null;
  const toCollect = ledger.reconciliation?.to_collect_from_patient ?? ledger.patient_payable?.value ?? null;
  const latestUtr = hasEvents ? [...settledPayments, ...openPayments].filter((p) => p.utr).sort((a, b) => eventTime(b) - eventTime(a))[0]?.utr || null : settlement.utr ?? null;
  const missingUtr = settledPayments.some((p) => !p.utr);

  const acknowledge = async (pay, claimNumber) => {
    const key = pay.group_key;
    setAcking((prev) => ({ ...prev, [key]: true }));
    try {
      const body = { payment_id: pay.id, payment_reference: pay.payment_reference || pay.notice_identifier, ...(claimNumber?.trim() ? { claim_number: claimNumber.trim() } : {}) };
      const res = await api.acknowledgePayment(body);
      setResults((prev) => ({ ...prev, [key]: { sent: true, correlation_id: res?.correlation_id } }));
      toast.success("Acknowledgement sent to the payer");
      status.refresh();
      return res;
    } catch (err) {
      markHandled(err);
      setResults((prev) => ({ ...prev, [key]: { sent: false, error: err?.message || "The acknowledgement could not be sent." } }));
      return undefined;
    } finally {
      setAcking((prev) => ({ ...prev, [key]: false }));
    }
  };

  return {
    caseId,
    claimId,
    claimLeg,
    status,
    data,
    loading,
    error: status.error,
    events,
    payments,
    ackOf,
    acking,
    results,
    acknowledge,
    failedPayments,
    ackPending,
    settledPayments,
    openPayments,
    allSettled,
    isNotFound,
    noPayment,
    ledger,
    gross,
    tds,
    net,
    inProgress,
    approved,
    shortBy,
    toCollect,
    latestUtr,
    missingUtr,
  };
}
