import { decisionRows, firstItem, groupRows } from "../step/checklistShared";

const GROUPS = [
  ["decision", "Decision"],
  ["case", "Case"],
  ["followup", "Follow-up"],
  ["technical", "Technical"],
];

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
  ];
  return groupRows(GROUPS, rows);
}

export function firstApprovalItem(groups, readNotes) {
  return firstItem(groups, [readNotes ? "notes" : null, "errors"]) ?? groups[0]?.rows[0]?.id;
}
