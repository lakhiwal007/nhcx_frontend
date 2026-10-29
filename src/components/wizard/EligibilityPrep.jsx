import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, AlertCircle } from "lucide-react";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { usePoll } from "../../hooks/usePoll";
import { usePlanForms } from "../../hooks/usePlanForms";
import { Card, Button, LoadingBlock } from "../Common";
import { formatMoney } from "../../format.js";
import { STEP_FORWARD_ROUTE, STEP_FORWARD_LABEL, projectCaseStatus } from "../case/caseStages";
import { eligibilityBeneficiaries, eligibilityRequirements } from "../../caseStatus";
import PlanCard from "../eligibility/PlanCard";
import EligibilityResponses from "../eligibility/EligibilityResponses";
import Members from "../eligibility/Members";
import FormDrawer from "../eligibility/FormDrawer";
import { deriveChecks } from "../eligibility/checks";
import { planState } from "../eligibility/planProfile";

const POLL_INTERVAL_MS = 7000;
const TERMINAL_STATUSES = ["complete", "failed"];

const shouldStopPolling = (res) =>
  TERMINAL_STATUSES.includes(res?.status) ||
  (["partial", "pending"].includes(res?.status) && res?.next_actions?.includes("resubmit"));

const yes = (v) => /^(y|yes|true|1)$/i.test(String(v ?? "").trim());

function usePlannedPackages(correlationId, codes) {
  const [byCode, setByCode] = useState({});
  const key = codes.join("|");
  useEffect(() => {
    if (!correlationId || !key) return;
    let live = true;
    Promise.all(
      key.split("|").map((code) =>
        api
          .getInsurancePlanBenefits(correlationId, { q: code, limit: 20 })
          .then((res) => [code, (res?.benefits || []).find((b) => String(b.code) === code) || null])
          .catch(() => [code, null]),
      ),
    ).then((pairs) => live && setByCode(Object.fromEntries(pairs)));
    return () => {
      live = false;
    };
  }, [correlationId, key]);
  return byCode;
}

