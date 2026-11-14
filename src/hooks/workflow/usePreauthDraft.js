import { useCallback, useEffect, useRef, useState } from "react";
import { api, markHandled } from "../../api";
import { useSend } from "../util/useSend";
import { useCaseDocuments } from "../case/useCaseDocuments";
import { liveAsks } from "../../components/case/asks/askStatus";
import { effectiveSystem } from "../../components/case/forms/diagnosisCodes";
import { buildPreauthChecklist } from "../../components/case/preauth/preauthChecklist";
import { eligibilityBeneficiaries } from "../../domain/caseStatus";
import { deriveChecks } from "../../components/eligibility/checks";

const HIS_BLOCKERS = new Set(["diagnoses", "items", "preauth_ref"]);
const PLAN_CHECK_ORDER = { block: 0, warn: 1, info: 2, ok: 3 };

const withPrimary = (list) => (list.length === 0 || list.some((d) => d.primary) ? list : list.map((d, i) => (i === 0 ? { ...d, primary: true } : d)));

export const serializeDiagnoses = (list) =>
  withPrimary(list).map((diag) => {
    const out = { ...diag };
    delete out._uid;
    const system = effectiveSystem(diag);
    if (system) out.code_system = system;
    else delete out.code_system;
    return out;
  });

export const planChecks = (admissibility, documents) => {
  const attached = new Set((documents || []).filter((d) => d.url || d.attachment).map((d) => String(d.code || "").toUpperCase()).filter(Boolean));
  return (admissibility?.checks || [])
    .map((c) =>
      c.kind === "document_missing" && attached.has(String(c.code || "").toUpperCase())
        ? { ...c, level: "ok", kind: "document_attached", message: c.message.replace(/ is asked for at pre-authorisation and is not attached\.$/, " is attached.") }
        : c,
    )
    .sort((a, b) => PLAN_CHECK_ORDER[a.level] - PLAN_CHECK_ORDER[b.level]);
};

