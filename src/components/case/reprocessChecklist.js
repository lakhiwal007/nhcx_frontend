import { formatMoney } from "../../format.js";

// One row per part of the appeal. Before the send `blocks` marks what stops it;
// after the send the rows follow the payer's answer.
// tone: ok | warn | bad | wait | idle.

const GROUPS = [
  ["grounds", "Grounds"],
  ["evidence", "Evidence"],
  ["decision", "Decision"],
  ["appeal", "Appeal"],
];

const formRows = (f) => [
  { id: "reason", group: "grounds", name: "Reason", tone: "ok", fact: f.reasonShort },
  {
    id: "explanation",
    group: "grounds",
    name: "Explanation",
    ...(f.explained ? { tone: "ok", fact: "Written" } : { tone: "bad", fact: "Empty", blocks: true }),
  },
  { id: "documents", group: "evidence", name: "Documents", ...(f.attached ? { tone: "ok", fact: `${f.attached} attached` } : { tone: "warn", fact: "None attached" }) },
];

function decisionRows(f) {
  const group = "decision";
  if (f.failed) return [{ id: "delivery", group, name: "Delivery", tone: "bad", fact: "Not delivered" }];
  if (f.notFound) return [{ id: "record", group, name: "Payer's record", tone: "warn", fact: "No record" }];
  if (!f.complete) return [{ id: "waiting", group, name: "Payer's answer", tone: "wait", fact: "Waiting" }];
  return [
    { id: "amounts", group, name: "Amounts", ...(f.approved != null ? { tone: f.cut ? "warn" : "ok", fact: formatMoney(f.approved) } : { tone: "idle", fact: "Not stated" }) },
    f.lines > 0 && { id: "lines", group, name: "Line by line", ...(f.cut ? { tone: "warn", fact: `${f.cut} cut` } : { tone: "ok", fact: `${f.lines} ${f.lines === 1 ? "line" : "lines"}` }) },
    f.notes > 0 && { id: "notes", group, name: "Payer notes", tone: f.readNotes ? "warn" : "idle", fact: String(f.notes) },
  ];
}

export function buildReprocessChecklist(f) {
  const rows = (f.sent
    ? [...decisionRows(f), { id: "details", group: "appeal", name: "Appeal details", tone: "idle", fact: f.failed ? "Not sent" : "Sent" }]
    : formRows(f)
  ).filter(Boolean);
  return GROUPS.map(([id, title]) => ({ id, title, rows: rows.filter((r) => r.group === id) })).filter((g) => g.rows.length > 0);
}

export function firstReprocessItem(groups, picked) {
  const rows = groups.flatMap((g) => g.rows);
  if (rows.some((r) => r.id === picked)) return picked;
  return (rows.find((r) => r.blocks) || rows.find((r) => r.tone === "warn") || rows[0])?.id;
}
