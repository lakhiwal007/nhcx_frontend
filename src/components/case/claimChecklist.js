import { formatMoney } from "../../format.js";
import { asRecord } from "./useCasePane";

// One row per thing the claim needs, in the order staff work through them.
// tone: ok | warn | bad | wait | idle. `blocks` marks a row that stops the final
// claim, so the rows and the send cannot disagree.

const GROUPS = [
  ["patient", "Patient"],
  ["claim", "Claim"],
  ["documents", "Documents"],
  ["send", "Send"],
];

const LEFT_LABELS = { DTH: "Home", DTM: "Death", LAMA: "LAMA", DAMA: "DAMA" };

function verifyRow(biometric) {
  if (!biometric?.required) return null;
  const row = { id: "verify", group: "patient", name: "Verify patient" };
  if (biometric.current) return { ...row, tone: "ok", fact: "Verified" };
  return { ...row, tone: "warn", fact: biometric.latest?.status === "verified" ? "Lapsed" : "Not verified" };
}

function patientRows(f) {
  const details = f.patientMissing > 0 && { id: "details", group: "patient", name: "Patient details", tone: "bad", fact: `${f.patientMissing} missing`, blocks: true };
  const left = f.dischargeRequired && {
    id: "left",
    group: "patient",
    name: "How they left",
    ...(f.dischargeMissing ? { tone: "bad", fact: `${f.dischargeMissing} missing`, blocks: true } : { tone: "ok", fact: LEFT_LABELS[f.dischargeType] || "Recorded" }),
  };
  return [verifyRow(f.biometric), details, left];
}

function stayRow(f) {
  const row = { id: "stay", group: "claim", name: "Stay & pre-auth" };
  if (!f.hasPreauthRef) return { ...row, tone: "bad", fact: "No pre-auth", blocks: true };
  if (!f.dischargeDate) return { ...row, tone: "warn", fact: "Not discharged" };
  return { ...row, tone: "ok", fact: f.preauthRef };
}

function billRow(f) {
  const row = { id: "bill", group: "claim", name: "Final bill" };
  if (f.hisBlocked) return { ...row, tone: "bad", fact: "Records incomplete", blocks: true };
  if (f.ceilingExcess > 0) return { ...row, tone: "warn", fact: `${formatMoney(f.ceilingExcess)} over`, blocks: !f.ackOverCeiling };
  return { ...row, tone: "ok", fact: f.authorised != null ? "Within authorised" : formatMoney(f.total) };
}

function asksRow(f) {
  const row = { id: "asks", group: "documents", name: "Payer asks" };
  if (f.blockingAsks) return { ...row, tone: "bad", fact: `${f.blockingAsks} must be done`, blocks: true };
  const open = f.asks.filter((a) => a.status !== "attached" && a.status !== "answered").length;
  if (open) return { ...row, tone: "warn", fact: `${open} open` };
  return { ...row, tone: "ok", fact: f.asks.length ? "All in" : "Nothing extra" };
}

function filesRow(f) {
  const row = { id: "files", group: "documents", name: "Other files" };
  if (f.hasMissingDocs) return { ...row, tone: "bad", fact: "File missing", blocks: true };
  return { ...row, tone: "ok", fact: `${f.attachedFiles} attached` };
}

function dischargeRow(f) {
  if (!f.dischargeIntimation) return null;
  const row = { id: "discharge", group: "send", name: "Discharge claim" };
  if (f.dischargeRejected) return { ...row, tone: "bad", fact: "Rejected" };
  if (f.dischargeFailed) return { ...row, tone: "bad", fact: "Not delivered" };
  if (f.dischargePolling) return { ...row, tone: "wait", fact: "Waiting" };
  return f.dischargeSent ? { ...row, tone: "ok", fact: "Sent" } : { ...row, tone: "idle", fact: "Not sent" };
}

function finalRow(f) {
  const row = { id: "final", group: "send", name: "Final claim" };
  if (f.finalFailed) return { ...row, tone: "bad", fact: "Not delivered" };
  return f.finalSent ? { ...row, tone: "ok", fact: "Sent" } : { ...row, tone: "idle", fact: "Not sent" };
}

function decisionRow(f) {
  const row = { id: "decision", group: "send", name: "Decision" };
  if (f.decision === "APPROVED") return { ...row, tone: "ok", fact: "Approved" };
  if (f.decision === "PARTIALLY_APPROVED") return { ...row, tone: "warn", fact: "Part approved" };
  if (f.decision === "QUERIED") return { ...row, tone: "warn", fact: "Queried" };
  if (f.decision === "REJECTED") return { ...row, tone: "bad", fact: "Rejected" };
  if (f.notFound) return { ...row, tone: "warn", fact: "No record" };
  if (f.decision) return { ...row, tone: "warn", fact: "Unclear" };
  return f.finalSent ? { ...row, tone: "wait", fact: "Waiting" } : { ...row, tone: "idle", fact: "Not yet" };
}

export function buildClaimChecklist(f) {
  const yours = [
    ...patientRows(f),
    stayRow(f),
    { id: "justification", group: "claim", name: "Justification", ...(f.justified ? { tone: "ok", fact: `${f.justified} coded` } : { tone: "warn", fact: "Thin" }) },
    billRow(f),
    asksRow(f),
    filesRow(f),
  ].filter(Boolean);
  const rows = [...(f.locked ? yours.map(asRecord) : yours), dischargeRow(f), finalRow(f), decisionRow(f)].filter(Boolean);
  return GROUPS.map(([id, title]) => ({ id, title, rows: rows.filter((r) => r.group === id) })).filter((g) => g.rows.length > 0);
}

// Once the final claim is out, the decision is what matters. Before that, open
// what stops it, then a failed send, then what staff still have to look at.
export function firstClaimItem(groups, { finalSent, locked }) {
  const rows = groups.flatMap((g) => g.rows);
  if (finalSent) return "decision";
  const blocker = !locked && rows.find((r) => r.blocks);
  const failed = rows.find((r) => r.group === "send" && r.tone === "bad");
  const look = rows.find((r) => r.group === "patient" && r.tone === "warn");
  return (blocker || failed || look || { id: "bill" }).id;
}
