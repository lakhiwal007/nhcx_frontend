import { formatMoney } from "../../format.js";

// One row per thing the desk reconciles. tone: ok | warn | bad | wait | idle.

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
  if (f.ackFailed) return { ...row, tone: "bad", fact: `${f.ackFailed} failed` };
  return f.ackPending ? { ...row, tone: "wait", fact: `${f.ackPending} in progress` } : { ...row, tone: "ok", fact: "All sent" };
}

export function buildPaymentChecklist(f) {
  const rows = [
    amountRow(f),
    utrRow(f),
    { id: "payments", group: "payments", name: "Payments", tone: "idle", fact: String(f.payments) },
    f.notices > f.payments && { id: "notices", group: "payments", name: "Notices", tone: "idle", fact: String(f.notices) },
    ackRow(f),
  ].filter(Boolean);
  return GROUPS.map(([id, title]) => ({ id, title, rows: rows.filter((r) => r.group === id) })).filter((g) => g.rows.length > 0);
}

export function firstPaymentItem(groups, picked) {
  const rows = groups.flatMap((g) => g.rows);
  if (rows.some((r) => r.id === picked)) return picked;
  return (rows.find((r) => r.tone === "bad") || rows.find((r) => r.tone === "warn") || rows[0])?.id;
}
