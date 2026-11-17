import { missingRequired } from "./planProfile";
import { asRecord } from "../case/step/useCasePane";

const GROUPS = [
  ["you", "Needs you"],
  ["plan", "Plan"],
  ["payer", "Payer's answers"],
];

const ATTENTION = new Set(["warn", "bad"]);

function verifyRow(biometric) {
  if (!biometric?.required) return null;
  const row = { id: "verify", group: "you", name: "Verify patient" };
  if (biometric.current) return { ...row, tone: "ok", fact: "Verified" };
  return { ...row, tone: "warn", fact: biometric.latest?.status === "verified" ? "Lapsed" : "Not verified" };
}

function whoRow(members, chosenId, newborn) {
  const row = { id: "who", group: "you", name: "Who is admitted" };
  if (members.length === 0) return { ...row, tone: "idle", fact: "Not listed yet" };
  const chosen = members.find((m) => m.member_id === chosenId);
  if (!chosen) return { ...row, tone: "warn", fact: "Choose one", blocks: members.length > 1 };
  return { ...row, tone: "ok", fact: newborn ? "Newborn" : chosen.name || "Chosen" };
}

function treatmentRow(procedures, checks, packages, planReady, choice) {
  const row = { id: "treatment", group: "you", name: "Treatment" };
  if (choice?.active) {
    const n = choice.chosen.length;
    return n ? { ...row, tone: "ok", fact: `${n} chosen` } : { ...row, tone: "warn", fact: "Choose a package" };
  }
  if (procedures.length === 0) return { ...row, tone: "warn", fact: "None recorded" };
  const code = (p) => String(p.code);
  const excluded = procedures.filter((p) => checks?.benefits.items.some((it) => it.excluded && String(it.product_or_service?.code) === code(p))).length;
  if (excluded) return { ...row, tone: "bad", fact: `${excluded} excluded` };
  const notInPlan = planReady ? procedures.filter((p) => packages[code(p)] === null).length : 0;
  if (notInPlan) return { ...row, tone: "warn", fact: `${notInPlan} not in plan` };
  return { ...row, tone: "ok", fact: `${procedures.length} planned` };
}

function checkStateRow(check, row, waitingOn) {
  if (waitingOn && (!check || check.state === "pending")) return { ...row, tone: "idle", fact: "Not sent yet" };
  if (!check || check.state === "pending") return { ...row, tone: "wait", fact: "Waiting" };
  if (check.state === "error") return { ...row, tone: "bad", fact: "Failed" };
  if (check.state === "unavailable") return { ...row, tone: "warn", fact: "No answer" };
  return null;
}

function validationRow(checks) {
  const row = { id: "validation", group: "payer", name: "Validation" };
  const open = checkStateRow(checks?.validation, row, checks?.waitingOn);
  if (open) return open;
  if (checks.inforce === false) return { ...row, tone: "refused", fact: "Not in force", blocks: true };
  return checks.inforce ? { ...row, tone: "ok", fact: "In force" } : { ...row, tone: "idle", fact: "Answered" };
}

function benefitsRow(checks) {
  const row = { id: "benefits", group: "payer", name: "Benefits" };
  const count = checks?.benefits.items.length || 0;
  return checkStateRow(checks?.benefits, row, checks?.waitingOn) || { ...row, tone: "ok", fact: count ? `${count} items` : "No item limits" };
}

function authRow(checks, requirements) {
  const row = { id: "auth", group: "payer", name: "Auth requirements" };
  const open = checkStateRow(checks?.auth, row, checks?.waitingOn);
  if (open) return open;
  if (requirements.length) return { ...row, tone: "warn", fact: `${requirements.length} ${requirements.length === 1 ? "ask" : "asks"}` };
  return { ...row, tone: "ok", fact: checks.auth.required === false ? "No pre-auth" : "Nothing asked" };
}

function planRow(plan, state) {
  const row = { id: "plan", group: "plan", name: "Insurance plan" };
  switch (state.key) {
    case "ready": {
      const packages = plan?.benefit_count;
      const fact = packages != null ? `${Number(packages).toLocaleString("en-IN")} packages` : "Ready";
      const shortened = plan?.subsetted || (plan?.missing_forms || []).length > 0 || missingRequired(plan).length > 0;
      return { ...row, tone: shortened ? "warn" : "ok", fact };
    }
    case "already":
    case "asking":
      return { ...row, tone: "wait", fact: "Asking the payer" };
    case "late":
      return { ...row, tone: "warn", fact: "Taking long" };
    case "not_requested":
      return { ...row, tone: "warn", fact: "Not requested" };
    case "no_plan":
      return { ...row, tone: "warn", fact: "No plan" };
    case "no_packages":
      return { ...row, tone: "warn", fact: "No packages" };
    default:
      return { ...row, tone: "bad", fact: "Failed" };
  }
}

export function buildChecklist({ biometric, members, chosenId, newborn, procedures, packages, checks, requirements, plan, state, locked, choice }) {
  const yours = [verifyRow(biometric), whoRow(members, chosenId, newborn), treatmentRow(procedures, checks, packages, state.key === "ready", choice)];
  const planFirst = { ...planRow(plan, state), unsettled: state.key !== "ready" };
  const rows = [...(locked ? yours.map((r) => r && { ...asRecord(r), blocks: false }) : yours), planFirst, validationRow(checks), benefitsRow(checks), authRow(checks, requirements)].filter(Boolean);
  return GROUPS.map(([id, title]) => ({ id, title: locked && id === "you" ? "Patient" : title, rows: rows.filter((r) => r.group === id) }));
}

export function firstOpen(groups) {
  const rows = groups.flatMap((g) => g.rows);
  const blocker = rows.find((r) => (r.tone === "bad" || r.tone === "refused") && r.group !== "plan");
  const yours = rows.find((r) => r.group === "you" && ATTENTION.has(r.tone));
  return (blocker || yours || rows.find((r) => r.tone === "bad") || rows.find((r) => r.unsettled) || { id: "validation" }).id;
}
