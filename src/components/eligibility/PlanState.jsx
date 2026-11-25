import { describePayrError } from "../../api/payrErrors.js";
import { formatDateTime } from "../../lib/format.js";
import TechnicalDetails from "../case/step/TechnicalDetails";

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
        effect: "Packages can't be quoted yet.",
        action: "Fetch the insurance plan",
      };
      break;
    case "already":
      view = {
        tone: "info",
        title: "Already being fetched",
        body: plan?.message || "An earlier request is pending. This case uses its answer.",
        effect: "Nothing to do. The plan shows here when it arrives.",
      };
      break;
    case "asking":
      view = {
        tone: "info",
        title: "Asking the payer",
        body: `Requested ${state.sent ? formatDateTime(state.sent) : "just now"}${state.sent ? `, ${state.minutes} min ago` : ""}. Government payers usually answer within 15 to 60 minutes; this page checks again each time it loads.`,
        effect: "Fill in the clinical details meanwhile.",
        action: "Fetch again",
        locked: "Allowed after 60 minutes.",
      };
      break;
    case "late":
      view = {
        tone: "warn",
        title: "Taking longer than expected",
        body: `No answer in ${state.minutes} minutes. It may be lost.`,
        effect: "Packages cannot be quoted until the plan arrives.",
        action: "Fetch again",
        hint: plan?.correlation_id ? "Still nothing? Send NHA the request id below." : null,
      };
      break;
    case "no_plan":
      view = {
        tone: "warn",
        title: "The payer has no plan for this policy",
        body: `No plan filed under ${policy} for this hospital.`,
        effect: "Check the policy number and HFR ID.",
        action: "Fetch again",
      };
      break;
    case "no_packages":
      view = {
        tone: "warn",
        title: "The plan lists no packages",
        body: plan?.plan?.plan_title ? `${plan.plan.plan_title} has no packages for this hospital.` : "The payer sent a plan with no packages for this hospital.",
        effect: "The hospital may not be empanelled.",
        action: "Fetch again",
      };
      break;
    case "refused": {
      const d = describePayrError(state.code);
      view = {
        tone: "bad",
        title: d?.label || "The payer refused the request",
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
        effect: "Nothing sent. Nothing waiting.",
        action: "Try again",
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
        <ol className="cv-notice-body cv-notice-list">
          {view.fixes.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ol>
      )}
      <div className="cv-notice-hint cv-notice-effect">
        <strong>For the pre-auth:</strong> {view.effect}
      </div>
      {(view.action || result) && (
        <div className="cv-notice-actions">
          {view.action && (
            <button type="button" className="cv-btn" disabled={disabled} title={view.locked || undefined} onClick={onFetch}>
              {busy || view.action}
            </button>
          )}
          {(view.locked || view.hint) && <span className="cv-notice-hint">{view.locked || view.hint}</span>}
          {result && <span className={`cv-chip ${result.tone}`}>{result.text}</span>}
        </div>
      )}
      <TechnicalDetails
        ids={[
          { label: "Payer code", value: state.code },
          { label: "Plan request", value: plan?.correlation_id },
          { label: "Earlier request", value: result?.id },
          { label: "Result code", value: result?.code },
        ]}
      />
    </div>
  );
}