export function usePreauthDraft(ctx, { submit, locked = false, biometric = null, onSent } = {}) {
  const { caseState, updateCaseState, cashlessCase, setDraftFiles } = ctx;
  const { payer, policy, cashless_case_id, claim_id, draftData } = caseState;
  const filesKey = cashless_case_id || claim_id;

  const [state, setState] = useState({ key: null, draft: null, missingFields: [], error: null, attempt: 0 });
  const [editedDiagnoses, setEditedDiagnoses] = useState(draftData?.editedDiagnoses ?? null);
  const [editedItems, setEditedItems] = useState(draftData?.editedItems ?? null);
  const [editedCareTeam, setEditedCareTeam] = useState(draftData?.editedCareTeam ?? null);
  const [editsSaved, setEditsSaved] = useState(false);
  const [askForms, setAskForms] = useState([]);
  const [asksReload, setAsksReload] = useState(0);
  const [asksError, setAsksError] = useState(null);
  const uidRef = useRef(1);

  const params = useCallback(() => {
    const p = {};
    if (cashless_case_id) p.cashless_case_id = cashless_case_id;
    else if (claim_id) p.claim_id = claim_id;
    if (payer?.code) p.payer_id = payer.code;
    if (policy?.policy_number) p.policy_number = policy.policy_number;
    return p;
  }, [cashless_case_id, claim_id, payer, policy]);

  const loadKey = `${cashless_case_id || ""}|${claim_id || ""}|${state.attempt}`;
  const loading = !!(cashless_case_id || claim_id) && state.key !== loadKey;

  useEffect(() => {
    if (!cashless_case_id && !claim_id) return undefined;
    let cancelled = false;
    api
      .preparePreauth(params())
      .then((res) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, key: loadKey, draft: res, missingFields: res.missing_fields ?? [], error: null }));
      })
      .catch((err) => {
        if (cancelled) return;
        markHandled(err);
        setState((prev) => ({ ...prev, key: loadKey, draft: null, missingFields: [], error: err?.message || "The pre-auth draft could not be built." }));
      });
    return () => {
      cancelled = true;
    };
  }, [cashless_case_id, claim_id, loadKey, params]);

  const reload = useCallback(() => setState((prev) => ({ ...prev, attempt: prev.attempt + 1 })), []);
  const draft = state.key === loadKey ? state.draft : null;
  const missingFields = state.key === loadKey ? state.missingFields : [];
  const setMissingFields = (next) => setState((prev) => ({ ...prev, missingFields: next }));

  const refreshAsks = () => {
    setAsksReload((n) => n + 1);
    setAsksError(null);
    api
      .preparePreauth(params())
      .then((res) => setState((prev) => (prev.draft ? { ...prev, draft: { ...prev.draft, payer_asks: res.payer_asks } } : prev)))
      .catch((err) => {
        markHandled(err);
        setAsksError(err?.message || "The payer's asks could not be reloaded.");
      });
  };

  const fetchRecord = useCallback((recordId) => api.fetchHealthRecord("preauth", params(), recordId), [params]);
  const documents = useCaseDocuments(ctx, { key: filesKey, seed: draft?.supporting_documents, records: draft?.health_records, fetchRecord });

  useEffect(() => {
    if (locked || !(editedDiagnoses || editedItems || editedCareTeam)) return undefined;
    const timer = setTimeout(() => {
      updateCaseState({ draftData: { editedDiagnoses, editedItems, editedCareTeam } });
      setEditsSaved(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [locked, editedDiagnoses, editedItems, editedCareTeam, updateCaseState]);

  const ensureUids = (list) => list.map((d) => (d._uid != null ? d : { ...d, _uid: uidRef.current++ }));
  const displayDiagnoses = editedDiagnoses ?? draft?.diagnoses ?? [];
  const displayItems = editedItems ?? draft?.items ?? [];
  const displayCareTeam = editedCareTeam ?? draft?.care_team ?? [];
  const computedTotal = displayItems.reduce((sum, it) => sum + (Number(it.net_amount) || 0), 0);
  const effectiveTotal = editedItems ? computedTotal : (draft?.total_amount ?? 0);

  const updateItem = (idx, field, raw) => {
    const base = editedItems ?? draft?.items ?? [];
    setEditedItems(
      base.map((it, i) => {
        if (i !== idx) return it;
        const val = Number(raw);
        const next = { ...it, [field]: field === "service_name" || Number.isNaN(val) ? raw : val };
        if (field === "quantity" || field === "unit_price") {
          const qty = Number(field === "quantity" ? val : it.quantity) || 0;
          const price = Number(field === "unit_price" ? val : it.unit_price) || 0;
          next.net_amount = qty * price;
        }
        return next;
      }),
    );
  };
  const updateDiagnosis = (idx, field, value) => {
    const base = ensureUids(editedDiagnoses ?? draft?.diagnoses ?? []);
    setEditedDiagnoses(withPrimary(base.map((d, i) => (i !== idx ? d : field === "code" ? { ...d, code: value, code_system: "", snomed_code: undefined } : { ...d, [field]: value }))));
  };
  const pickDiagnosis = (idx, patch) => {
    const base = ensureUids(editedDiagnoses ?? draft?.diagnoses ?? []);
    setEditedDiagnoses(withPrimary(base.map((d, i) => (i === idx ? { ...d, ...patch } : d))));
  };
  const setPrimaryDiagnosis = (idx) => {
    const base = ensureUids(editedDiagnoses ?? draft?.diagnoses ?? []);
    setEditedDiagnoses(base.map((d, i) => ({ ...d, primary: i === idx })));
  };
  const addDiagnosis = () => {
    const base = ensureUids(editedDiagnoses ?? draft?.diagnoses ?? []);
    setEditedDiagnoses(withPrimary([...base, { code: "", name: "", code_system: "", primary: false, on_admission: false, _uid: uidRef.current++ }]));
  };
  const removeDiagnosis = (idx) => {
    const base = ensureUids(editedDiagnoses ?? draft?.diagnoses ?? []);
    setEditedDiagnoses(withPrimary(base.filter((_, i) => i !== idx)));
  };
  const updateCareTeamMember = (idx, field, value) => {
    const base = editedCareTeam ?? draft?.care_team ?? [];
    setEditedCareTeam(base.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));
  };
  const resetDiagnoses = () => setEditedDiagnoses(null);
  const resetItems = () => setEditedItems(null);
  const resetCareTeam = () => setEditedCareTeam(null);

  const newbornMissing = missingFields.filter((f) => f.startsWith("newborn."));
  const patientContextMissing = missingFields.filter((f) => !HIS_BLOCKERS.has(f.toLowerCase()) && !f.startsWith("newborn."));
  const hisBlockers = missingFields.filter((f) => HIS_BLOCKERS.has(f.toLowerCase()));
  const docs = documents.documents;
  const asks = liveAsks(draft?.payer_asks, docs, askForms);
  const askCodes = asks.filter((a) => a.kind === "document").map((a) => String(a.code));
  const { otherDocs } = documents.partition(askCodes);
  const hasMissingDocs = otherDocs.some((d) => !d.optional && !d.url && !d.attachment);
  const admissibility = draft?.admissibility || null;
  const checks = planChecks(admissibility, docs).filter((c) => !c.kind.startsWith("document"));
  const planBlocked = checks.some((c) => c.level === "block");
  const planNotes = checks.filter((c) => c.level === "warn" || c.level === "block");
  const unspecifiedCodes = new Set(checks.filter((c) => c.kind === "unspecified_package").map((c) => String(c.code || "").toUpperCase()));
  const blockingAsks = asks.filter((a) => a.blocking);
  const warnAsks = asks.filter((a) => !a.blocking && a.status !== "attached" && a.status !== "answered");
  const cardMembers = eligibilityBeneficiaries(cashlessCase?.coverage_eligibility);
  const memberUnchosen = cardMembers.length > 1 && !(caseState.beneficiaryMemberId || cashlessCase?.beneficiary_member_id);
  const eligibility = draft?.eligibility;
  const notInForce = eligibility?.inforce === false || deriveChecks(cashlessCase?.coverage_eligibility)?.inforce === false;
  const justification = [
    ["Chief complaints", draft?.chief_complaints],
    ["Clinical findings", draft?.clinical_findings],
    ["Investigations", draft?.investigations],
    ["Medications", draft?.medications],
  ].filter(([, codes]) => codes?.length > 0);
  const principal = displayDiagnoses.find((d) => d.primary) || displayDiagnoses[0];
  const teamMissingReg = displayCareTeam.filter((d) => !d.registration_no).length;
  const billedCodes = new Set(displayItems.map((it) => String(it.service_code)));
  const unbilledProcedures = (draft?.procedures || []).filter((p) => !billedCodes.has(String(p.code)));
  const caseId = cashless_case_id || draft?.cashless_case_id;

  const body = () => {
    const out = {};
    const resolvedCaseId = cashless_case_id || draft?.cashless_case_id;
    if (resolvedCaseId) out.cashless_case_id = resolvedCaseId;
    const resolvedClaimId = draft?.claim_id || claim_id;
    if (resolvedClaimId) out.claim_id = resolvedClaimId;
    if (draft?.payer_id) out.payer_id = draft.payer_id;
    if (draft?.policy_number) out.policy_number = draft.policy_number;
    if (draft?.eligibility?.correlation_id) out.eligibility_correlation_id = draft.eligibility.correlation_id;
    if (editedDiagnoses) out.diagnoses = serializeDiagnoses(editedDiagnoses);
    if (editedItems) {
      out.items = editedItems;
      out.total_amount = computedTotal;
    } else {
      out.total_amount = draft?.total_amount;
    }
    if (editedCareTeam) out.care_team = editedCareTeam;
    const attachedDocs = docs.filter((d) => d.url);
    if (attachedDocs.length > 0) out.supporting_documents = attachedDocs;
    return out;
  };

  const send = useSend(
    async () => {
      const res = await (submit ? submit(body()) : api.submitPreauth(body()));
      updateCaseState({
        preauthCorrelationId: res.correlation_id,
        claim_id: draft?.claim_id || claim_id,
        draftData: null,
        draftWarnings: res.warnings || [],
      });
      if (filesKey) setDraftFiles(filesKey, []);
      return res;
    },
    { success: "Pre-auth sent to the payer", onDone: onSent },
  );

  const groups = buildPreauthChecklist({
    biometric,
    patientMissing: patientContextMissing.length,
    admissionDate: draft?.admission_date,
    principal,
    diagnosisCount: displayDiagnoses.length,
    hasPrincipal: displayDiagnoses.some((d) => d.primary) && !hisBlockers.some((f) => /diagnos/i.test(f)),
    justification,
    teamCount: displayCareTeam.length,
    teamMissingReg,
    hasDischargeSummary: !!draft?.discharge_summary,
    lines: displayItems.length,
    total: effectiveTotal,
    unbilled: unbilledProcedures.length,
    linesBlocked: hisBlockers.some((f) => /items/i.test(f)),
    unnamedLines: displayItems.some((item) => unspecifiedCodes.has(String(item.service_code || "").toUpperCase()) && !String(item.service_name || "").trim()),
    planChecked: admissibility?.status === "checked",
    planBlocked,
    planNotes: planNotes.length,
    asks,
    blockingAsks: blockingAsks.length,
    hasMissingDocs,
    attachedFiles: otherDocs.filter((d) => d.url || d.attachment).length,
    locked,
  });

  return {
    draft,
    loading,
    error: state.key === loadKey ? state.error : null,
    reload,
    missingFields,
    setMissingFields,
    patientContextMissing,
    hisBlockers,
    newbornMissing,
    documents,
    docs,
    otherDocs,
    asks,
    askForms,
    setAskForms,
    asksReload,
    asksError,
    refreshAsks,
    blockingAsks,
    warnAsks,
    checks,
    planBlocked,
    planNotes,
    unspecifiedCodes,
    admissibility,
    cardMembers,
    memberUnchosen,
    eligibility,
    notInForce,
    justification,
    principal,
    teamMissingReg,
    unbilledProcedures,
    caseId,
    displayDiagnoses,
    displayItems,
    displayCareTeam,
    edited: { diagnoses: !!editedDiagnoses, items: !!editedItems, careTeam: !!editedCareTeam },
    editsSaved,
    effectiveTotal,
    updateItem,
    updateDiagnosis,
    pickDiagnosis,
    setPrimaryDiagnosis,
    addDiagnosis,
    removeDiagnosis,
    updateCareTeamMember,
    resetDiagnoses,
    resetItems,
    resetCareTeam,
    groups,
    body,
    send,
  };
}
