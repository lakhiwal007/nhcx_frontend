import { formatMoney } from "../../../lib/format.js";
import { cutLines } from "../step/verdict";
import { groupRows } from "../step/checklistShared";
import { asRecord } from "../step/useCasePane";

const GROUPS = [
  ["grounds", "Grounds"],
  ["evidence", "Evidence"],
  ["decision", "Decision"],
  ["appeal", "Appeal"],
];

const formRows = (f) => [
  { id: "reason", group: "grounds", name: "Reason", tone: "ok", fact: f.reasonShort },
  { id: "explanation", group: "grounds", name: "Explanation", ...(f.explained ? { tone: "ok", fact: "Written" } : { tone: "bad", fact: "Empty", blocks: true }) },
  { id: "documents", group: "evidence", name: "Documents", ...(f.attached ? { tone: "ok", fact: `${f.attached} attached` } : { tone: "warn", fact: "None attached" }) },
];

function decisionRows(f) {
  const group = "decision";
  if (f.failed) return [{ id: "decision", group, name: "Delivery", tone: "refused", fact: f.refused ? "Refused by the payer" : "Not delivered" }];
  if (f.notFound) return [{ id: "decision", group, name: "Payer's record", tone: "warn", fact: "No record" }];
  if (!f.complete) return [{ id: "decision", group, name: "Payer's answer", tone: "wait", fact: "Waiting" }];
  const cut = cutLines(f.lines).length;
  const word = f.decision === "APPROVED" ? "Accepted" : f.decision === "PARTIALLY_APPROVED" ? "Partly" : f.decision === "QUERIED" ? "Queried" : f.decision === "REJECTED" ? "Rejected" : "Unclear";
  const tone = f.decision === "APPROVED" ? "ok" : f.decision === "REJECTED" ? "refused" : "warn";
  return [
    { id: "decision", group, name: "Payer's answer", tone, fact: word },
    f.approved != null && { id: "amounts", group, name: "Amounts", tone: cut ? "warn" : "ok", fact: formatMoney(f.approved) },
    f.lines.length > 0 && { id: "lines", group, name: "Line by line", ...(cut ? { tone: "warn", fact: `${cut} cut` } : { tone: "ok", fact: `${f.lines.length} ${f.lines.length === 1 ? "line" : "lines"}` }) },
    f.notes > 0 && { id: "notes", group, name: "Payer's notes", tone: f.readNotes ? "warn" : "idle", fact: String(f.notes) },
  ];
}

export function buildReprocessChecklist(f) {
  const rows = f.sent
    ? [...decisionRows(f), { id: "details", group: "appeal", name: "What was sent", tone: "idle", fact: f.failed && !f.refused ? "Not sent" : "Sent" }]
    : f.locked
      ? formRows(f).map((r) => ({ ...asRecord(r), blocks: false }))
      : formRows(f);
  return groupRows(GROUPS, rows);
}

export function firstReprocessItem(groups, picked) {
  const rows = groups.flatMap((g) => g.rows);
  if (rows.some((r) => r.id === picked)) return picked;
  return (rows.find((r) => r.blocks) || rows.find((r) => r.group === "decision") || rows.find((r) => r.tone === "warn") || rows[0])?.id;
}
