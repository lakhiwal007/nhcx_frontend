import { useState, useEffect, useRef } from "react";
import StageBar from "../case/StageBar";
import { useNavigate } from "react-router-dom";
import { Send, Plus, Trash2, FileJson, ArrowRight } from "lucide-react";
import { api } from "../../api";
import { DocumentChecklist, LoadingBlock, NextStep, formatMoney } from "../Common";
import { formatDate } from "../../format.js";
import { STEP_FORWARD_ROUTE, STEP_FORWARD_LABEL } from "../case/caseStages";
import PatientDetailsForm from "../case/PatientDetailsForm";
import PayerAsks from "../case/PayerAsks";
import BiometricCard from "../case/BiometricCard";
import { liveAsks } from "../case/askStatus";
import { useReadOnly } from "../../readOnly";
import { Modal } from "../Overlay";
import FhirBundleModal from "../FhirBundleModal";
import CaseChecklist from "../case/CaseChecklist";
import { useCasePane } from "../case/useCasePane";
import { buildPreauthChecklist, firstPreauthItem } from "../case/preauthChecklist";
import { eligibilityBeneficiaries } from "../../caseStatus";
import { deriveChecks } from "../eligibility/checks";

const NEWBORN_MISSING = {
  "newborn.name": "the baby's name is missing in the hospital records",
  "newborn.gender": "the baby's gender is missing in the hospital records",
  "newborn.dob": "the baby's date of birth is missing in the hospital records",
  "newborn.proof_of_birth": "attach the proof of birth in Documents below",
};

// Fields that cannot be resolved from the UI — must be fixed in the HIS
const HIS_BLOCKERS = new Set(["diagnoses", "items", "preauth_ref"]);

const ICD_10 = "http://hl7.org/fhir/sid/icd-10";
const CODE_SYSTEMS = [
  { value: ICD_10, label: "ICD-10" },
  { value: "http://snomed.info/sct", label: "SNOMED CT" },
];

const effectiveSystem = (diag) => diag.code_system || (diag.code ? ICD_10 : "");

const withPrimary = (list) =>
  list.length === 0 || list.some((d) => d.primary)
    ? list
    : list.map((d, i) => (i === 0 ? { ...d, primary: true } : d));

const serializeDiagnoses = (list) =>
  withPrimary(list).map((diag) => {
    const out = { ...diag };
    delete out._uid;
    const system = effectiveSystem(diag);
    if (system) out.code_system = system;
    else delete out.code_system;
    return out;
  });

const PLAN_CHECK_ORDER = { block: 0, warn: 1, info: 2, ok: 3 };

// Documents attached since the report was built count as attached.
function planChecks(admissibility, documents) {
  const attached = new Set(
    (documents || []).filter((d) => d.url || d.attachment).map((d) => String(d.code || "").toUpperCase()).filter(Boolean),
  );
  return (admissibility?.checks || [])
    .map((c) =>
      c.kind === "document_missing" && attached.has(String(c.code || "").toUpperCase())
        ? { ...c, level: "ok", kind: "document_attached", message: c.message.replace(/ is asked for at pre-authorisation and is not attached\.$/, " is attached.") }
        : c,
    )
    .sort((a, b) => PLAN_CHECK_ORDER[a.level] - PLAN_CHECK_ORDER[b.level]);
}

