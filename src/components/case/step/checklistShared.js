import { formatMoney } from "../../../lib/format.js";
import { cutLines } from "./verdict";

export const groupRows = (groups, rows) =>
  groups
    .map(([id, title]) => ({ id, title, rows: rows.filter(Boolean).filter((r) => r.group === id) }))
    .filter((g) => g.rows.length > 0);

export function firstItem(groups, prefer = []) {
  const rows = groups.flatMap((g) => g.rows);
  const has = (id) => rows.some((r) => r.id === id);
  const wanted = prefer.find((id) => id && has(id));
  if (wanted) return wanted;
  return rows.find((r) => r.blocks)?.id ?? rows.find((r) => r.tone === "bad")?.id ?? rows.find((r) => r.tone === "warn")?.id ?? rows[0]?.id ?? null;
}

export function decisionRows(f, group = "decision") {
  if (f.failed) return [{ id: "delivery", group, name: "Delivery", tone: "refused", fact: "Not delivered" }];
  if (f.notFound) return [{ id: "record", group, name: "Payer's record", tone: "warn", fact: "No record" }];
  if (!f.complete) return [{ id: "waiting", group, name: "Payer's answer", tone: "wait", fact: "Waiting" }];
  const lines = f.lines || [];
  const cut = cutLines(lines).length;
  return [
    { id: "amounts", group, name: "Amounts", ...(f.approved != null ? { tone: "ok", fact: formatMoney(f.approved) } : { tone: "idle", fact: "None given" }) },
    lines.length > 0 && { id: "lines", group, name: "Line by line", ...(cut ? { tone: "warn", fact: `${cut} cut` } : { tone: "ok", fact: `${lines.length} ${lines.length === 1 ? "line" : "lines"}` }) },
    f.notes > 0 && { id: "notes", group, name: "Payer notes", tone: f.readNotes ? "warn" : "idle", fact: String(f.notes) },
  ];
}
