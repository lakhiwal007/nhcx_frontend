import { formatMoney } from "../../format.js";

// One row per part of the payer's answer. A row appears only when it has
// something to show, so a plain approval stays short.
// tone: ok | warn | bad | wait | idle.

const GROUPS = [
  ["decision", "Decision"],
  ["case", "Case"],
  ["followup", "Follow-up"],
  ["technical", "Technical"],
];

const cutLines = (lines) =>
  lines.filter((line) => {
    const adj = line.adjudication || {};
    const approved = adj.benefit?.value ?? adj.eligible?.value;
    return approved != null && adj.submitted?.value != null && approved < adj.submitted.value;
  }).length;

function decisionRows(f) {
  const group = "decision";
  if (f.failed) return [{ id: "delivery", group, name: "Delivery", tone: "bad", fact: "Not delivered" }];
  if (f.notFound) return [{ id: "record", group, name: "Payer's record", tone: "warn", fact: "No record" }];
  if (!f.complete) return [{ id: "waiting", group, name: "Payer's answer", tone: "wait", fact: "Waiting" }];
  const cut = cutLines(f.lines);
  return [
    { id: "amounts", group, name: "Amounts", ...(f.approved != null ? { tone: "ok", fact: formatMoney(f.approved) } : { tone: "idle", fact: "None given" }) },
    f.lines.length > 0 && { id: "lines", group, name: "Line by line", ...(cut ? { tone: "warn", fact: `${cut} cut` } : { tone: "ok", fact: `${f.lines.length} ${f.lines.length === 1 ? "line" : "lines"}` }) },
    f.notes > 0 && { id: "notes", group, name: "Payer notes", tone: f.readNotes ? "warn" : "idle", fact: String(f.notes) },
  ];
}

function enquiryRow(f) {
  if (!f.enquiry) return null;
  const row = { id: "enquiry", group: "followup", name: "Status enquiry" };
  if (f.enquiry === "failed") return { ...row, tone: "bad", fact: "Refused" };
  return f.enquiry === "answered" ? { ...row, tone: "ok", fact: "Answered" } : { ...row, tone: "wait", fact: "Waiting" };
}

export function buildApprovalChecklist(f) {
  const rows = [
    ...decisionRows(f),
    f.clinical > 0 && { id: "clinical", group: "case", name: "Clinical basis", tone: "idle", fact: `${f.clinical} ${f.clinical === 1 ? "item" : "items"}` },
    enquiryRow(f),
    f.errors > 0 && { id: "errors", group: "followup", name: "Payer errors", tone: "bad", fact: String(f.errors) },
    f.complete && { id: "response", group: "technical", name: "Payer response", tone: "idle", fact: "As received" },
  ].filter(Boolean);
  return GROUPS.map(([id, title]) => ({ id, title, rows: rows.filter((r) => r.group === id) })).filter((g) => g.rows.length > 0);
}

// Staff should read the payer's own words first on a query or a rejection.
export function firstApprovalItem(groups, readNotes) {
  const rows = groups.flatMap((g) => g.rows);
  const has = (id) => rows.some((r) => r.id === id);
  if (readNotes && has("notes")) return "notes";
  if (has("errors")) return "errors";
  return rows[0]?.id;
}