export default function PreauthDraft({ ctx }) {
  const navigate = useNavigate();
  const { caseState, updateCaseState, cashlessCase, caseClosed, draftFiles, setDraftFiles } = ctx;
  const { payer, policy, cashless_case_id, claim_id, draftData } = caseState;

  // This screen stays re-enterable after a preauth has been submitted or decided,
  // so clicking the Preauth step in the lifecycle rail lands here rather than
  // bouncing to the Decision screen. The form is rebuilt from the live DB, so it
  // is not what was sent: once a preauth is live, the primary action is the
  // decision, "View what was sent" opens the real outbound bundle, and sending a
  // fresh preauth needs an explicit confirmation. Enhancement and Resubmit on the
  // Decision screen remain the routes for a payer-driven change.
  const preauthAlreadyLive = !!(
    caseState.preauthCorrelationId ||
    caseState.preauthDecision ||
    cashlessCase?.preauth_status ||
    cashlessCase?.preauth?.correlation_id
  );
  const movedOn = STEP_FORWARD_ROUTE[cashlessCase?.current_step] || null;
  const movedOnLabel = movedOn ? STEP_FORWARD_LABEL[movedOn] : null;

  const [confirmResend, setConfirmResend] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const sentCorrelationId = caseState.preauthCorrelationId || cashlessCase?.preauth?.correlation_id || null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [submitting, setSaving2] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Editable sections — null means "use server draft unchanged"
  const [editedDiagnoses, setEditedDiagnoses] = useState(draftData?.editedDiagnoses ?? null);
  const [editedItems, setEditedItems] = useState(draftData?.editedItems ?? null);
  const [editedCareTeam, setEditedCareTeam] = useState(draftData?.editedCareTeam ?? null);
  const { picked, setPicked, paneRef, openItem } = useCasePane();
  const [biometric, setBiometric] = useState(null);
  const [askForms, setAskForms] = useState([]);
  const [confirmWarn, setConfirmWarn] = useState(false);
  const [waiveReason, setWaiveReason] = useState("");
  const [editsSaved, setEditsSaved] = useState(false);
  const readOnly = useReadOnly();
  const locked = readOnly || caseClosed;
  const filesKey = cashless_case_id || claim_id;

  const [asksReload, setAsksReload] = useState(0);
  const [asksError, setAsksError] = useState(null);
  const uidRef = useRef(1);
  const ensureUids = (list) => list.map((d) => (d._uid != null ? d : { ...d, _uid: uidRef.current++ }));

  const draftParams = () => {
    const params = {};
    if (cashless_case_id) params.cashless_case_id = cashless_case_id;
    else if (claim_id) params.claim_id = claim_id;
    if (payer?.code) params.payer_id = payer.code;
    if (policy?.policy_number) params.policy_number = policy.policy_number;
    return params;
  };

  const refreshAsks = () => {
    setAsksReload((n) => n + 1);
    setAsksError(null);
    api.preparePreauth(draftParams())
      .then((res) => setDraft((prev) => (prev ? { ...prev, payer_asks: res.payer_asks } : prev)))
      .catch((err) => setAsksError(err.message || "The payer's asks could not be reloaded."));
  };

  // Files attached here live only in memory until the send, so they come back
  // over each draft, which is rebuilt from the hospital records.
  const withAttachedFiles = (res) => {
    const list = [...(res.supporting_documents || [])];
    (draftFiles?.[filesKey] || []).forEach((file) => {
      const idx = list.findIndex((d) => d.code === file.code);
      if (idx >= 0) list[idx] = { ...list[idx], ...file };
      else list.push(file);
    });
    return { ...res, supporting_documents: list };
  };

  const loadDraft = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.preparePreauth(draftParams());
      setDraft(withAttachedFiles(res));
      setMissingFields(res.missing_fields ?? []);
    } catch (err) {
      setLoadError(err.message || "The pre-auth draft could not be built.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!caseState.cashless_case_id && !caseState.claim_id) {
      navigate("../payer", { replace: true });
      return;
    }
    loadDraft();
  }, []);

  // Keep what staff attached when they leave for another step of the case.
  const documentsNow = draft?.supporting_documents;
  useEffect(() => {
    if (!documentsNow || !filesKey) return;
    setDraftFiles(filesKey, documentsNow.filter((d) => d.attachment || d.custom));
  }, [documentsNow, filesKey, setDraftFiles]);

  // Edits save themselves. They stay on this browser until the pre-auth is sent.
  useEffect(() => {
    if (locked || !(editedDiagnoses || editedItems || editedCareTeam)) return undefined;
    const timer = setTimeout(() => {
      updateCaseState({ draftData: { editedDiagnoses, editedItems, editedCareTeam } });
      setEditsSaved(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [locked, editedDiagnoses, editedItems, editedCareTeam, updateCaseState]);

  // Derived display values (prefer edited state over server draft)
  const displayDiagnoses = editedDiagnoses ?? draft?.diagnoses ?? [];
  const displayItems = editedItems ?? draft?.items ?? [];
  const displayCareTeam = editedCareTeam ?? draft?.care_team ?? [];
  const computedTotal = displayItems.reduce((sum, it) => sum + (Number(it.net_amount) || 0), 0);
  const effectiveTotal = editedItems ? computedTotal : (draft?.total_amount ?? 0);

  // ── Item editing ──────────────────────────────────────────────────────────
  const updateItem = (idx, field, raw) => {
    const base = editedItems ?? draft?.items ?? [];
    const updated = base.map((it, i) => {
      if (i !== idx) return it;
      const val = Number(raw);
      const next = { ...it, [field]: field === "service_name" || isNaN(val) ? raw : val };
      if (field === "quantity" || field === "unit_price") {
        const qty = Number(field === "quantity" ? val : it.quantity) || 0;
        const price = Number(field === "unit_price" ? val : it.unit_price) || 0;
        next.net_amount = qty * price;
      }
      return next;
    });
    setEditedItems(updated);
  };

  // ── Diagnosis editing ─────────────────────────────────────────────────────
  const updateDiagnosis = (idx, field, value) => {
    const base = ensureUids(editedDiagnoses ?? draft?.diagnoses ?? []);
    setEditedDiagnoses(withPrimary(base.map((d, i) => {
      if (i !== idx) return d;
      return field === "code" ? { ...d, code: value, code_system: "" } : { ...d, [field]: value };
    })));
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

  // ── Care team editing ─────────────────────────────────────────────────────
  const updateCareTeamMember = (idx, field, value) => {
    const base = editedCareTeam ?? draft?.care_team ?? [];
    setEditedCareTeam(base.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));
  };

  const handleUpload = (doc, uploaded) => {
    setDraft((prev) => ({
      ...prev,
      supporting_documents: prev.supporting_documents.map((d) =>
        d.code === doc.code ? { ...d, ...uploaded } : d
      ),
    }));
  };

  // Lets the hospital attach a document that isn't on the backend's
  // pre-populated required/optional checklist (e.g. a payer-specific extra).
  const addDocument = () => {
    setDraft((prev) => ({
      ...prev,
      supporting_documents: [
        ...(prev.supporting_documents || []),
        { code: `CUSTOM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "", category: "additional", optional: true, custom: true },
      ],
    }));
  };
  const renameDocument = (idx, name) => {
    setDraft((prev) => ({
      ...prev,
      supporting_documents: prev.supporting_documents.map((d, i) => (i === idx ? { ...d, name } : d)),
    }));
  };
  const removeDocument = (idx) => {
    setDraft((prev) => ({
      ...prev,
      supporting_documents: prev.supporting_documents.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = async () => {
    setSaving2(true);
    setSubmitError(null);
    try {
      const body = {};
      const resolvedCaseId = cashless_case_id || draft.cashless_case_id;
      if (resolvedCaseId) body.cashless_case_id = resolvedCaseId;
      const resolvedClaimId = draft.claim_id || claim_id;
      if (resolvedClaimId) body.claim_id = resolvedClaimId;
      if (draft.payer_id) body.payer_id = draft.payer_id;
      if (draft.policy_number) body.policy_number = draft.policy_number;
      if (draft.eligibility?.correlation_id)
        body.eligibility_correlation_id = draft.eligibility.correlation_id;
      if (editedDiagnoses) body.diagnoses = serializeDiagnoses(editedDiagnoses);
      if (editedItems) {
        body.items = editedItems;
        body.total_amount = computedTotal;
      } else {
        body.total_amount = draft.total_amount;
      }
      if (editedCareTeam) body.care_team = editedCareTeam;
      const attachedDocs = draft.supporting_documents?.filter((d) => d.url) ?? [];
      if (attachedDocs.length > 0) body.supporting_documents = attachedDocs;

      const res = await api.submitPreauth(body);
      if (res.status === "failed") {
        setSubmitError(res.message || res.error?.message || "Preauthorization submission failed. Please try again.");
        return;
      }
      updateCaseState({
        preauthCorrelationId: res.correlation_id,
        claim_id: draft.claim_id || claim_id,
        draftData: null,
      });
      setDraftFiles(filesKey, []);
      navigate("../status", { state: { preauthWarnings: res.warnings || [] } });
    } catch (err) {
      setSubmitError(err.message || "Preauthorization submission failed. Please try again.");
    } finally {
      setSaving2(false);
    }
  };

  if (loading) {
    return <LoadingBlock text="Building preauth draft…" />;
  }

  if (loadError) {
    return (
      <NextStep
        tone="bad"
        title="The pre-auth draft could not be built"
        actions={
          <button type="button" className="cv-btn" onClick={loadDraft}>
            Retry
          </button>
        }
      >
        {loadError}
      </NextStep>
    );
  }

  const newbornMissing = missingFields.filter((f) => f.startsWith("newborn."));
  const patientContextMissing = missingFields.filter((f) => !HIS_BLOCKERS.has(f.toLowerCase()) && !f.startsWith("newborn."));
  const hisBlockers = missingFields.filter((f) => HIS_BLOCKERS.has(f.toLowerCase()));
  const hasMissingFields = missingFields.length > 0;
  const docs = draft?.supporting_documents || [];
  const asks = liveAsks(draft?.payer_asks, docs, askForms);
  const askCodes = new Set(asks.filter((a) => a.kind === "document").map((a) => String(a.code).toUpperCase()));
  const otherDocs = docs.filter((d) => !askCodes.has(String(d.code || "").toUpperCase()));
  const hasMissingDocs = otherDocs.some((d) => !d.optional && !d.url);
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
  const accommodation = draft?.accommodation || {};
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
    attachedFiles: otherDocs.filter((d) => d.url).length,
    locked: locked || preauthAlreadyLive,
  });
  const blockers = groups.flatMap((g) => g.rows).filter((r) => r.blocks);
  const toLookAt = groups.flatMap((g) => g.rows).filter((r) => r.tone === "warn").length;
  const canSubmit = !hasMissingFields && !notInForce && blockers.length === 0 && !submitting;
  const open = picked || firstPreauthItem(groups);
  const paneFor = (id) => ({ hidden: open !== id });
  const sendState = preauthAlreadyLive
    ? ["Sent", "is-info"]
    : locked
      ? ["Not sent", "is-todo"]
      : canSubmit || submitting
      ? [toLookAt ? `Ready, ${toLookAt} to look at` : "Ready to send", toLookAt ? "is-warn" : "is-ok"]
      : [`${blockers.length + (notInForce ? 1 : 0) + (hisBlockers.length + newbornMissing.length > 0 ? 1 : 0)} must be done`, "is-warn"];
  const notices = [
    notInForce && !preauthAlreadyLive && { tone: "bad", text: "The payer reports this policy as not in force, so a pre-auth cannot be sent. Pick a renewed or different policy, or treat the patient as cash.", action: { label: "Go to Policy", to: "../payer" } },
    preauthAlreadyLive && { tone: "info", text: `A preauth has already been sent${movedOnLabel ? ` and the case has moved on to ${movedOnLabel}` : ""}. This form is rebuilt from current records, not what was sent.`, action: movedOn ? { label: `Go to ${movedOnLabel}`, to: `../${movedOn}` } : null },
    hisBlockers.length > 0 && { tone: "warn", text: `The hospital records are missing: ${hisBlockers.join(", ")}. Ask the doctor or billing desk to add it, then reload this page.` },
    newbornMissing.length > 0 && !preauthAlreadyLive && { tone: "warn", text: `Newborn case: ${newbornMissing.map((f) => NEWBORN_MISSING[f] || f).join("; ")}.` },
    eligibility && eligibility.status !== "complete" && !preauthAlreadyLive && { tone: "warn", text: "Eligibility is incomplete, so the payer's answer may still change." },
    memberUnchosen && !preauthAlreadyLive && { tone: "warn", text: `The payer's card has ${cardMembers.length} members and none is chosen as the patient yet.`, action: { label: "Choose on Eligibility", to: "../prep" } },
  ].filter(Boolean);

  const attachAsk = (row, uploaded) => {
    setDraft((prev) => {
      const list = prev.supporting_documents || [];
      const idx = list.findIndex((d) => String(d.code || "").toUpperCase() === String(row.code).toUpperCase());
      const entry = { code: row.code, category: row.category || null, name: row.display, optional: false, ...uploaded };
      return { ...prev, supporting_documents: idx >= 0 ? list.map((d, i) => (i === idx ? { ...d, ...entry } : d)) : [...list, entry] };
    });
  };

  const send = async () => {
    if (warnAsks.length > 0 && !waiveReason.trim()) return;
    if (warnAsks.length > 0 && caseId) {
      try {
        await api.createCaseNote(caseId, {
          category: "general",
          body: `Pre-auth sent without: ${warnAsks.map((a) => a.display).join(", ")}. Reason: ${waiveReason.trim()}`,
        });
      } catch {
        setSubmitError("Could not record the reason. Nothing was sent.");
        return;
      }
    }
    setConfirmWarn(false);
    await handleSubmit();
  };
  const waiveList = (
    <>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {warnAsks.map((a) => (
          <li key={`${a.kind}-${a.code || a.form_url}`}>{a.display}</li>
        ))}
      </ul>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="cv-card-meta">Reason (kept as a case note)</span>
        <textarea className="cv-ctl" style={{ height: 80, padding: 10 }} value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} />
      </label>
    </>
  );
  const requestSend = () => (warnAsks.length > 0 ? setConfirmWarn(true) : handleSubmit());

  return (
    <div className="cv-elig">
      <div className={`cv-notice cv-verdict is-${sendState[1].replace("is-", "")}`}>
        <div className="cv-verdict-row">
          <StageBar ctx={ctx} />
          <span className={`cv-chip ${sendState[1]}`}>{sendState[0]}</span>
          <span className="cv-notice-body">
            <strong>{formatMoney(effectiveTotal)}</strong> requested · {displayItems.length} line{displayItems.length === 1 ? "" : "s"}
            {editedItems ? " · edited" : ""}
          </span>
          {editsSaved && <span className="cv-card-meta">Edits saved on this browser</span>}
          <span className="cv-verdict-actions">
            {preauthAlreadyLive ? (
              <>
                {sentCorrelationId && caseId && <button type="button" className="cv-btn" onClick={() => setShowSent(true)}><FileJson size={14} /> View what was sent</button>}
                {!caseClosed && <button type="button" className="cv-btn" disabled={!canSubmit || readOnly} onClick={() => setConfirmResend(true)}><Send size={14} /> Send a fresh preauth…</button>}
                <button type="button" className="cv-btn is-primary" onClick={() => navigate("../status")}>View decision <ArrowRight size={14} /></button>
              </>
            ) : caseClosed ? null : (
              <button
                type="button"
                className="cv-btn is-primary"
                disabled={!canSubmit || readOnly}
                title={!canSubmit && !submitting ? "Finish the items marked in red first." : undefined}
                onClick={requestSend}
              >
                <Send size={15} /> {submitting ? "Sending…" : "Send preauth"}
              </button>
            )}
          </span>
        </div>
        {asksError && <div className="cv-notice-hint cv-verdict-note is-warn">The payer's asks could not be reloaded, so the list may be out of date: {asksError}</div>}
        {submitError && <div className="cv-notice-hint cv-verdict-note is-warn"><strong>Not sent:</strong> {submitError} Fix what the message names and send again; your draft is kept.</div>}
        {notices.map((n, i) => (
          <div key={i} className={`cv-notice-hint cv-verdict-note cv-verdict-line${n.tone === "bad" ? " is-bad" : n.tone === "warn" ? " is-warn" : ""}`}>
            <span>{n.text}</span>
            {n.action && <button type="button" className="cv-btn" onClick={() => navigate(n.action.to)}>{n.action.label}</button>}
          </div>
        ))}
      </div>

      <div className="cv-work">
        <CaseChecklist groups={groups} open={open} onOpen={openItem} label="Pre-auth checklist" />

        <div className="cv-work-pane" ref={paneRef}>
          <div {...paneFor("verify")}>
            <BiometricCard
              caseId={caseId}
              stage="Preauth"
              readOnly={locked}
              onCard={setBiometric}
              onVerified={() => {
                setPicked("verify");
                refreshAsks();
              }}
            />
          </div>

          {patientContextMissing.length > 0 && (
            <div {...paneFor("details")}>
              <PatientDetailsForm
                claimId={draft?.claim_id || claim_id}
                cashlessCaseId={cashless_case_id}
                missingFields={patientContextMissing}
                locked={locked}
                onResolved={(remaining) => {
                  setMissingFields(remaining);
                  if (remaining.length === 0) loadDraft();
                }}
              />
            </div>
          )}

          <div {...paneFor("admission")}>
            <section className="cv-card" aria-label="Admission">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Admission</h2>
                <span className="cv-card-meta">From the hospital records.</span>
              </div>
              <div className="cv-card-body cv-cols">
                <div>
                  <div className="cv-kv"><span>Admission</span><span>{draft?.admission_date ? formatDate(draft.admission_date) : "—"}</span></div>
                  <div className="cv-kv"><span>Discharge</span><span>{draft?.discharge_date ? formatDate(draft.discharge_date) : "Not discharged"}</span></div>
                  <div className="cv-kv"><span>Encounter</span><span>{draft?.inpatient === false ? "Out-patient" : "In-patient"}</span></div>
                  <div className="cv-kv"><span>Priority</span><span>{draft?.urgent ? "Urgent" : "Routine"}</span></div>
                  <div className="cv-kv"><span>Member ID</span><span className="cv-mono">{draft?.patient?.member_id || "—"}</span></div>
                </div>
                <div>
                  <div className="cv-kv"><span>Ward</span><span>{accommodation.ward || "—"}</span></div>
                  <div className="cv-kv"><span>Specialty</span><span>{accommodation.specialty || "—"}</span></div>
                  <div className="cv-kv"><span>Room</span><span>{accommodation.room || "—"}</span></div>
                  <div className="cv-kv"><span>Bed</span><span className="cv-mono">{accommodation.bed_code || "—"}</span></div>
                </div>
              </div>
            </section>
          </div>

          <div {...paneFor("diagnosis")}>
            <section className="cv-card" aria-label="Diagnosis">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Diagnosis</h2>
                <span className="cv-card-meta">From the hospital records; correct it here if needed.</span>
              </div>
              <fieldset className="cv-plain" disabled={locked}>
                <div className="cv-tw cv-in-card">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 130 }}>Code</th>
                        <th style={{ width: 140 }}>System</th>
                        <th>Description</th>
                        <th style={{ width: 110 }}>Principal</th>
                        <th style={{ width: 56 }} aria-label="Remove" />
                      </tr>
                    </thead>
                    <tbody>
                      {displayDiagnoses.map((diag, i) => (
                        <tr key={diag._uid ?? `d-${i}`}>
                          <td><input className="cv-ctl cv-mono" style={{ width: "100%" }} placeholder="Code" aria-label="Diagnosis code" value={diag.code ?? ""} onChange={(e) => updateDiagnosis(i, "code", e.target.value)} /></td>
                          <td>
                            <select className="cv-ctl" style={{ width: "100%" }} disabled={!diag.code} value={effectiveSystem(diag)} onChange={(e) => updateDiagnosis(i, "code_system", e.target.value)} aria-label="Code system">
                              {!diag.code && <option value="">—</option>}
                              {CODE_SYSTEMS.map((sys) => (
                                <option key={sys.value} value={sys.value}>{sys.label}</option>
                              ))}
                            </select>
                          </td>
                          <td><input className="cv-ctl" style={{ width: "100%" }} placeholder="Diagnosis description" aria-label="Diagnosis description" value={diag.name ?? ""} onChange={(e) => updateDiagnosis(i, "name", e.target.value)} /></td>
                          <td>
                            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input type="radio" name="primary-diagnosis" checked={!!diag.primary} onChange={() => setPrimaryDiagnosis(i)} />
                              {diag.primary ? "Principal" : ""}
                            </label>
                          </td>
                          <td><button type="button" className="cv-btn" onClick={() => removeDiagnosis(i)} aria-label="Remove diagnosis"><Trash2 size={14} /></button></td>
                        </tr>
                      ))}
                      {!displayDiagnoses.length && (
                        <tr><td colSpan={5} className="cv-card-meta">No diagnosis on record.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {!locked && <div className="cv-card-body cv-pane-action"><button type="button" className="cv-btn" onClick={addDiagnosis}><Plus size={14} /> Add diagnosis</button></div>}
              </fieldset>
            </section>
          </div>

          <div {...paneFor("justification")}>
            <section className="cv-card" aria-label="Clinical justification">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Clinical justification</h2>
                <span className="cv-card-meta">Fuller notes mean fewer payer queries.</span>
              </div>
              <div className="cv-card-body">
                {justification.length ? (
                  justification.map(([label, codes]) => (
                    <div key={label} className="cv-kv"><span>{label}</span><span>{codes.map((c) => c.name || c.code).join(", ")}</span></div>
                  ))
                ) : (
                  <div className="cv-card-meta">No complaints, findings or tests are coded on the clinical note. Ask the doctor to add them in the hospital system.</div>
                )}
              </div>
            </section>
          </div>

          <div {...paneFor("team")}>
            <section className="cv-card" aria-label="Treating team">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Treating team</h2>
                {teamMissingReg > 0 && <span className="cv-chip is-warn">{teamMissingReg} without a registration number</span>}
              </div>
              {displayCareTeam.length > 0 ? (
                <fieldset className="cv-tw cv-in-card cv-plain" disabled={locked}>
                  <table>
                    <thead>
                      <tr>
                        <th>Doctor</th>
                        <th>Speciality</th>
                        <th>Registration no.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayCareTeam.map((doc, i) => (
                        <tr key={i}>
                          <td><input className="cv-ctl" style={{ width: "100%" }} aria-label="Doctor name" value={doc.doc_name || ""} onChange={(e) => updateCareTeamMember(i, "doc_name", e.target.value)} /></td>
                          <td><input className="cv-ctl" style={{ width: "100%" }} aria-label="Speciality" value={doc.speciality_display || doc.speciality || ""} onChange={(e) => updateCareTeamMember(i, "speciality_display", e.target.value)} /></td>
                          <td><input className="cv-ctl cv-mono" style={{ width: "100%" }} aria-label="Registration number" placeholder="Required" value={doc.registration_no || ""} onChange={(e) => updateCareTeamMember(i, "registration_no", e.target.value)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </fieldset>
              ) : (
                <div className="cv-card-intro">No doctor is on record for this admission.</div>
              )}
            </section>
          </div>

          {draft?.discharge_summary && (
            <div {...paneFor("discharge")}>
              <section className="cv-card" aria-label="Discharge summary">
                <div className="cv-card-head"><h2 className="cv-card-title">Discharge summary</h2></div>
                <div className="cv-card-body">
                  <div className="cv-kv"><span>Condition</span><span>{draft.discharge_summary.condition || "—"}</span></div>
                  <div className="cv-kv"><span>Advice</span><span>{draft.discharge_summary.advice || "—"}</span></div>
                  <div className="cv-kv"><span>Follow-up</span><span>{draft.discharge_summary.followup_on ? formatDate(draft.discharge_summary.followup_on) : "—"}</span></div>
                </div>
              </section>
            </div>
          )}

          <div {...paneFor("lines")}>
            <section className="cv-card" aria-label="Treatment and cost">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Treatment &amp; cost</h2>
                {editedItems && <span className="cv-card-meta">Edited; the amount is recomputed from the lines</span>}
              </div>
              {unbilledProcedures.length > 0 && (
                <div className="cv-card-intro">Procedures not billed as a line: {unbilledProcedures.map((p) => `${p.name}${p.code ? ` (${p.code})` : ""}`).join(", ")}</div>
              )}
              <fieldset className="cv-tw cv-in-card cv-plain" disabled={locked}>
                <table>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th style={{ width: 110 }}>Qty</th>
                      <th style={{ width: 150 }}>Unit price</th>
                      <th className="is-num" style={{ width: 150 }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayItems.map((item, i) => (
                      <tr key={i}>
                        <td>
                          {unspecifiedCodes.has(String(item.service_code || "").toUpperCase()) && !locked ? (
                            <input className="cv-ctl" style={{ width: "100%" }} aria-label="Procedure name" placeholder="Name the procedure, and the ward if it matters" value={item.service_name || ""} onChange={(e) => updateItem(i, "service_name", e.target.value)} />
                          ) : (
                            <strong>{item.service_name}</strong>
                          )}
                          <div className="cv-card-meta">{[item.service_code, unspecifiedCodes.has(String(item.service_code || "").toUpperCase()) && "unspecified package: the name and amount go as typed", item.category, item.service_start_date && formatDate(item.service_start_date)].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td><input className="cv-ctl cv-mono" style={{ width: "100%" }} type="number" min="1" aria-label="Quantity" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} /></td>
                        <td><input className="cv-ctl cv-mono" style={{ width: "100%" }} type="number" min="0" aria-label="Unit price" value={item.unit_price} onChange={(e) => updateItem(i, "unit_price", e.target.value)} /></td>
                        <td className="is-num" style={{ fontWeight: 600 }}>{formatMoney(item.net_amount)}</td>
                      </tr>
                    ))}
                    {!displayItems.length && (
                      <tr><td colSpan={4} className="cv-card-meta">No billable items on record.</td></tr>
                    )}
                    <tr className="is-total">
                      <td colSpan={3}>Amount requested</td>
                      <td className="is-num">{formatMoney(effectiveTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </fieldset>
            </section>
          </div>

          <div {...paneFor("plan")}>
            <section className="cv-card" aria-label="Against the plan">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Against the plan</h2>
                <span className="cv-card-meta">Warnings; only a package priced at zero or less stops the send.</span>
              </div>
              <div className="cv-card-body">
                {checks.length === 0 && <div className="cv-card-meta">{admissibility?.status === "checked" ? "Nothing to look at." : "This draft has not been checked against a plan."}</div>}
                {checks.map((c, i) => (
                  <div key={i} className={`cv-plan-check is-${c.level}`}>{c.message}</div>
                ))}
                {admissibility?.exclusions?.length > 0 && <div className="cv-card-meta" style={{ marginTop: 8 }}>Excluded by the plan: {admissibility.exclusions.join("; ")}.</div>}
              </div>
            </section>
          </div>

          <div {...paneFor("asks")}>
            <PayerAsks caseId={caseId} stage="preauth" asks={draft?.payer_asks} documents={docs} readOnly={locked} onAttach={attachAsk} onFormsChange={setAskForms} reloadKey={asksReload} />
          </div>

          <div {...paneFor("files")}>
            <section className="cv-card" aria-label="Other files">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Other files</h2>
                <span className="cv-card-meta">Sent as supporting information. Attached files stay until sent, but reloading the page drops them.</span>
              </div>
              <div className="cv-card-body">
                <DocumentChecklist
                  documents={otherDocs}
                  onUpload={handleUpload}
                  onAddDocument={addDocument}
                  onRenameDocument={(i, name) => renameDocument(docs.indexOf(otherDocs[i]), name)}
                  onRemoveDocument={(i) => removeDocument(docs.indexOf(otherDocs[i]))}
                  readOnly={locked}
                  hideSummary
                />
              </div>
            </section>
          </div>
        </div>
      </div>

      <Modal open={confirmWarn} onClose={() => setConfirmWarn(false)} title="Send without these?" subtitle="Only the plan lists them, so the send is allowed, but the payer may query or refuse.">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {waiveList}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" className="cv-btn" onClick={() => setConfirmWarn(false)}>Go back</button>
            <button type="button" className="cv-btn is-primary" disabled={!waiveReason.trim() || submitting} onClick={send}>Send anyway</button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmResend} onClose={() => setConfirmResend(false)} title="Send a fresh preauth?" subtitle="The payer receives a new preauth request for this case, built from the current records.">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="cv-card-meta" style={{ margin: 0 }}>To answer a query, resubmit after a rejection or raise the approved amount, use the Approval stage instead. A fresh preauth starts the payer's review over.</p>
          {warnAsks.length > 0 && waiveList}
          {submitError && <div className="cv-notice is-bad"><div className="cv-notice-body">{submitError}</div></div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" className="cv-btn" onClick={() => setConfirmResend(false)}>Cancel</button>
            <button type="button" className="cv-btn is-primary" disabled={!canSubmit || (warnAsks.length > 0 && !waiveReason.trim())} onClick={send}>{submitting ? "Sending…" : `Send ${formatMoney(effectiveTotal)} preauth`}</button>
          </div>
        </div>
      </Modal>

      <FhirBundleModal open={showSent} onClose={() => setShowSent(false)} cashlessCaseId={caseId} transactionType="preauth" correlationId={sentCorrelationId} />
    </div>
  );
}
