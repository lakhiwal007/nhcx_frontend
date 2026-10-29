import { formatDate, formatMoney } from "../../format.js";
import { extractPayrCode } from "../../api/payrErrors.js";

const list = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== "") : []);
const coded = (c) => (c ? [c.code, c.display].filter(Boolean).join(" · ") || null : null);
const period = (p) => (p && (p.start || p.end) ? `${formatDate(p.start)} – ${formatDate(p.end)}` : null);
const joined = (v) => (list(v).length ? list(v).join(", ") : null);

export const PROFILE_URL = "https://nrces.in/ndhm/fhir/r4/StructureDefinition-InsurancePlan.html";

export function planFieldGroups(plan) {
  const summary = plan?.plan || {};
  const details = plan?.plan_details || {};
  const p = details.profile || {};
  const ids = list(p.identifiers);
  const policyId = ids.find((i) => i.type === "NH")?.value || details.identifier || summary.policy_code;
  const planId = ids.find((i) => i.type === "XV")?.value || summary.plan_identifier || details.id;
  const cost = list(p.general_cost)[0] || {};
  const categories = plan?.categories || [];
  const stats = plan?.stats || {};
  const f = (label, value, path, card, ms) => ({ label, value: value == null || value === "" ? null : value, path, card, ms, required: card.startsWith("1") });
  return [
    {
      title: "The plan",
      path: "InsurancePlan",
      fields: [
        f("Name", summary.plan_title || details.name, "name", "1..1", true),
        f("Policy number", policyId, "identifier", "1..1", true),
        f("Plan id", planId, "identifier", "1..1", true),
        f("Status", p.status || details.status, "status", "1..1", true),
        f("Type", coded(p.type) || summary.plan_type, "type", "1..1", true),
        f("Period", period(p.period || details.period), "period", "1..1", true),
        f("Owned by", p.owned_by, "ownedBy", "1..1", true),
        f("Administered by", p.administered_by, "administeredBy", "0..1", true),
        f("Also called", joined(p.alias), "alias", "0..*", true),
        f("Coverage area", joined(p.coverage_area), "coverageArea", "0..*", true),
        f("Network", joined(p.network), "network", "0..*", true),
        f("Contact", list(p.contact).map((c) => [c.purpose, c.name, ...(c.telecom || [])].filter(Boolean).join(" · ")).join("; ") || null, "contact", "0..*", true),
        f("Endpoint", joined(p.endpoint), "endpoint", "0..*", false),
      ],
    },
    {
      title: "Cost sharing",
      path: "InsurancePlan.plan",
      fields: [
        f("Plan type", coded(p.plan_type), "plan.type", "1..1", true),
        f("Plan identifier", joined(p.plan_identifier), "plan.identifier", "0..*", false),
        f("Sum insured", summary.sum_insured != null ? formatMoney(summary.sum_insured) : cost.cost != null ? formatMoney(cost.cost) : null, "plan.generalCost.cost", "0..1", true),
        f("Cost type", cost.type, "plan.generalCost.type", "0..1", false),
        f("Group size", cost.group_size, "plan.generalCost.groupSize", "0..1", false),
        f("Comment", cost.comment, "plan.generalCost.comment", "0..1", false),
        f("Specialties", categories.length ? String(categories.length) : null, "plan.specificCost.category", "1..1", true),
        f("Packages", plan?.benefit_count ? `${plan.benefit_count.toLocaleString("en-IN")}${stats.needs_preauth != null ? ` (${stats.needs_preauth.toLocaleString("en-IN")} need pre-auth)` : ""}` : null, "plan.specificCost.benefit", "0..*", true),
        f("Coverage groups", p.coverage_count ? String(p.coverage_count) : null, "coverage", "1..*", true),
        f("Proof of presence", summary.proof_of_presence_required ? "Required (ADN on the plan)" : "Not required", "extension:claim-supportingInfoRequirement", "0..*", false),
      ],
    },
  ];
}

export function missingRequired(plan) {
  return planFieldGroups(plan).flatMap((g) => g.fields).filter((x) => x.required && x.value == null);
}

export function profileRows(plan) {
  const p = plan?.plan_details?.profile;
  const kept = (v) => (v ? "Yes" : "Raw bundle only");
  const fields = planFieldGroups(plan).flatMap((g) => g.fields.map((x) => ({ ...x, path: g.path === "InsurancePlan" ? `InsurancePlan.${x.path}` : x.path })));
  const extra = [
    { path: "InsurancePlan.extension:claim-exclusion", card: "0..*", ms: false, value: list(plan?.exclusions).length ? "sent" : null, kept: true },
    { path: "coverage.benefit.limit", card: "0..*", ms: true, value: plan?.benefit_count ? "sent" : null, kept: true },
    { path: "plan.specificCost.benefit.cost", card: "0..*", ms: false, value: plan?.benefit_count ? "sent" : null, kept: true },
    { path: "Claim-Condition (per package)", card: "0..*", ms: false, value: plan?.benefit_count ? "sent" : null, kept: true },
    { path: "Questionnaire (bundle entries)", card: "0..*", ms: false, value: plan?.form_count ? "sent" : null, kept: true },
  ];
  return [
    ...fields.map((x) => ({ path: x.path, card: x.card, ms: x.ms, sent: x.value != null, kept: p ? kept(true) : kept(false) })),
    ...extra.map((x) => ({ path: x.path, card: x.card, ms: x.ms, sent: x.value != null, kept: kept(x.kept) })),
  ];
}

const HOUR_MS = 60 * 60 * 1000;
const EMPTY_PLAN = /carries no InsurancePlan/i;

export function planState(plan, now = Date.now()) {
  if (!plan) return { key: "not_requested" };
  const status = plan.plan_status;
  if (status === "ready") return { key: "ready" };
  if (status === "not_requested") return { key: plan.refused ? "already" : "not_requested" };
  if (status === "empty") return { key: EMPTY_PLAN.test(plan.error_message || "") ? "no_plan" : "no_packages" };
  if (status === "error" || plan.status === "failed") {
    const text = [plan.error_message, ...(plan.errors || []).map((e) => `${e.code || ""} ${e.message || ""}`)].filter(Boolean).join(" ");
    return { key: extractPayrCode(text) ? "refused" : "unreachable", code: extractPayrCode(text), text };
  }
  const sent = Date.parse(plan.requested_at || "") || null;
  const waited = sent ? now - sent : 0;
  return { key: waited > HOUR_MS ? "late" : "asking", sent, minutes: Math.max(1, Math.round(waited / 60000)) };
}
