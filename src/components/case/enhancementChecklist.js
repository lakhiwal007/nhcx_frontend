import { formatMoney } from "../../format.js";
import { asRecord } from "./useCasePane";

const GROUPS = [
  ["scope", "New scope"],
  ["amount", "Amount"],
  ["documents", "Documents"],
];

const countRow = (id, name, kept, total) =>
  total > 0 && { id, group: "scope", name, tone: kept === total ? "ok" : "idle", fact: kept === total ? `${total} kept` : `${kept} of ${total} kept` };

export function buildEnhancementChecklist(f) {
  const rows = [
    f.patientMissing > 0 && { id: "details", group: "scope", name: "Patient details", tone: "bad", fact: `${f.patientMissing} missing`, blocks: true },
    f.hisMissing > 0 && { id: "lines", group: "scope", name: "Hospital records", tone: "bad", fact: `${f.hisMissing} missing`, blocks: true, his: true },
    countRow("procedures", "New procedures", f.proceduresKept, f.procedures),
    !f.hisMissing && countRow("lines", "New lines", f.linesKept, f.lines),
    {
      id: "revised",
      group: "amount",
      name: "Revised amount",
      ...(f.delta > 0 ? { tone: "ok", fact: `+ ${formatMoney(f.delta)}` } : { tone: "bad", fact: "Nothing new", blocks: true }),
    },
    f.authorised > 0 && { id: "authorised", group: "amount", name: "Already authorised", tone: "idle", fact: `${f.authorised} ${f.authorised === 1 ? "line" : "lines"}` },
    {
      id: "documents",
      group: "documents",
      name: "Documents",
      ...(f.missingDocs ? { tone: "bad", fact: `${f.missingDocs} missing`, blocks: true } : f.waivedDocs ? { tone: "warn", fact: "Estimate not attached" } : { tone: "ok", fact: `${f.attachedDocs} attached` }),
    },
  ].filter(Boolean);
  const shown = f.locked ? rows.map((r) => ({ ...asRecord(r), blocks: false })) : rows;
  return GROUPS.map(([id, title]) => ({ id, title, rows: shown.filter((r) => r.group === id) })).filter((g) => g.rows.length > 0);
}

export function firstEnhancementItem(groups) {
  const rows = groups.flatMap((g) => g.rows);
  return (rows.find((r) => r.blocks) || rows.find((r) => r.id === "lines") || rows[0])?.id;
}
