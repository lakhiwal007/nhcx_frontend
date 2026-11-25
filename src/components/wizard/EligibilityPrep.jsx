import BackButton from "../ui/BackButton";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { NextStep } from "../ui/Common";
import { formatDate, formatMoney } from "../../lib/format.js";
import { STEP_FORWARD_LABEL } from "../case/frame/caseStages";
import { eligibilityBeneficiaries, eligibilityRequirements } from "../../domain/caseStatus";
import { useCaseLock } from "../../hooks/case/useCaseLock";
import { useEligibility } from "../../hooks/workflow/useEligibility";
import { useCasePane } from "../case/step/useCasePane";
import CaseStep, { Pane, Verdict } from "../case/step/CaseStep";
import BiometricCard from "../case/policy/BiometricCard";
import PlanCard from "../eligibility/PlanCard";
import PayerAnswer from "../eligibility/EligibilityResponses";
import Members from "../eligibility/Members";
import FormDrawer from "../eligibility/FormDrawer";
import PlannedTreatment from "../eligibility/PlannedTreatment";
import { deriveChecks } from "../eligibility/checks";
import { planState } from "../eligibility/planProfile";
import { buildChecklist, firstOpen } from "../eligibility/checklist";

const yes = (v) => /^(y|yes|true|1)$/i.test(String(v ?? "").trim());

const packageChoice = (benefit) => ({
  code: benefit.code,
  name: benefit.display || benefit.code,
  category: benefit.category_code || undefined,
  modifier_code: "",
  tiers: (benefit.extras || []).filter((x) => x.code && Number(x.rate) > 0 && /strat/i.test(`${x.type || ""} ${x.code}`)).map((x) => ({ code: x.code, label: x.label || x.code, rate: Number(x.rate) })),
  unspecified: yes(benefit.conditions?.Unspecified) || /^[A-Z]{2}(U100|215)$/i.test(String(benefit.code)),
  kind: benefit.kind,
  quantity: 1,
  typed: yes(benefit.conditions?.Unspecified) || /^[A-Z]{2}(U100|215)$/i.test(String(benefit.code)) || (benefit.kind === "Implant" && !(Number(benefit.rate) > 0)),
  rate: benefit.rate,
});

const packageRow = (p) => ({
  code: p.code,
  name: p.name,
  ...(p.category ? { category: p.category } : {}),
  ...(p.modifier_code ? { modifier_code: p.modifier_code } : {}),
  ...(Number(p.quantity) > 1 ? { quantity: Number(p.quantity) } : {}),
  ...(p.typed && Number(p.amount) > 0 ? { amount: Number(p.amount) } : {}),
});

