import { formatMoney } from "../../../lib/format.js";
import { groupRows } from "../step/checklistShared";

const GROUPS = [
  ["settlement", "Settlement"],
  ["payments", "Payments"],
  ["ack", "Acknowledgement"],
];

function amountRow(f) {
  const row = { id: "amounts", group: "settlement", name: "Amounts" };
  if (f.shortBy) return { ...row, tone: "warn", fact: `${formatMoney(f.shortBy)} short` };
  if (f.allSettled) return { ...row, tone: "ok", fact: formatMoney(f.net) };
  return { ...row, tone: "wait", fact: f.net != null ? `${formatMoney(f.net)} so far` : "In progress" };
}

function utrRow(f) {
  const row = { id: "utr", group: "settlement", name: "UTR" };
  if (f.missingUtr) return { ...row, tone: "warn", fact: "Missing" };
  return f.utr ? { ...row, tone: "ok", fact: f.utr } : null;
}

function ackRow(f) {
  const row = { id: "acks", group: "ack", name: "Acknowledgements" };
  if (f.ackFailed) return { ...row, tone: "refused", fact: `${f.ackFailed} failed` };
  return f.ackPending ? { ...row, tone: "wait", fact: `${f.ackPending} in progress` } : { ...row, tone: "ok", fact: "All sent" };
}

export function buildPaymentChecklist(f) {
  return groupRows(GROUPS, [
    amountRow(f),
    utrRow(f),
    { id: "payments", group: "payments", name: "Payments", tone: "idle", fact: f.payments === 1 ? "1 payment" : `${f.payments} payments` },
    ackRow(f),
  ]);
}

export function firstPaymentItem(groups, picked) {
  const rows = groups.flatMap((g) => g.rows);
  if (rows.some((r) => r.id === picked)) return picked;
  return (rows.find((r) => r.tone === "refused" || r.tone === "bad") || rows.find((r) => r.tone === "warn") || rows[0])?.id;
}
