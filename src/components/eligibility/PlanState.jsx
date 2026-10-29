import { describePayrError } from "../../api/payrErrors.js";
import { formatDateTime } from "../../format.js";

export default function PlanState({ plan, state, canFetch, sending, onFetch, result }) {
  const busy = sending ? "Asking the payer…" : null;
  const policy = plan?.plan?.policy_code || "this policy";
  let view;
  switch (state.key) {
    case "not_requested":
      view = {
        tone: "warn",
        title: "The plan has not been requested",
        body: plan?.skip_reason || "Nothing has been asked of the payer for this policy yet.",
        effect: "Packages cannot be quoted from the plan, and the plan check on the pre-auth shows “not checked”.",
        action: "Fetch insurance plan",
        primary: true,
      };
      break;
    case "already":
      view = {
        tone: "info",
        title: "Already being fetched",
        body: plan?.message || "An earlier request for this policy is still with the payer. This case will use its answer.",
        effect: "Nothing to do; the plan appears here when it lands.",
      };
      break;
    case "asking":
      view = {
        tone: "info",
        title: "Asking the payer",
        body: `Requested ${state.sent ? formatDateTime(state.sent) : "just now"}${state.sent ? `, ${state.minutes} min ago` : ""}. Government payers usually answer within 15 to 60 minutes; this page checks again each time it loads.`,
        effect: "Fill in the clinical details meanwhile.",
        action: "Fetch again",
        locked: "Allowed after 60 minutes: the payer refuses a second request meanwhile (PAYR-1406).",
      };
      break;
    case "late":
      view = {
        tone: "warn",
        title: "Taking longer than expected",
        body: `The payer has not answered in ${state.minutes} minutes. The request may have been lost.`,
        effect: "Packages cannot be quoted until the plan arrives.",
        action: "Fetch again",
        primary: true,
        hint: plan?.correlation_id ? `If it still does not arrive, contact NHA support with request ${plan.correlation_id.slice(0, 8)}.` : null,
      };
      break;
    case "no_plan":
      view = {
        tone: "warn",
        title: "The payer has no plan for this policy",
        body: `The payer answered with no InsurancePlan: it has no package master filed under ${policy} for this hospital.`,
        effect: "The pre-auth can still be sent, but nothing can be checked against a plan. Check the policy number and the hospital's HFR ID.",
        action: "Fetch again",
      };
      break;
    case "no_packages":
      view = {
        tone: "warn",
        title: "The plan lists no packages",
        body: plan?.plan?.plan_title ? `The payer sent ${plan.plan.plan_title}, but with no packages for this hospital.` : "The payer sent a plan with no packages for this hospital.",
        effect: "No package can be quoted. The hospital may not be empanelled for any specialty under this policy (PAYR-1404).",
        action: "Fetch again",
      };
      break;
    case "refused": {
      const d = describePayrError(state.code);
      view = {
        tone: "bad",
        title: d?.label ? `${state.code}: ${d.label}` : `The payer refused the request (${state.code})`,
        body: d?.meaning || state.text,
        fixes: (d?.fix || []).map((f) => f.replace(/<policy_code>/g, policy)),
        effect: "The pre-auth will likely be refused too until this is fixed.",
        action: "Fetch again",
      };
      break;
    }
    case "unreachable":
      view = {
        tone: "bad",
        title: "The request did not reach the payer",
        body: state.text || "The plan request could not be sent.",
        effect: "Nothing reached the payer; nothing is waiting.",
        action: "Try again",
        primary: true,
        hint: "Share the message with IT if it repeats.",
      };
      break;
    default:
      return null;
  }
  const disabled = !canFetch || !!sending || !!view.locked;
  return (
    <div className={`cv-notice is-${view.tone}`} role="status">
      <div className="cv-notice-title">{view.title}</div>
      <div className="cv-notice-body">{view.body}</div>
      {view.fixes?.length > 0 && (
        <ol className="cv-notice-body" style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
          {view.fixes.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ol>
      )}
      <div className="cv-notice-hint" style={{ marginTop: "8px" }}>
        <strong>For the pre-auth:</strong> {view.effect}
      </div>
      {(view.action || result) && (
        <div className="cv-notice-actions">
          {view.action && (
            <button type="button" className={`cv-btn${view.primary ? " is-primary" : ""}`} disabled={disabled} title={view.locked || undefined} onClick={onFetch}>
              {busy || view.action}
            </button>
          )}
          {(view.locked || view.hint) && <span className="cv-notice-hint">{view.locked || view.hint}</span>}
          {result && <span className={`cv-chip ${result.tone}`}>{result.text}</span>}
        </div>
      )}
    </div>
  );
}
