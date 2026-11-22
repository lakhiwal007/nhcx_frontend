import { formatDate, formatMoney } from "../../../lib/format.js";
import { asRecord } from "../step/useCasePane";

const GROUPS = [
  ["patient", "Patient"],
  ["clinical", "About the stay"],
  ["cost", "Treatment and cost"],
  ["documents", "Files and forms"],
];

function verifyRow(biometric) {
  if (!biometric?.required) return null;
  const row = { id: "verify", group: "patient", name: "Verify the patient", act: "Verify" };
  if (biometric.current) return { ...row, tone: "ok", fact: "Verified" };
  return { ...row, tone: "warn", fact: biometric.latest?.status === "verified" ? "The check has run out" : "Not verified yet" };
}

function clinicalRows(f) {
  const diagnosisFact = f.principal?.code || f.principal?.name || "Principal set";
  const diagnosis = !f.diagnosisCount
    ? { tone: "bad", fact: "Missing", blocks: true }
    : f.hasPrincipal
      ? { tone: "ok", fact: f.diagnosisCount > 1 ? `${diagnosisFact} +${f.diagnosisCount - 1}` : diagnosisFact }
      : { tone: "bad", fact: "Choose the main diagnosis", blocks: true };
  const team = !f.teamCount
    ? { tone: "warn", fact: "No doctor listed", his: true }
    : f.teamMissingReg
      ? { tone: "warn", fact: `${f.teamMissingReg} without a registration number` }
      : { tone: "ok", fact: `${f.teamCount} ${f.teamCount === 1 ? "doctor" : "doctors"}` };
  const coded = f.justification.reduce((sum, [, codes]) => sum + codes.length, 0);
  return [
    { id: "admission", group: "clinical", name: "Admission date", ...(f.admissionDate ? { tone: "ok", fact: formatDate(f.admissionDate) } : { tone: "warn", fact: "Date missing" }) },
    { id: "diagnosis", group: "clinical", name: "Diagnosis", act: "Choose", ...diagnosis },
    { id: "justification", group: "clinical", name: "Reason for treatment", act: "Add detail", ...(coded ? { tone: "ok", fact: `${coded} coded` } : { tone: "warn", fact: "Needs a little more detail", his: true }) },
    { id: "team", group: "clinical", name: "Treating team", ...team },
    f.hasDischargeSummary && { id: "discharge", group: "clinical", name: "Discharge summary", tone: "ok", fact: "On record" },
  ];
}

function linesRow(f) {
  const row = { id: "lines", group: "cost", name: "Treatments" };
  if (!f.lines || f.total <= 0 || f.linesBlocked) return { ...row, tone: "bad", fact: f.lines ? "No amount yet" : "No treatments yet", blocks: true };
  if (f.unnamedLines) return { ...row, tone: "bad", fact: "Name the procedure", blocks: true };
  if (f.unbilled) return { ...row, tone: "warn", fact: `${f.unbilled} not billed yet` };
  return { ...row, tone: "ok", fact: formatMoney(f.total) };
}

function planRow(f) {
  const row = { id: "plan", group: "cost", name: "What the plan covers", act: "See what is covered" };
  if (f.planBlocked) return { ...row, tone: "bad", fact: "Cannot be sent as it is", blocks: true };
  if (!f.planChecked) return { ...row, tone: "warn", fact: "Not checked yet", his: true };
  return f.planNotes ? { ...row, tone: "warn", fact: `${f.planNotes} to check` } : { ...row, tone: "ok", fact: "No issues" };
}

function asksRow(f) {
  const row = { id: "asks", group: "documents", name: "What the payer needs", act: "Open the list" };
  if (f.blockingAsks) return { ...row, tone: "bad", fact: `${f.blockingAsks} needed before you can send`, blocks: true };
  const open = f.asks.filter((a) => a.status !== "attached" && a.status !== "answered").length;
  if (open) return { ...row, tone: "warn", fact: `${open} still open` };
  return { ...row, tone: "ok", fact: f.asks.length ? "All in" : "Nothing extra" };
}

function filesRow(f) {
  const row = { id: "files", group: "documents", name: "Other files", act: "Attach" };
  if (f.hasMissingDocs) return { ...row, tone: "bad", fact: "A file is missing", blocks: true };
  return { ...row, tone: "ok", fact: `${f.attachedFiles} attached` };
}

export function buildPreauthChecklist(f) {
  const details = f.patientMissing > 0 && { id: "details", group: "patient", name: "Patient details", act: "Fill in", tone: "bad", fact: `${f.patientMissing} missing`, blocks: true };
  const rows = [verifyRow(f.biometric), details, ...clinicalRows(f), linesRow(f), planRow(f), asksRow(f), filesRow(f)].filter(Boolean);
  const shown = f.locked ? rows.map((r) => ({ ...asRecord(r), blocks: false })) : rows;
  return GROUPS.map(([id, title]) => ({ id, title, rows: shown.filter((r) => r.group === id) })).filter((g) => g.rows.length > 0);
}

export function firstPreauthItem(groups) {
  const rows = groups.flatMap((g) => g.rows);
  return (rows.find((r) => r.blocks && r.tone === "bad") || rows.find((r) => r.tone === "warn" && !r.his) || rows.find((r) => r.tone === "warn") || { id: "lines" }).id;
}
