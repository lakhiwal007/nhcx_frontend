import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { NextStep } from "../Common";
import { formatDate, formatMoney } from "../../format.js";
import { STEP_FORWARD_LABEL } from "../case/caseStages";
import { eligibilityBeneficiaries, eligibilityRequirements } from "../../caseStatus";
import { useCaseLock } from "../../hooks/useCaseLock";
import { useEligibility } from "../../hooks/useEligibility";
import { useCasePane } from "../case/useCasePane";
import CaseStep, { Pane, Verdict } from "../case/CaseStep";
import BiometricCard from "../case/BiometricCard";
import PlanCard from "../eligibility/PlanCard";
import PayerAnswer from "../eligibility/EligibilityResponses";
import Members from "../eligibility/Members";
import FormDrawer from "../eligibility/FormDrawer";
import PlannedTreatment from "../eligibility/PlannedTreatment";
import { deriveChecks } from "../eligibility/checks";
import { planState } from "../eligibility/planProfile";
import { buildChecklist, firstOpen } from "../eligibility/checklist";

export default function EligibilityPrep({ ctx }) {
  const navigate = useNavigate();
  const { patient, caseState } = ctx;
  const { payer, policy, cashless_case_id: caseId } = caseState;
  const lock = useCaseLock(ctx, "prep");
  const e = useEligibility(ctx);
  const full = e.full;
  const [openForm, setOpenForm] = useState(null);
  const [biometric, setBiometric] = useState(null);
  const pane = useCasePane();

  const noWayToPrepare = !caseId && (!payer || !policy);
  useEffect(() => {
    if (patient && noWayToPrepare) navigate("../payer", { replace: true });
  }, [patient, noWayToPrepare, navigate]);

  const movedOn = e.movedOn;
  const movedOnLabel = movedOn ? STEP_FORWARD_LABEL[movedOn] : null;
  const locked = lock.viewOnly || lock.settled || !!movedOn;

  const isComplete = full?.status === "complete";
  const isPartial = full?.status === "partial";
  const isPending = full?.status === "pending";
  const isFailed = full?.status === "failed";
  const benefitsTimedOut = isPartial && full?.next_actions?.includes("prepare_preauth");
  const needsResubmit = (isPartial || isPending) && full?.next_actions?.includes("resubmit");
  const isStalePending = isPending && needsResubmit;
  const needsRetry = isFailed && full?.next_actions?.includes("retry");
  const nextActionsAllow = full?.next_actions?.includes("prepare_preauth") && (isComplete || isPartial);

  const plan = full?.insurance_plan;
  const state = planState(plan);
  const checks = deriveChecks(full?.coverage_eligibility, benefitsTimedOut);
  const inforce = checks?.inforce;
  const notInForce = inforce === false;
  const canProceed = nextActionsAllow && !notInForce;

  const verdict = needsRetry
    ? { tone: "bad", label: "Check failed", text: full?.prepare_error?.message || "The eligibility request could not be sent.", next: "Send the checks again. If it fails again, go back to the Policy step and check the policy, or share this message with IT." }
    : isStalePending
      ? { tone: "warn", label: "No answer from the payer", text: "The request may have been lost.", next: "Send the checks again. If the payer still does not answer, call its helpdesk." }
      : notInForce
        ? { tone: "bad", label: "Not eligible", text: "The payer reports the policy as not in force.", next: "Ask the patient for a renewed or different policy and pick it on the Policy step, or treat the patient as cash." }
        : e.polling || isPending
          ? { tone: "info", label: "Waiting for the payer", text: "Answers fill in as each check returns. Private insurers usually answer within minutes; PMJAY can take up to an hour." }
          : inforce
            ? { tone: "ok", label: "Eligible", text: "The policy is in force for this admission." }
            : isComplete
              ? { tone: "todo", label: "Checks complete", text: "The payer did not state whether the policy is in force." }
              : { tone: "todo", label: "Not confirmed", text: "Check again to fetch the latest answer." };

  const ce = full?.coverage_eligibility;
  const members = eligibilityBeneficiaries(ce);
  const requirements = eligibilityRequirements(ce);
  const chosenMemberId = caseState.beneficiaryMemberId || full?.beneficiary_member_id || (members.length === 1 ? members[0].member_id : null);
  const formTitle = (url) => e.planForms.find((f) => f.url === url)?.title;
  const procedures = e.procedures;
  const plannedCodes = new Set(procedures.map((p) => String(p.code)));
  const discovery = caseState.policy?.source === "discovery" ? caseState.policy : null;
  const canFetch = !lock.viewOnly && !lock.settled && !!(full?.child_id || patient?.child_id);
  const planResult = e.fetchPlan.result;
  const fetchResult = e.fetchPlan.error
    ? { tone: "is-bad", text: e.fetchPlan.error }
    : planResult?.message
      ? { tone: planResult.kind === "refused" ? "is-warn" : "is-info", text: planResult.message, code: planResult.code, id: planResult.id || planResult.pending }
      : null;
  const canRerunNow = !lock.settled && !lock.viewOnly && !e.polling && (isComplete || isFailed || needsResubmit);
  const balance = checks?.wallet?.balance;
  const validTo = checks?.coverage?.benefit_period?.end;
  const facts = [balance != null && `${formatMoney(balance)} left`, validTo && `valid to ${formatDate(validTo)}`].filter(Boolean);

  const groups = buildChecklist({
    biometric,
    members,
    chosenId: chosenMemberId,
    newborn: full?.newborn,
    procedures,
    packages: e.plannedPackages,
    checks,
    requirements,
    plan,
    state,
    locked,
  });
  const blockers = groups.flatMap((g) => g.rows).filter((r) => r.blocks);
  const open = pane.picked || firstOpen(groups);

  const primary = movedOn
    ? { label: `Continue to ${movedOnLabel}`, icon: ArrowRight, write: false, onClick: () => navigate(`../${movedOn}`) }
    : {
        label: "Continue to pre-auth",
        icon: ArrowRight,
        write: false,
        disabled: !canProceed || blockers.length > 0,
        reason: notInForce
          ? "The payer reports this policy as not in force."
          : blockers.length
            ? `First: ${blockers.map((r) => r.name.toLowerCase()).join(", ")}.`
            : e.polling
              ? "Waiting for the payer's answer."
              : "The checks must finish first.",
        onClick: () => navigate("../review"),
      };

  const secondary = [
    caseId && !e.polling && { label: e.refresh.busy ? "Checking…" : "Check again", busy: e.refresh.busy, write: false, onClick: e.refresh.run, reason: "Reads the latest answers already received. Nothing is sent to the payer." },
  ];
  const more = [
    canRerunNow && {
      label: e.rerun.busy ? "Sending…" : needsRetry ? "Retry the checks" : "Send the checks to the payer again",
      busy: e.rerun.busy,
      onClick: e.rerun.run,
    },
  ];

  const notes = [
    verdict.next && { tone: "info", text: `What to do: ${verdict.next}` },
    needsResubmit && !isStalePending && { tone: "warn", text: "One or more checks did not finish and will not on their own. Send the checks again." },
    movedOn && { tone: "info", text: `This case has moved on to ${movedOnLabel}; what follows is as last checked.` },
    lock.viewOnly && { tone: "info", text: lock.reason },
    e.rerun.error && { tone: "warn", text: e.rerun.error },
    e.refresh.error && { tone: "warn", text: e.refresh.error },
    e.pollError && { tone: "warn", text: `The last check failed${e.polling ? ", and this page keeps trying" : ""}: ${e.pollError}` },
  ];

  if (e.sumInsured) {
    const nums = e.sumInsured.match(/[\d,]+/g)?.map((n) => Number(n.replace(/,/g, "")));
    const estimated = nums?.[0];
    const limit = nums?.[1];
    return (
      <CaseStep
        ctx={ctx}
        verdict={<Verdict ctx={ctx} chip="Not eligible" chipTone="bad" summary="The estimated bill is above this policy's sum insured." />}
        checklist={[]}
        open="blocked"
        onOpen={() => {}}
      >
        <Pane id="blocked">
          <NextStep
            tone="bad"
            title="Estimated bill exceeds the policy's sum insured"
            actions={
              <button type="button" className="cv-btn is-primary" onClick={() => navigate("../payer")}>
                Pick a different policy
              </button>
            }
          >
            {estimated && limit ? `The estimated bill of ${formatMoney(estimated)} is above this policy's sum insured of ${formatMoney(limit)}.` : e.sumInsured} A cashless case cannot be opened on this policy for this bill.
          </NextStep>
        </Pane>
      </CaseStep>
    );
  }

  if (e.error && !full) {
    const notAdmitted = e.error.toLowerCase().includes("inpatient-only");
    return (
      <CaseStep
        ctx={ctx}
        verdict={<Verdict ctx={ctx} chip={notAdmitted ? "Not admitted" : "Not started"} chipTone="warn" summary={notAdmitted ? "The patient is not admitted." : "The eligibility checks could not be started."} />}
        checklist={[]}
        open="error"
        onOpen={() => {}}
      >
        <Pane id="error">
          <NextStep
            tone="bad"
            title={notAdmitted ? "Patient is not admitted" : "Preparation failed"}
            actions={
              <>
                {!notAdmitted && (
                  <button type="button" className="cv-btn is-primary" onClick={e.retry}>
                    Try again
                  </button>
                )}
                <button type="button" className="cv-btn" onClick={() => navigate(notAdmitted ? "/registry" : "../payer")}>
                  {notAdmitted ? "Back to Patient Registry" : "Back to policy"}
                </button>
              </>
            }
          >
            {e.error}
          </NextStep>
        </Pane>
      </CaseStep>
    );
  }

  return (
    <>
      <CaseStep
        ctx={ctx}
        verdict={
          <Verdict
            ctx={ctx}
            chip={verdict.label}
            chipTone={verdict.tone}
            summary={verdict.tone === "ok" && facts.length ? facts.join(" · ") : verdict.text}
            notes={notes}
            primary={primary}
            secondary={secondary}
            more={more}
          />
        }
        checklist={groups}
        open={open}
        onOpen={pane.openItem}
        checklistLabel="Eligibility checklist"
        loading={e.loading}
        loadingText="Starting the eligibility checks…"
        paneRef={pane.paneRef}
      >
        <Pane id="verify">
          <BiometricCard caseId={caseId} stage="Preauth" readOnly={locked} onCard={setBiometric} onVerified={() => pane.setPicked("verify")} />
        </Pane>
        <Pane id="who">
          {members.length > 0 ? (
            <Members
              members={members}
              chosenId={chosenMemberId}
              choosing={e.chooseMember.busy ? e.chooseMember.pendingArgs?.[0]?.member_id || true : null}
              onChoose={(member) => {
                pane.setPicked("who");
                e.chooseMember.run(member);
              }}
              canChoose={(members.length > 1 || !!full?.newborn) && !locked && !!caseId}
              newborn={full?.newborn || null}
              savingNewborn={e.setNewborn.busy}
              canEditNewborn={!locked && !!caseId}
              onNewborn={(next) => {
                pane.setPicked("who");
                e.setNewborn.run(next);
              }}
              error={e.chooseMember.error || e.setNewborn.error}
            />
          ) : (
            <section className="cv-card" aria-label="Who is admitted">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Who is admitted</h2>
              </div>
              <div className="cv-card-intro">The payer has not listed the people on this card yet. They appear here with its answer.</div>
            </section>
          )}
        </Pane>
        <Pane id="treatment">
          <PlannedTreatment procedures={procedures} packages={e.plannedPackages} checks={checks} source={full?.procedures?.source} planReady={state.key === "ready"} />
        </Pane>
        {["validation", "benefits", "auth"].map((id) => (
          <Pane key={id} id={id}>
            <PayerAnswer id={id} checks={checks} requirements={requirements} discovery={discovery} formTitle={formTitle} onOpenForm={e.planCorrelationId ? setOpenForm : null} />
          </Pane>
        ))}
        <Pane id="plan">
          <PlanCard
            plan={plan}
            state={state}
            plannedCodes={plannedCodes}
            forms={e.planForms}
            canFetch={canFetch}
            sending={e.fetchPlan.busy}
            fetchResult={fetchResult}
            onFetch={() => e.fetchPlan.run(state.key !== "not_requested")}
            onOpenForm={setOpenForm}
          />
        </Pane>
      </CaseStep>

      <FormDrawer correlationId={e.planCorrelationId} url={openForm} onClose={() => setOpenForm(null)} />
    </>
  );
}