function PlannedTreatment({ procedures, packages, checks, source, planReady }) {
  return (
    <section className="cv-card" aria-label="Planned treatment">
      <div className="cv-card-head">
        <h2 className="cv-card-title">4. Planned treatment</h2>
        {procedures.length > 0 ? <span className="cv-chip is-ok">{procedures.length} planned</span> : <span className="cv-chip is-warn">None recorded</span>}
        {source && <span className="cv-card-meta">From {source.replace(/_/g, " ")}</span>}
      </div>
      {procedures.length === 0 ? (
        <div className="cv-card-body">
          No planned procedure is recorded for this visit. Ask the doctor to add it in the hospital system, then re-run the checks so the payer can rule on it.
        </div>
      ) : (
        <div className="cv-tw cv-in-card">
          <table>
            <thead>
              <tr>
                <th>Procedure</th>
                <th>In the plan</th>
                <th className="is-num">Plan rate</th>
                <th className="is-num">Payer allows</th>
                <th>Pre-auth</th>
                <th>Asked with it</th>
              </tr>
            </thead>
            <tbody>
              {procedures.map((proc, i) => {
                const pkg = packages[String(proc.code)];
                const benefit = checks?.benefits.items.find((it) => String(it.product_or_service?.code) === String(proc.code));
                const auth = checks?.auth.items.find((it) => String(it.product_or_service?.code) === String(proc.code));
                const needs = auth?.authorization_required ?? (pkg ? !yes(pkg.conditions?.ApprovalNotRequired) : null);
                const docs = [
                  ...(auth?.authorization_supporting || []).map((d) => d.display || d.code),
                  ...(pkg?.supporting_info || []).map((d) => d.display || d.code),
                ].filter((d, j, a) => d && a.indexOf(d) === j);
                return (
                  <tr key={i}>
                    <td>
                      <strong>{proc.name}</strong> <span className="cv-mono cv-card-meta">{proc.code}</span>
                    </td>
                    <td>
                      {!planReady ? "—" : pkg ? <span className="cv-chip is-ok">Yes</span> : String(proc.code) in packages ? <span className="cv-chip is-warn">Not in plan</span> : "…"}
                    </td>
                    <td className="is-num">{pkg?.rate != null ? formatMoney(pkg.rate) : "—"}</td>
                    <td className="is-num">
                      {benefit?.excluded ? <span className="cv-chip is-bad">Excluded</span> : benefit?.benefit?.[0]?.allowed?.value != null ? formatMoney(benefit.benefit[0].allowed.value) : "—"}
                    </td>
                    <td>{needs == null ? "—" : <span className={`cv-chip ${needs ? "is-warn" : "is-todo"}`}>{needs ? "Needed" : "Not needed"}</span>}</td>
                    <td>{docs.length ? docs.join(", ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function EligibilityPrep({ ctx }) {
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const { patient, caseState, setCashlessCase, updateCaseState, caseClosed } = ctx;
  const { payer, policy, admission_id, cashless_case_id: existingCaseId } = caseState;

  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState(null);
  const [polling, setPolling] = useState(false);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [sumInsuredError, setSumInsuredError] = useState(null); // { estimated, limit }
  const [movedOn, setMovedOn] = useState(null);
  const [openForm, setOpenForm] = useState(null);
  const [choosing, setChoosing] = useState(null);
  const [memberError, setMemberError] = useState(null);
  const [savingNewborn, setSavingNewborn] = useState(false);
  const [planFetch, setPlanFetch] = useState(null);

  const hasInitialized = useRef(false);

  const planCorrelationId = caseData?.insurance_plan?.plan_status === "ready" ? caseData.insurance_plan.correlation_id : null;
  const planForms = usePlanForms(planCorrelationId, caseData?.insurance_plan?.form_count);
  const plannedPackages = usePlannedPackages(
    planCorrelationId,
    (caseData?.procedures?.items || []).map((p) => String(p.code ?? "")).filter((c) => c.length >= 2),
  );

  useEffect(() => {
    // Must have patient. If no existing case, also need payer + policy to prepare one.
    if (!patient) return;
    if (!existingCaseId && (!payer || !policy)) {
      navigate("../payer", { replace: true });
      return;
    }

    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        let res;
        if (existingCaseId) {
          // Resume: fetch the existing case status directly (no gateway round-trip)
          res = await api.getCashlessStatus(existingCaseId);
        } else {
          res = await api.prepareCashless({
            child_id: patient.child_id,
            payer_id: payer.code,
            policy_number: policy.policy_number,
            ...(admission_id && { admission_id }),
          });
        }
        setCaseData(res);
        setCashlessCase((prev) => ({ ...prev, ...projectCaseStatus(res) }));
        updateCaseState({
          cashless_case_id: res.cashless_case_id,
          claim_id: res.claim_id,
          eligibility_correlation_id:
            res.coverage_eligibility?.validation?.correlation_id ??
            res.coverage_eligibility?.correlation_id,
        });

        const ahead = STEP_FORWARD_ROUTE[res.current_step] || null;
        setMovedOn(ahead);

        if (!ahead && !shouldStopPolling(res)) {
          setPolling(true);
        }
      } catch (err) {
        // Detect sum-insured-exceeded so we can show a targeted recovery UI
        const msg = err.message || "";
        const isSumInsured =
          msg.includes("sum_insured_exceeded") ||
          msg.toLowerCase().includes("exceeds policy sum insured") ||
          msg.toLowerCase().includes("sum insured");
        if (isSumInsured) {
          // Try to extract amounts from the message (e.g. "₹75000 exceeds policy sum insured ₹50000")
          const nums = msg.match(/[\d,]+/g)?.map((n) => Number(n.replace(/,/g, "")));
          setSumInsuredError({
            estimated: nums?.[0] ?? null,
            limit: nums?.[1] ?? null,
            raw: msg,
          });
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const pollStatus = async (signal) => {
    try {
      const res = await api.getCashlessStatus(caseData.cashless_case_id, signal);
      const ahead = STEP_FORWARD_ROUTE[res.current_step] || null;
      if (ahead) {
        setPolling(false);
        setMovedOn(ahead);
      }
      setCaseData(res);
      updateCaseState({
        eligibility_correlation_id:
          res.coverage_eligibility?.validation?.correlation_id ??
          res.coverage_eligibility?.correlation_id,
      });
      if (shouldStopPolling(res)) setPolling(false);
    } catch (_) {}
  };

  usePoll(pollStatus, {
    active: polling && caseData?.cashless_case_id ? caseData.cashless_case_id : null,
    intervalMs: POLL_INTERVAL_MS,
    immediate: false, // init() already fetched fresh status; wait one interval
  });

  const handleChooseMember = async (member) => {
    if (!caseData?.cashless_case_id) return;
    setChoosing(member.member_id);
    setMemberError(null);
    try {
      const patient_context = Object.fromEntries(
        Object.entries({ member_id: member.member_id, name: member.name, gender: member.gender, dob: member.dob, abha: member.abha_number })
          .filter(([, v]) => v),
      );
      await api.patchCashlessPatientContext(caseData.cashless_case_id, { patient_context });
      updateCaseState({ beneficiaryMemberId: member.member_id });
      setCaseData((prev) => (prev ? { ...prev, beneficiary_member_id: member.member_id } : prev));
    } catch (err) {
      setMemberError(err.message || "Could not record the patient.");
    } finally {
      setChoosing(null);
    }
  };

  const handleNewborn = async (next) => {
    if (!caseData?.cashless_case_id) return;
    setSavingNewborn(true);
    setMemberError(null);
    try {
      await api.patchCashlessPatientContext(caseData.cashless_case_id, { patient_context: { newborn: next } });
      setCaseData((prev) => (prev ? { ...prev, newborn: next } : prev));
    } catch (err) {
      setMemberError(err.message || "Could not record the newborn case.");
    } finally {
      setSavingNewborn(false);
    }
  };

  const fetchPlan = async (refresh = true) => {
    const childId = caseData?.child_id || patient?.child_id;
    const payerId = caseData?.payer_id || payer?.code;
    const policyNumber = caseData?.policy_number || policy?.policy_number;
    if (!childId || !payerId || !policyNumber) return;
    setPlanFetch({ state: "sending" });
    try {
      const res = await api.requestInsurancePlan({
        child_id: childId,
        payer_id: payerId,
        policy_number: policyNumber,
        ...(caseData?.cashless_case_id ? { cashless_case_id: caseData.cashless_case_id } : {}),
        refresh,
      });
      if (res.status === "refused") {
        setPlanFetch({
          state: "refused",
          code: res.error?.code || "PAYR-1406",
          message: `${res.error?.message || res.message || "The payer is still preparing this policy's package master."} Nothing was sent; the earlier request (${res.pending_correlation_id || "pending"}) is still being fetched. Try again once it arrives.`,
        });
        return;
      }
      if (res.status === "failed") {
        setPlanFetch({ state: "failed", message: res.message || res.error?.message || "The plan request could not be sent." });
        return;
      }
      setPlanFetch({ state: res.status === "complete" ? "reused" : "sent", message: res.message, id: res.correlation_id });
      if (caseData?.cashless_case_id) {
        const fresh = await api.getCashlessStatus(caseData.cashless_case_id);
        setCaseData(fresh);
        if (res.status !== "complete" && !STEP_FORWARD_ROUTE[fresh.current_step]) setPolling(true);
      }
    } catch (err) {
      setPlanFetch({ state: "failed", message: err.message || "The plan request could not be sent." });
    }
  };

  const manualRefresh = () => {
    if (!polling && caseData?.cashless_case_id) setPolling(true);
  };

  // Preferred path: GET /cashless/{id}?force_refresh=true - the backend reads
  // the stored case (child, payer, policy, procedures) and re-fires all four
  // gateway calls, so it needs only the cashless_case_id we already have.
  // Falls back to POST /cashless/prepare with force_refresh only if we
  // somehow don't have a case id yet (requires payer + policy in that case).
  const handleForceRefresh = async () => {
    const caseId = caseData?.cashless_case_id;
    if (!caseId && (!patient || !payer || !policy)) return;
    setForceRefreshing(true);
    try {
      const res = caseId
        ? await api.getCashlessStatus(caseId, undefined, true)
        : await api.prepareCashless({
            child_id: patient.child_id,
            payer_id: payer.code,
            policy_number: policy.policy_number,
            ...(admission_id && { admission_id }),
            force_refresh: true,
          });
      setCaseData(res);
      setCashlessCase((prev) => ({ ...prev, ...projectCaseStatus(res) }));
      updateCaseState({
        cashless_case_id: res.cashless_case_id,
        claim_id: res.claim_id,
        eligibility_correlation_id:
          res.coverage_eligibility?.validation?.correlation_id ??
          res.coverage_eligibility?.correlation_id,
      });
      const ahead = STEP_FORWARD_ROUTE[res.current_step] || null;
      setMovedOn(ahead);
      if (!ahead && !shouldStopPolling(res)) {
        setPolling(true);
      }
    } catch (_) {
    } finally {
      setForceRefreshing(false);
    }
  };

  if (loading) {
    return <LoadingBlock text="Initiating eligibility preparation…" />;
  }

  if (sumInsuredError) {
    return (
      <Card>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start", marginBottom: "var(--space-5)" }}>
          <AlertCircle color="var(--error)" size={24} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--error)", fontSize: "16px", marginBottom: "var(--space-2)" }}>
              Estimated bill exceeds policy sum insured
            </div>
            {sumInsuredError.estimated && sumInsuredError.limit ? (
              <div style={{ fontSize: "14px", marginBottom: "var(--space-3)" }}>
                Estimated bill{" "}
                <strong style={{ color: "var(--error)" }}>{formatMoney(sumInsuredError.estimated)}</strong>
                {" "}exceeds this policy's sum insured of{" "}
                <strong>{formatMoney(sumInsuredError.limit)}</strong>.
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
                {sumInsuredError.raw}
              </div>
            )}
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Select a different policy with a higher sum insured, or proceed with the current one if supplemental coverage applies.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <Button variant="primary" onClick={() => navigate("../payer")}>
            Select Different Policy
          </Button>
          <Button variant="outline" onClick={() => { setSumInsuredError(null); setError(null); hasInitialized.current = false; }}>
            Proceed Anyway
          </Button>
        </div>
      </Card>
    );
  }

  if (error) {
    const notAdmitted = error.toLowerCase().includes("inpatient-only");
    return (
      <Card>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            alignItems: "center",
            marginBottom: "var(--space-4)",
          }}
        >
          <AlertCircle color="var(--error)" size={24} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--error)" }}>
              {notAdmitted ? "Patient is not admitted" : "Preparation failed"}
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              {error}
            </div>
          </div>
        </div>
        {notAdmitted ? (
          <Button variant="outline" onClick={() => navigate("/registry")}>
            ← Back to Patient Registry
          </Button>
        ) : (
          <Button variant="outline" onClick={() => navigate("../payer")}>
            ← Back to Payer
          </Button>
        )}
      </Card>
    );
  }

  const isComplete = caseData?.status === "complete";
  const isPartial = caseData?.status === "partial";
  const isPending = caseData?.status === "pending";
  const isFailed = caseData?.status === "failed";
  const benefitsTimedOut = isPartial && caseData?.next_actions?.includes("prepare_preauth");
  const needsResubmit = (isPartial || isPending) && caseData?.next_actions?.includes("resubmit");
  const isStalePending = isPending && needsResubmit;
  const needsRetry = isFailed && caseData?.next_actions?.includes("retry");
  const canProceed = caseData?.next_actions?.includes("prepare_preauth") && (isComplete || isPartial);
  const movedOnLabel = movedOn ? STEP_FORWARD_LABEL[movedOn] : null;

  const plan = caseData?.insurance_plan;
  const state = planState(plan);
  const checks = deriveChecks(caseData?.coverage_eligibility, benefitsTimedOut);
  const canRerun = !(forceRefreshing || (!caseData?.cashless_case_id && (!payer || !policy))) && !readOnly && !caseClosed;
  const inforce = checks?.inforce;
  const verdict = needsRetry
    ? { tone: "bad", label: "Check failed", text: caseData?.prepare_error?.message || "The eligibility request could not be sent.", next: "Press Retry. If it fails again, go back to the Policy step and check the policy, or share this message with IT." }
    : isStalePending
      ? { tone: "warn", label: "No answer from the payer", text: "The request may have been lost.", next: "Press Re-run checks. If the payer still does not answer, call its helpdesk." }
      : inforce === false
        ? { tone: "bad", label: "Not eligible", text: "The payer reports the policy as not in force.", next: "Ask the patient for a renewed or different policy and pick it on the Policy step, or treat the patient as cash." }
        : polling || isPending
          ? { tone: "info", label: "Waiting for the payer", text: "Answers fill in as each check returns, usually within a minute or two." }
          : inforce || isComplete
            ? { tone: "ok", label: "Eligible", text: "The policy is in force for this admission." }
            : { tone: "todo", label: "Not confirmed", text: "Refresh to fetch the latest answer." };

  const ce = caseData?.coverage_eligibility;
  const members = eligibilityBeneficiaries(ce);
  const requirements = eligibilityRequirements(ce);
  const chosenMemberId = caseState.beneficiaryMemberId || caseData?.beneficiary_member_id || (members.length === 1 ? members[0].member_id : null);
  const formTitle = (url) => planForms.find((f) => f.url === url)?.title;
  const procedures = caseData?.procedures?.items || [];
  const plannedCodes = new Set(procedures.map((p) => String(p.code)));
  const discovery = caseState.policy?.source === "discovery" ? caseState.policy : null;
  const canFetch = !caseClosed && !readOnly && !!(caseData?.child_id || patient?.child_id);
  const fetchResult = planFetch?.message
    ? { tone: planFetch.state === "failed" ? "is-bad" : planFetch.state === "refused" ? "is-warn" : "is-info", text: `${planFetch.code ? `${planFetch.code}: ` : ""}${planFetch.message}` }
    : null;
  const rerunLabel = forceRefreshing ? "Re-running…" : needsRetry ? "Retry" : "Re-run checks";
  const canRerunNow = !caseClosed && !polling && (isComplete || isFailed || needsResubmit);

  return (
    <div className="cv-screen" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className={`cv-notice is-${verdict.tone === "todo" ? "info" : verdict.tone}`}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`cv-chip is-${verdict.tone}`}>{verdict.label}</span>
          <span className="cv-notice-body">{verdict.text}</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!polling && !isComplete && !isFailed && !needsResubmit && (
              <button type="button" className="cv-btn" onClick={manualRefresh}>Refresh</button>
            )}
            <button
              type="button"
              className="cv-btn is-primary"
              disabled={!movedOn && !canProceed}
              title={!movedOn && !canProceed ? (polling ? "Waiting for the payer's answer." : "The checks must finish first.") : undefined}
              onClick={() => navigate(movedOn ? `../${movedOn}` : "../review")}
            >
              {movedOn ? `Continue to ${movedOnLabel}` : "Continue to pre-auth"}
              <ArrowRight size={14} />
            </button>
          </span>
        </div>
        {verdict.next && <div className="cv-notice-hint" style={{ marginTop: 8 }}><strong>What to do:</strong> {verdict.next}</div>}
        {needsResubmit && !isStalePending && <div className="cv-notice-hint" style={{ marginTop: 8 }}>One or more checks did not finish and will not on their own. Re-run the checks.</div>}
        {movedOn && <div className="cv-notice-hint" style={{ marginTop: 8 }}>This case has moved on to {movedOnLabel}; what follows is as last checked.</div>}
      </div>

      <PlanCard
        plan={plan}
        state={state}
        plannedCodes={plannedCodes}
        canFetch={canFetch}
        sending={planFetch?.state === "sending"}
        fetchResult={fetchResult}
        onFetch={() => fetchPlan(state.key !== "not_requested")}
      />

      <EligibilityResponses
        checks={checks}
        requirements={requirements}
        discovery={discovery}
        formTitle={formTitle}
        onOpenForm={planCorrelationId ? setOpenForm : null}
        onDiscover={caseClosed || readOnly ? null : () => navigate("../discover")}
        onRerun={canRerunNow ? handleForceRefresh : null}
        rerunLabel={rerunLabel}
        rerunDisabled={!canRerun}
      />

      <div className="cv-split">
        <div className="cv-main">
          {members.length > 0 && (
            <Members
              members={members}
              chosenId={chosenMemberId}
              choosing={choosing}
              onChoose={handleChooseMember}
              canChoose={(members.length > 1 || !!caseData?.newborn) && !caseClosed && !readOnly && !!caseData?.cashless_case_id}
              newborn={caseData?.newborn || null}
              savingNewborn={savingNewborn}
              canEditNewborn={!caseClosed && !readOnly && !!caseData?.cashless_case_id}
              onNewborn={handleNewborn}
              error={memberError}
            />
          )}
          <PlannedTreatment
            procedures={procedures}
            packages={plannedPackages}
            checks={checks}
            source={caseData?.procedures?.source}
            planReady={state.key === "ready"}
          />
        </div>
      </div>

      <div>
        <Button variant="text" onClick={() => navigate("../payer")}>← Back to policy</Button>
      </div>

      <FormDrawer correlationId={planCorrelationId} url={openForm} onClose={() => setOpenForm(null)} />
    </div>
  );
}
