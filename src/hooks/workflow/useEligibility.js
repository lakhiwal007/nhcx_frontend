import { useEffect, useRef, useState } from "react";
import { api, markHandled } from "../../api";
import { usePoll } from "../util/usePoll";
import { useSend } from "../util/useSend";
import { usePlanForms } from "./usePlanForms";
import { STEP_FORWARD_ROUTE } from "../../components/case/frame/caseStages";

const POLL_INTERVAL_MS = 7000;
const SAFETY_INTERVAL_MS = 120_000;
const TERMINAL_STATUSES = ["complete", "failed", "closed", "superseded"];

export const shouldStopPolling = (res) =>
  TERMINAL_STATUSES.includes(res?.status) ||
  (res?.coverage_eligibility?.waiting_on === "package" && res.coverage_eligibility.validation?.status !== "pending") ||
  (["partial", "pending"].includes(res?.status) && res?.next_actions?.includes("resubmit"));

const eligibilityCorrelationId = (res) => res?.coverage_eligibility?.validation?.correlation_id ?? res?.coverage_eligibility?.correlation_id;

const sumInsuredMessage = (message) => {
  const text = message || "";
  return text.includes("sum_insured_exceeded") || text.toLowerCase().includes("exceeds policy sum insured") ? text : null;
};

function usePlannedPackages(correlationId, codes) {
  const [byCode, setByCode] = useState({});
  const key = codes.join("|");
  useEffect(() => {
    if (!correlationId || !key) return undefined;
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

export function useEligibility(ctx) {
  const { patient, caseState, updateCaseState, applyCase, caseRecord: full, caseLoading, caseError, reloadCase } = ctx;
  const { payer, policy, admission_id: admissionId, cashless_case_id: caseId } = caseState;
  const childId = patient?.child_id;

  const needsPrepare = !caseId && !!payer && !!policy && !!childId;
  const [prep, setPrep] = useState({ status: "idle", error: null, sumInsured: null, attempt: 0 });
  const prepKey = useRef(null);
  const [pollError, setPollError] = useState(null);

  useEffect(() => {
    if (!needsPrepare) return undefined;
    const key = `${childId}|${payer.code}|${policy.policy_number}|${admissionId || ""}|${prep.attempt}`;
    if (prepKey.current === key) return undefined;
    prepKey.current = key;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await api.startCase({
          child_id: childId,
          payer_id: payer.code,
          policy_number: policy.policy_number,
          ...(admissionId ? { admission_id: admissionId } : {}),
        });
        if (cancelled) return;
        applyCase(res);
        updateCaseState({ cashless_case_id: res.cashless_case_id, claim_id: res.claim_id, eligibility_correlation_id: eligibilityCorrelationId(res) });
        setPrep((p) => ({ ...p, status: "done", error: null, sumInsured: null }));
      } catch (err) {
        if (cancelled) return;
        markHandled(err);
        const sumInsured = sumInsuredMessage(err?.message);
        setPrep((p) => ({ ...p, status: "error", error: sumInsured ? null : err?.message || "The eligibility request could not be prepared.", sumInsured }));
      }
    };
    run();
    return () => {
      cancelled = true;
      if (prepKey.current === key) prepKey.current = null;
    };
  }, [needsPrepare, childId, payer, policy, admissionId, prep.attempt, applyCase, updateCaseState]);

  const retryPrepare = () => setPrep((p) => ({ status: "idle", error: null, sumInsured: null, attempt: p.attempt + 1 }));

  const correlationId = eligibilityCorrelationId(full);
  const storedCorrelationId = caseState.eligibility_correlation_id;
  useEffect(() => {
    if (correlationId && correlationId !== storedCorrelationId) updateCaseState({ eligibility_correlation_id: correlationId });
  }, [correlationId, storedCorrelationId, updateCaseState]);

  const movedOn = STEP_FORWARD_ROUTE[full?.current_step] || null;
  const polling = !!caseId && !!full && !movedOn && !shouldStopPolling(full);

  usePoll(
    async (signal) => {
      try {
        const res = await api.getCashlessStatus(caseId, signal);
        if (signal?.aborted) return;
        applyCase(res);
        setPollError(null);
      } catch (err) {
        if (err?.name === "AbortError") return;
        markHandled(err);
        setPollError(err?.message || "The payer's answer could not be checked.");
      }
    },
    { active: polling ? caseId : null, intervalMs: ctx.casePulse?.follows ? SAFETY_INTERVAL_MS : POLL_INTERVAL_MS, immediate: false },
  );

  const refresh = useSend(async () => {
    const res = await api.getCashlessStatus(caseId);
    applyCase(res);
    setPollError(null);
    return res;
  });

  const rerun = useSend(
    async () => {
      const res = caseId
        ? await api.getCashlessStatus(caseId, undefined, true)
        : await api.prepareCashless({
            child_id: childId,
            payer_id: payer.code,
            policy_number: policy.policy_number,
            ...(admissionId ? { admission_id: admissionId } : {}),
            force_refresh: true,
          });
      applyCase(res);
      updateCaseState({ cashless_case_id: res.cashless_case_id, claim_id: res.claim_id, eligibility_correlation_id: eligibilityCorrelationId(res) });
      setPollError(null);
      return res;
    },
    { success: "Checks sent to the payer again" },
  );

  const sendChecks = useSend(
    async (packages) => {
      const res = await api.sendEligibility({ cashless_case_id: caseId, ...(packages?.length ? { procedures: packages } : {}) });
      applyCase(res);
      updateCaseState({ eligibility_correlation_id: eligibilityCorrelationId(res) });
      setPollError(null);
      return res;
    },
    { success: "Checks sent to the payer" },
  );

  const chooseMember = useSend(
    async (member) => {
      const patient_context = Object.fromEntries(
        Object.entries({ member_id: member.member_id, name: member.name, gender: member.gender, dob: member.dob, abha: member.abha_number }).filter(([, v]) => v),
      );
      await api.patchCashlessPatientContext(caseId, { patient_context });
      updateCaseState({ beneficiaryMemberId: member.member_id });
      applyCase({ ...full, beneficiary_member_id: member.member_id });
      return member;
    },
    { success: (member) => `${member.name || "Member"} recorded as the patient` },
  );

  const setNewborn = useSend(async (next) => {
    await api.patchCashlessPatientContext(caseId, { patient_context: { newborn: next } });
    applyCase({ ...full, newborn: next });
    return next;
  });

  const fetchPlan = useSend(
    async (refreshPlan) => {
      const payerId = full?.payer_id || payer?.code;
      const policyNumber = full?.policy_number || policy?.policy_number;
      const res = await api.requestInsurancePlan({
        child_id: full?.child_id || childId,
        payer_id: payerId,
        policy_number: policyNumber,
        ...(caseId ? { cashless_case_id: caseId } : {}),
        refresh: refreshPlan,
      });
      if (res.status === "refused") {
        return {
          kind: "refused",
          code: res.error?.code || "PAYR-1406",
          message: `${res.error?.message || res.message || "The payer is still preparing this policy's package master."} Nothing was sent; the earlier request is still being fetched. Try again once it arrives.`,
          pending: res.pending_correlation_id || null,
        };
      }
      if (caseId) {
        const fresh = await api.getCashlessStatus(caseId);
        applyCase(fresh);
      }
      return { kind: res.status === "complete" ? "reused" : "sent", message: res.message, id: res.correlation_id };
    },
    { success: (r) => (r.kind === "sent" ? "Asked the payer for its plan" : r.kind === "reused" ? "Using the plan already held for this policy" : null) },
  );

  const planCorrelationId = full?.insurance_plan?.plan_status === "ready" ? full.insurance_plan.correlation_id : null;
  const planForms = usePlanForms(planCorrelationId, full?.insurance_plan?.form_count);
  const procedures = full?.procedures?.items || [];
  const plannedPackages = usePlannedPackages(
    planCorrelationId,
    procedures.map((p) => String(p.code ?? "")).filter((c) => c.length >= 2),
  );

  const loading = needsPrepare ? prep.status === "idle" : !!caseId && caseLoading && !full;
  const error = needsPrepare ? prep.error : !full ? caseError : null;

  return {
    full,
    loading,
    error,
    sumInsured: needsPrepare ? prep.sumInsured : null,
    retry: needsPrepare ? retryPrepare : reloadCase,
    movedOn,
    polling,
    pollError,
    refresh,
    rerun,
    sendChecks,
    chooseMember,
    setNewborn,
    fetchPlan,
    planCorrelationId,
    planForms,
    procedures,
    plannedPackages,
  };
}
