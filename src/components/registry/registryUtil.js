import { formatMoney, humanize } from "../../format.js";
import { isSettled } from "../../caseStatus.js";

const BILLING_STATUS = { 0: "Unpaid", 1: "Paid", 2: "Refunded" };
export const billingLabel = (v) => (v == null || v === "" ? "Draft" : BILLING_STATUS[v] ?? humanize(String(v)));

const sum = (list, pick) => list.reduce((s, x) => s + (Number(pick(x)) || 0), 0);

export const sortedVisits = (patient) => [...(patient?.visits || [])].sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")));

export const currentAdmission = (visits) => visits.find((v) => !v.ended_at) || visits[0] || null;

export const isOpenCase = (c) => !!c && !isSettled(c) && !/CANCELLED/i.test(c.preauth_status || "") && c.status !== "superseded";

export function admissionMoney(visit) {
  const invoices = visit?.invoices || [];
  const paid = [
    ...(visit?.advance_payments || []).map((p) => ({ kind: p.payment_type || "Advance", mode: p.payment_mode, ref: null, date: p.date, amount: p.amount })),
    ...(visit?.payments || []).map((p) => ({ kind: "Collected", mode: p.payment_mode, ref: p.online_txn_id, date: p.collected_at, amount: p.amount })),
  ];
  const billed = sum(invoices, (i) => i.amount_billed);
  const discount = sum(invoices, (i) => i.final_discount);
  const finalBill = sum(invoices, (i) => i.final_amount ?? i.amount_billed);
  const settled = sum(paid, (p) => p.amount);
  return { invoices, paid, billed, discount, finalBill, outstanding: finalBill - settled };
}

export const daysBetween = (from, to) => {
  if (!from) return null;
  const ms = new Date(to || Date.now()) - new Date(from);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000)) : null;
};

export const money = (v) => (v == null ? "—" : v < 0 ? `− ${formatMoney(-v)}` : formatMoney(v));

export const casesOfVisit = (v) => (v?.cases?.length ? v.cases : (v?.claims || []).filter((c) => c.cashless_case_id).map((c) => ({ ...c, admission_no: v.admission_no })));

export function patientCases(patient) {
  const latest = patient?.latest_claim;
  const visits = sortedVisits(patient);
  const legacy = visits.flatMap((v) => (v.claims || []).map((c) => ({ ...c, ...(latest && c.cashless_case_id === latest.cashless_case_id ? latest : {}), admission_no: v.admission_no })));
  const list = patient?.cases?.length ? patient.cases : legacy.length ? legacy : latest ? [latest] : [];
  return [...list].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

export const amountOf = (totals) => totals?.benefit?.value ?? totals?.eligible?.value ?? null;

export const estimatedBill = (visit) => visit?.invoices?.reduce((s, inv) => s + (inv.final_amount ?? inv.amount_billed ?? 0), 0) || null;