export default function EligibilityPrep({ ctx }) {
  const navigate = useNavigate();
  const { patient, caseState } = ctx;
  const { payer, policy, cashless_case_id: caseId } = caseState;
  const lock = useCaseLock(ctx, "prep");
  const e = useEligibility(ctx);
  const full = e.full;
  const [openForm, setOpenForm] = useState(null);
  const [biometric, setBiometric] = useState(null);
  const [picked, setPicked] = useState(null);
  const [editing, setEditing] = useState(false);
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
  const waitingOn = checks?.waitingOn || null;
  const packageCoded = full?.eligibility_items === "plan_packages";
  const packagesOpen = packageCoded && state.key === "ready" && !locked;
  const canChange = packagesOpen && !!full?.next_actions?.includes("change_package");
  const choosing = packagesOpen && (!!full?.next_actions?.includes("choose_package") || (canChange && editing));
  const held = (full?.treatment || []).filter((line) => line.status !== "rejected").map((line) => ({
    code: line.code,
    name: line.display || line.code,
    category: line.category_code || undefined,
    modifier_code: line.modifier_code || "",
    tiers: line.modifier_code ? [{ code: line.modifier_code, label: line.modifier_display || line.modifier_code, rate: line.unit_price }] : [],
    unspecified: !!line.unspecified,
    kind: line.kind,
    quantity: line.quantity ?? 1,
    typed: !!line.unspecified,
    amount: line.unspecified ? line.unit_price : undefined,
    rate: line.unit_price,
  }));
  const chosen = picked ?? held;
  const setChosen = (change) => setPicked((prev) => change(prev ?? held));
  const canSendNow = !!full?.next_actions?.includes("send_eligibility") && !locked;
  const chosenCodes = new Set(chosen.map((p) => String(p.code)));
  const choosePackage = (benefit) => {
    setChosen((prev) => (prev.some((p) => String(p.code) === String(benefit.code)) ? prev : [...prev, packageChoice(benefit)]));
    pane.setPicked("treatment");
  };
  const choice = {
    active: choosing,
    chosen,
    sending: e.sendChecks.busy,
    onRemove: (code) => setChosen((prev) => prev.filter((p) => String(p.code) !== String(code))),
    onBrowse: () => pane.setPicked("plan"),
    onChoose: (benefit) => choosePackage(benefit),
    onEdit: (code, patch) => setChosen((prev) => prev.map((p) => (String(p.code) === String(code) ? { ...p, ...patch } : p))),
    onSend: () =>
      e.sendChecks.run(chosen.map(packageRow)).then((res) => {
        if (!res) return;
        setPicked(null);
        setEditing(false);
      }),
  };
  const inforce = checks?.inforce;
  const visit = full?.visit || null;
  const startQuery = visit?.procedures?.[0] || visit?.diagnoses?.[0] || visit?.diagnosis || "";
  const notInForce = inforce === false;
  const canProceed = nextActionsAllow && !notInForce;

  const closed = !!ctx.caseClosed || full?.status === "closed";
  const refusedChecks = checks ? [["benefits", checks.benefits], ["authorisation", checks.auth]].filter(([, check]) => check.state === "error").map(([name]) => name) : [];
  const coverText = inforce ? "Policy in force." : checks?.validation.sub ? "Cover check with the payer." : "Plan loaded.";
  const verdict = closed
    ? { tone: "todo", label: "Closed", text: "Case closed. Reopen to continue." }
    : needsRetry
    ? { tone: "bad", label: "Check failed", text: full?.prepare_error?.message || "Couldn't send the request.", next: "Send again. Still failing? Check the policy." }
    : choosing && !notInForce
      ? { tone: "todo", label: "Choose the package", text: `${coverText} ${chosen.length ? "Send the checks." : "Pick a package on Treatment."}` }
      : waitingOn === "plan" && isStalePending
        ? {
            tone: "warn",
            label: "No plan from the payer",
            text: "No plan from the payer yet. Checks not sent.",
            next: packageCoded ? "Fetch the plan again." : "Fetch the plan again, or send without it from More.",
          }
        : waitingOn === "plan"
          ? { tone: "info", label: "Waiting for the plan", text: "Checks go out once the plan arrives." }
          : isStalePending
      ? { tone: "warn", label: "No answer from the payer", text: "The request may have been lost.", next: "Send again. No answer? Call the payer." }
      : notInForce
        ? { tone: "bad", label: "Not eligible", text: "Policy not in force.", next: "Pick another policy, or treat as cash." }
        : refusedChecks.length > 0
          ? {
              tone: "bad",
              label: "Check refused",
              text: `The payer refused the ${refusedChecks.join(" and ")} check${refusedChecks.length > 1 ? "s" : ""}.`,
              next: "Open the failed check, fix it, resend from More.",
            }
        : e.polling || isPending
          ? { tone: "info", label: "Waiting for the payer", text: "Answers arrive in minutes. PMJAY can take an hour." }
          : inforce
            ? { tone: "ok", label: "Eligible", text: "Policy in force." }
            : isComplete
              ? { tone: "todo", label: "Checks complete", text: "Payer didn't confirm the policy." }
              : { tone: "todo", label: "Not confirmed", text: "Refresh for the latest answer." };

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
  const canRerunNow = !lock.settled && !lock.viewOnly && !e.polling && (isComplete || isFailed || needsResubmit || isPartial);
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
    choice,
  });
  const blockers = groups.flatMap((g) => g.rows).filter((r) => r.blocks);
  const open = pane.picked || (choosing ? "treatment" : firstOpen(groups));

  const primary = closed
    ? undefined
    : movedOn
    ? { label: `Continue to ${movedOnLabel}`, icon: ArrowRight, write: false, onClick: () => navigate(`../${movedOn}`) }
    : choosing && !notInForce
      ? chosen.length === 0
        ? { label: "Choose the package", icon: ArrowRight, write: false, onClick: () => pane.setPicked("treatment") }
        : { label: e.sendChecks.busy ? "Sending…" : "Send the checks", icon: ArrowRight, disabled: e.sendChecks.busy, onClick: choice.onSend }
      : {
        label: "Continue to pre-auth",
        icon: ArrowRight,
        write: false,
        disabled: !canProceed || blockers.length > 0,
        toTodo: canProceed && blockers.length > 0,
        reason: notInForce
          ? "The payer reports this policy as not in force."
          : blockers.length
            ? `First: ${blockers.map((r) => r.name.toLowerCase()).join(", ")}.`
            : e.polling
              ? "Waiting for the payer's answer."
              : "The checks must finish first.",
        onClick: () => navigate("../review"),
      };

  const secondary = [];
  const more = [
    canSendNow && {
      label: e.sendChecks.busy ? "Sending…" : "Send the checks now, without the plan",
      busy: e.sendChecks.busy,
      onClick: () => e.sendChecks.run(),
    },
    canRerunNow && {
      label: e.rerun.busy ? "Sending…" : needsRetry ? "Retry the checks" : "Send the checks to the payer again",
      busy: e.rerun.busy,
      onClick: e.rerun.run,
    },
  ];

  const notes = [
    verdict.next && { tone: "info", text: verdict.next },
    needsResubmit && !isStalePending && !(choosing && !notInForce) && { tone: "warn", text: "Some checks stalled. Send again." },
    movedOn && { tone: "info", text: `Moved on to ${movedOnLabel}. Shown as last checked.` },
    lock.viewOnly && { tone: "info", text: lock.reason },
    e.rerun.error && { tone: "warn", text: e.rerun.error },
    e.sendChecks.error && { tone: "warn", text: e.sendChecks.error },
    e.refresh.error && { tone: "warn", text: e.refresh.error },
    e.pollError && { tone: "warn", text: `Check failed${e.polling ? ", retrying" : ""}: ${e.pollError}` },
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
            {estimated && limit ? `Bill ${formatMoney(estimated)} is over the ${formatMoney(limit)} cover.` : e.sumInsured} A cashless case cannot be opened on this policy for this bill.
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
                <BackButton onClick={() => navigate(notAdmitted ? "/registry" : "../payer")}>{notAdmitted ? "Patient Registry" : "Back to policy"}</BackButton>
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
        loadingText="Starting the case and asking the payer for its plan…"
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
              <div className="cv-card-intro">Not listed yet. Shown when the payer answers.</div>
            </section>
          )}
        </Pane>
        <Pane id="treatment">
          <PlannedTreatment
            procedures={procedures}
            packages={e.plannedPackages}
            checks={checks}
            source={full?.procedures?.source}
            planReady={state.key === "ready"}
            choice={choice}
            treatment={full?.treatment}
            onChange={canChange && !editing ? () => setEditing(true) : undefined}
            visit={visit}
            plan={plan}
            planCorrelationId={state.key === "ready" ? plan?.correlation_id : null}
            startQuery={startQuery}
          />
        </Pane>
        <Pane id="plan">
          <PlanCard
            key={choosing ? "choose" : "view"}
            startTab={choosing ? "packages" : "overview"}
            onChoose={choosing ? choosePackage : undefined}
            startQuery={startQuery}
            chosenCodes={chosenCodes}
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
        {["validation", "benefits", "auth"].map((id) => (
          <Pane key={id} id={id}>
            <PayerAnswer id={id} checks={checks} requirements={requirements} discovery={discovery} formTitle={formTitle} onOpenForm={e.planCorrelationId ? setOpenForm : null} />
          </Pane>
        ))}
      </CaseStep>

      <FormDrawer correlationId={e.planCorrelationId} url={openForm} onClose={() => setOpenForm(null)} />
    </>
  );
}
