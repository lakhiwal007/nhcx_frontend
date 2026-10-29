import { formatDate } from "../../format.js";

export const period = (start, end) => (start || end ? `${formatDate(start)} – ${formatDate(end)}` : null);

export function deriveChecks(ce, benefitsTimedOut) {
  if (!ce) return null;
  const pick = (sub) => sub || (ce.validation || ce.benefits || ce.auth_requirements ? null : ce);
  const stateOf = (sub) => {
    if (!sub) return "pending";
    if (sub.status === "complete") return sub.errors?.length ? "error" : "done";
    if (sub.status === "failed") return "error";
    return "pending";
  };
  const itemsOf = (sub) => (sub?.insurance_items || []).flatMap((ins) => (ins.items || []).map((it) => ({ ...it, _coverage: ins.coverage })));
  const validation = pick(ce.validation);
  const benefits = pick(ce.benefits);
  const auth = pick(ce.auth_requirements);
  const coverage =
    validation?.insurance_items?.find((ins) => ins.coverage_details) ||
    benefits?.insurance_items?.find((ins) => ins.coverage_details) ||
    validation?.insurance_items?.[0] ||
    null;
  return {
    coverage,
    inforce: validation?.inforce ?? coverage?.inforce ?? null,
    wallet: validation?.wallet || benefits?.wallet || auth?.wallet || null,
    validation: { sub: validation, state: stateOf(validation), items: itemsOf(validation) },
    benefits: { sub: benefits, state: benefitsTimedOut ? "unavailable" : stateOf(benefits), items: itemsOf(benefits) },
    auth: {
      sub: auth,
      state: stateOf(auth),
      items: itemsOf(auth).length ? itemsOf(auth) : itemsOf(benefits),
      required: auth?.auth_required ?? ce.auth_required ?? null,
    },
  };
}
