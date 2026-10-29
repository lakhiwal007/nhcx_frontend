import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Save, Plus, Trash2, FileJson, ArrowRight } from "lucide-react";
import { api } from "../../api";
import { Button, DocumentChecklist, LoadingBlock, formatMoney } from "../Common";
import { formatDate } from "../../format.js";
import { STEP_FORWARD_ROUTE, STEP_FORWARD_LABEL } from "../case/caseStages";
import { Section } from "../case/CaseFile";
import PayerAsks from "../case/PayerAsks";
import { liveAsks } from "../case/askStatus";
import { useReadOnly } from "../../readOnly";
import { Modal } from "../Overlay";
import FhirBundleModal from "../FhirBundleModal";
import PayerName from "../PayerName";
import { eligibilityBeneficiaries } from "../../caseStatus";

const PATIENT_CONTEXT_FIELDS = [
  { key: "abha", label: "ABHA Number", placeholder: "91-XXXX-XXXX-XXXX" },
  { key: "member_id", label: "Member / PMJAY ID", placeholder: "PMJAY-MEM-XXXXX" },
  { key: "dob", label: "Date of Birth", placeholder: "YYYY-MM-DD", type: "date" },
  { key: "admission_date", label: "Admission Date", placeholder: "YYYY-MM-DD", type: "date" },
  { key: "discharge_date", label: "Discharge Date", placeholder: "YYYY-MM-DD", type: "date" },
  { key: "policy_number", label: "Policy Number", placeholder: "POL-XXXX" },
];

// Maps backend missing_fields values to form field keys
const MISSING_FIELD_MAP = {
  "patient.identifier": ["abha", "member_id"],
  "patient.abha": ["abha"],
  "patient.member_id": ["member_id"],
  "patient.dob": ["dob"],
  "patient.name": [],
  "patient.gender": [],
  "admission_date": ["admission_date"],
  "discharge_date": ["discharge_date"],
  "policy_number": ["policy_number"],
};

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

function PatientContextForm({ claimId, cashlessCaseId, missingFields, onResolved }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  const relevantKeys = new Set(
    missingFields.flatMap((m) => MISSING_FIELD_MAP[m.toLowerCase()] ?? [])
  );
  const allFields = relevantKeys.size > 0
    ? PATIENT_CONTEXT_FIELDS.filter((f) => relevantKeys.has(f.key))
    : PATIENT_CONTEXT_FIELDS;

  const handleSave = async () => {
    setSaving(true);
    try {
      let res;
      if (claimId) {
        res = await api.patchPatientContext(claimId, { patient_context: values });
      } else {
        res = await api.patchCashlessPatientContext(cashlessCaseId, { patient_context: values });
      }
      onResolved(res.missing_fields ?? []);
    } catch (_) {
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      id="pd-missing"
      title="Missing patient details"
      meta={<span className="is-bad">Needed before the request can be sent</span>}
    >
      <div className="pd-form">
        {allFields.map((f) => (
          <label key={f.key} className="pd-form-field">
            <span>{f.label}</span>
            <input
              className="input-modern pd-input"
              type={f.type || "text"}
              placeholder={f.placeholder}
              value={values[f.key] || ""}
              onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="pd-form-actions">
        <Button write variant="primary" size="small" disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save & refresh draft"}
        </Button>
      </div>
    </Section>
  );
}

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

function ClinicalRow({ id, title, chip, summary, children, openRow, setOpenRow }) {
  const open = openRow === id;
  return (
    <div>
      <div className="cv-row">
        <span className={`cv-chip cv-row-badge ${chip[1]}`}>{chip[0]}</span>
        <div className="cv-row-body">
          <div className="cv-row-title">{title}</div>
          <div className="cv-row-sub">{summary}</div>
        </div>
        {children && (
          <button type="button" className="cv-btn" onClick={() => setOpenRow(open ? null : id)} aria-expanded={open}>
            {open ? "Close" : "Open"}
          </button>
        )}
      </div>
      {open && children && <div className="cv-row-open">{children}</div>}
    </div>
  );
}

export default function PreauthDraft({ ctx }) {
  const navigate = useNavigate();
  const { caseState, updateCaseState, cashlessCase, caseClosed } = ctx;
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
  const [draft, setDraft] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [submitting, setSaving2] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Editable sections — null means "use server draft unchanged"
  const [editedDiagnoses, setEditedDiagnoses] = useState(draftData?.editedDiagnoses ?? null);
  const [editedItems, setEditedItems] = useState(draftData?.editedItems ?? null);
  const [editedCareTeam, setEditedCareTeam] = useState(draftData?.editedCareTeam ?? null);
  const [openRow, setOpenRow] = useState(null);
  const [askForms, setAskForms] = useState([]);
  const [confirmWarn, setConfirmWarn] = useState(false);
  const [waiveReason, setWaiveReason] = useState("");
  const readOnly = useReadOnly();

  const uidRef = useRef(1);
  const ensureUids = (list) => list.map((d) => (d._uid != null ? d : { ...d, _uid: uidRef.current++ }));

  const loadDraft = async () => {
    setLoading(true);
    try {
      const params = {};
      if (cashless_case_id) params.cashless_case_id = cashless_case_id;
      else if (claim_id) params.claim_id = claim_id;
      if (payer?.code) params.payer_id = payer.code;
      if (policy?.policy_number) params.policy_number = policy.policy_number;
      const res = await api.preparePreauth(params);
      setDraft(res);
      setMissingFields(res.missing_fields ?? []);
    } catch (_) {
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
      const next = { ...it, [field]: isNaN(val) ? raw : val };
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

  const handleSaveDraft = () => {
    updateCaseState({ draftData: { editedDiagnoses, editedItems, editedCareTeam } });
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
  const blockingAsks = asks.filter((a) => a.blocking);
  const warnAsks = asks.filter((a) => !a.blocking && a.status !== "attached" && a.status !== "answered");
  const askDocs = asks.filter((a) => a.kind === "document");
  const askForms_ = asks.filter((a) => a.kind === "form");
  const cardMembers = eligibilityBeneficiaries(cashlessCase?.coverage_eligibility);
  const memberUnchosen = cardMembers.length > 1 && !(caseState.beneficiaryMemberId || cashlessCase?.beneficiary_member_id);
  const eligibility = draft?.eligibility;
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

  const readiness = [
    { label: "Patient details", ok: patientContextMissing.length === 0, note: patientContextMissing.length ? `${patientContextMissing.length} missing` : null },
    { label: "Diagnosis with a principal", ok: displayDiagnoses.length > 0 && displayDiagnoses.some((d) => d.primary) && !hisBlockers.some((f) => /diagnos/i.test(f)) },
    { label: "Billable line items", ok: displayItems.length > 0 && effectiveTotal > 0 && !hisBlockers.some((f) => /items/i.test(f)) },
    askDocs.length > 0 && {
      label: "Payer documents",
      ok: askDocs.every((a) => a.status === "attached"),
      soft: !askDocs.some((a) => a.blocking),
      note: `${askDocs.filter((a) => a.status === "attached").length} of ${askDocs.length}`,
    },
    askForms_.length > 0 && {
      label: "Payer forms",
      ok: askForms_.every((a) => a.status === "answered"),
      soft: !askForms_.some((a) => a.blocking),
      note: `${askForms_.filter((a) => a.status === "answered").length} of ${askForms_.length} complete`,
    },
    hasMissingDocs && { label: "Hospital documents", ok: false, note: "required file missing" },
    {
      label: "Against the plan",
      ok: admissibility?.status === "checked" && planNotes.length === 0,
      soft: !planBlocked,
      note: !admissibility || admissibility.status !== "checked" ? "not checked" : planNotes.length ? `${planNotes.length} to look at` : null,
    },
    eligibility && eligibility.status !== "complete" && { label: "Eligibility", ok: false, soft: true, note: "incomplete" },
  ].filter(Boolean);
  const canSubmit = !hasMissingFields && !hasMissingDocs && !planBlocked && blockingAsks.length === 0 && !submitting;
  const notices = [
    preauthAlreadyLive && { tone: "info", text: `A preauth has already been sent${movedOnLabel ? ` and the case has moved on to ${movedOnLabel}` : ""}. This form is rebuilt from current records, not what was sent.`, action: movedOn ? { label: `Go to ${movedOnLabel}`, to: `../${movedOn}` } : null },
    hisBlockers.length > 0 && { tone: "bad", text: `The hospital records are missing: ${hisBlockers.join(", ")}. Ask the doctor or billing desk to add it, then reload this page.` },
    newbornMissing.length > 0 && !preauthAlreadyLive && { tone: "warn", text: `Newborn case: ${newbornMissing.map((f) => NEWBORN_MISSING[f] || f).join("; ")}.` },
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
    if (warnAsks.length > 0 && waiveReason.trim() && caseId) {
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
  const requestSend = () => (warnAsks.length > 0 ? setConfirmWarn(true) : handleSubmit());

  return (
    <div className="cv-screen" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {notices.map((n, i) => (
        <div key={i} className={`cv-notice is-${n.tone}`}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className="cv-notice-body" style={{ flex: 1, minWidth: 240 }}>{n.text}</span>
            {n.action && <button type="button" className="cv-btn" onClick={() => navigate(n.action.to)}>{n.action.label}</button>}
          </div>
        </div>
      ))}

      <div className="cv-split">
        <div className="cv-main">
          {patientContextMissing.length > 0 && (
            <PatientContextForm
              claimId={draft?.claim_id || claim_id}
              cashlessCaseId={cashless_case_id}
              missingFields={patientContextMissing}
              onResolved={(remaining) => {
                setMissingFields(remaining);
                if (remaining.length === 0) loadDraft();
              }}
            />
          )}

          <section className="cv-card" aria-label="Clinical">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Clinical</h2>
              <span className="cv-card-meta">From the hospital records; open a row to check or correct it.</span>
            </div>
            <ClinicalRow openRow={openRow} setOpenRow={setOpenRow}
              id="admission"
              title="Admission"
              chip={draft?.admission_date ? ["Done", "is-ok"] : ["Missing", "is-bad"]}
              summary={[
                draft?.admission_date ? formatDate(draft.admission_date) : "No admission date",
                draft?.inpatient === false ? "Out-patient" : "In-patient",
                draft?.urgent ? "Urgent" : "Routine",
                accommodation.ward,
              ].filter(Boolean).join(" · ")}
            >
              <div className="cv-cols">
                <div>
                  <div className="cv-kv"><span>Admission</span><span>{draft?.admission_date ? formatDate(draft.admission_date) : "—"}</span></div>
                  <div className="cv-kv"><span>Discharge</span><span>{draft?.discharge_date ? formatDate(draft.discharge_date) : "Not discharged"}</span></div>
                  <div className="cv-kv"><span>Encounter</span><span>{draft?.inpatient === false ? "Out-patient" : "In-patient"}</span></div>
                  <div className="cv-kv"><span>Priority</span><span>{draft?.urgent ? "Urgent" : "Routine"}</span></div>
                </div>
                <div>
                  <div className="cv-kv"><span>Ward</span><span>{accommodation.ward || "—"}</span></div>
                  <div className="cv-kv"><span>Specialty</span><span>{accommodation.specialty || "—"}</span></div>
                  <div className="cv-kv"><span>Room</span><span>{accommodation.room || "—"}</span></div>
                  <div className="cv-kv"><span>Bed</span><span className="cv-mono">{accommodation.bed_code || "—"}</span></div>
                </div>
              </div>
            </ClinicalRow>
            <ClinicalRow openRow={openRow} setOpenRow={setOpenRow}
              id="diagnosis"
              title="Diagnosis"
              chip={principal ? ["Done", "is-ok"] : ["Missing", "is-bad"]}
              summary={principal ? `${principal.name || "—"}${principal.code ? ` (${principal.code})` : ""} · principal${displayDiagnoses.length > 1 ? ` · +${displayDiagnoses.length - 1} more` : ""}` : "No diagnosis on record"}
            >
              <div className="cv-tw">
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
                  </tbody>
                </table>
              </div>
              <button type="button" className="cv-btn" style={{ marginTop: 12 }} onClick={addDiagnosis}><Plus size={14} /> Add diagnosis</button>
            </ClinicalRow>
            <ClinicalRow openRow={openRow} setOpenRow={setOpenRow}
              id="justification"
              title="Clinical justification"
              chip={justification.length ? ["Done", "is-ok"] : ["Thin", "is-warn"]}
              summary={justification.length ? justification.map(([label, codes]) => `${codes.length} ${label.toLowerCase()}`).join(" · ") : "No coded complaints, findings or tests; fuller notes mean fewer queries"}
            >
              {justification.length ? (
                justification.map(([label, codes]) => (
                  <div key={label} className="cv-kv"><span>{label}</span><span>{codes.map((c) => c.name || c.code).join(", ")}</span></div>
                ))
              ) : (
                <div className="cv-card-meta">Nothing coded on the clinical note.</div>
              )}
            </ClinicalRow>
            <ClinicalRow openRow={openRow} setOpenRow={setOpenRow}
              id="team"
              title="Treating team"
              chip={displayCareTeam.length === 0 ? ["None", "is-warn"] : teamMissingReg ? [`${teamMissingReg} no reg.`, "is-warn"] : ["Done", "is-ok"]}
              summary={displayCareTeam.length ? displayCareTeam.map((d) => `${d.doc_name || "—"}${d.speciality_display || d.speciality ? ` (${d.speciality_display || d.speciality})` : ""}`).join(" · ") : "No doctor on record"}
            >
              {displayCareTeam.length > 0 && (
                <div className="cv-tw">
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
                </div>
              )}
            </ClinicalRow>
          </section>

          <section className="cv-card" aria-label="Treatment and cost">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Treatment &amp; cost</h2>
              {planNotes.length > 0 ? <span className="cv-chip is-warn">{planNotes.length} to look at</span> : <span className="cv-chip is-ok">{displayItems.length} lines</span>}
              {editedItems && <span className="cv-card-meta">Edited; the amount is recomputed from the lines</span>}
            </div>
            {unbilledProcedures.length > 0 && (
              <div className="cv-card-intro">Procedures not billed as a line: {unbilledProcedures.map((p) => `${p.name}${p.code ? ` (${p.code})` : ""}`).join(", ")}</div>
            )}
            <div className="cv-tw cv-in-card">
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
                        <strong>{item.service_name}</strong>
                        <div className="cv-card-meta">{[item.service_code, item.category, item.service_start_date && formatDate(item.service_start_date)].filter(Boolean).join(" · ")}</div>
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
            </div>
          </section>

          <PayerAsks caseId={caseId} stage="preauth" asks={draft?.payer_asks} documents={docs} readOnly={readOnly || caseClosed} onAttach={attachAsk} onFormsChange={setAskForms} />

          <section className="cv-card" aria-label="Other files">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Other files</h2>
              <span className="cv-card-meta">From the hospital records, or added here. Sent as supporting information.</span>
            </div>
            <div className="cv-card-body">
              <DocumentChecklist
                documents={otherDocs}
                onUpload={handleUpload}
                onAddDocument={addDocument}
                onRenameDocument={(i, name) => renameDocument(docs.indexOf(otherDocs[i]), name)}
                onRemoveDocument={(i) => removeDocument(docs.indexOf(otherDocs[i]))}
                hideSummary
              />
            </div>
          </section>

          {draft?.discharge_summary && (
            <section className="cv-card" aria-label="Discharge summary">
              <div className="cv-card-head"><h2 className="cv-card-title">Discharge summary</h2></div>
              <div className="cv-card-body">
                <div className="cv-kv"><span>Condition</span><span>{draft.discharge_summary.condition || "—"}</span></div>
                <div className="cv-kv"><span>Advice</span><span>{draft.discharge_summary.advice || "—"}</span></div>
                <div className="cv-kv"><span>Follow-up</span><span>{draft.discharge_summary.followup_on ? formatDate(draft.discharge_summary.followup_on) : "—"}</span></div>
              </div>
            </section>
          )}

          <div>
            <Button variant="text" onClick={() => navigate("../prep")}>← Back to eligibility</Button>
          </div>
        </div>

        <aside className="cv-aside cv-card" aria-label="Ready to send">
          <div className="cv-pane">
            <div className="cv-card-meta">Amount requested</div>
            <div style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }}>{formatMoney(effectiveTotal)}</div>
            <div className="cv-card-meta">{displayItems.length} line{displayItems.length === 1 ? "" : "s"}{editedItems ? " · edited" : ""}</div>
          </div>
          <div className="cv-pane">
            <div className="cv-sub" style={{ fontSize: 15 }}>Ready to send</div>
            {readiness.map((r) => (
              <div key={r.label} className="cv-ready-item">
                <span className={`cv-ready-mark ${r.ok ? "is-ok" : r.soft ? "is-warn" : "is-bad"}`}>{r.ok ? "✓" : "!"}</span>
                <span style={{ flex: 1 }}>{r.label}</span>
                {r.note && <span className="cv-ready-note">{r.note}</span>}
              </div>
            ))}
          </div>
          {(planNotes.length > 0 || admissibility?.exclusions?.length > 0) && (
            <div className="cv-pane">
              <div className="cv-sub" style={{ fontSize: 15 }}>Against the plan</div>
              <div className="cv-card-meta" style={{ marginBottom: 6 }}>Warnings; only a package priced at zero or less stops the send.</div>
              {planNotes.map((c, i) => (
                <div key={i} style={{ fontSize: 13.5, padding: "4px 0", color: c.level === "block" ? "var(--error)" : undefined }}>{c.message}</div>
              ))}
              {admissibility?.exclusions?.length > 0 && <div className="cv-card-meta" style={{ marginTop: 6 }}>Excluded by the plan: {admissibility.exclusions.join("; ")}.</div>}
            </div>
          )}
          <div className="cv-pane">
            <div className="cv-kv"><span>Payer</span><span><PayerName id={draft?.payer_id || payer?.code} name={payer?.name} /></span></div>
            <div className="cv-kv"><span>Policy</span><span className="cv-mono">{draft?.policy_number || "—"}</span></div>
            <div className="cv-kv"><span>Member ID</span><span className="cv-mono">{draft?.patient?.member_id || "—"}</span></div>
          </div>
          <div className="cv-pane" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {submitError && (
              <div className="cv-notice is-bad">
                <div className="cv-notice-title">Not sent</div>
                <div className="cv-notice-body">{submitError}</div>
                <div className="cv-notice-hint" style={{ marginTop: 6 }}>Fix what the message names and send again. Your draft is kept.</div>
              </div>
            )}
            {!preauthAlreadyLive && blockingAsks.length > 0 && (
              <div className="cv-card-meta" style={{ color: "var(--error)" }}>
                The payer asked for {blockingAsks.map((a) => a.display).join(", ")}; finish {blockingAsks.length === 1 ? "it" : "them"} to send.
              </div>
            )}
            {preauthAlreadyLive ? (
              <>
                <button type="button" className="cv-btn is-primary is-wide" onClick={() => navigate("../status")}>View decision <ArrowRight size={14} /></button>
                {sentCorrelationId && caseId && <button type="button" className="cv-btn" onClick={() => setShowSent(true)}><FileJson size={14} /> View what was sent</button>}
                {!caseClosed && <button type="button" className="cv-btn" disabled={!canSubmit} onClick={() => setConfirmResend(true)}><Send size={14} /> Send a fresh preauth…</button>}
              </>
            ) : (
              <>
                <button type="button" className="cv-btn is-primary is-wide" disabled={!canSubmit || readOnly} onClick={requestSend}>
                  <Send size={15} /> {submitting ? "Sending…" : "Send preauth"}
                </button>
                <button type="button" className="cv-btn" onClick={handleSaveDraft}><Save size={14} /> Save draft</button>
              </>
            )}
          </div>
        </aside>
      </div>

      <Modal open={confirmWarn} onClose={() => setConfirmWarn(false)} title="Send without these?" subtitle="Only the plan lists them, so the send is allowed, but the payer may query or refuse.">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {warnAsks.map((a) => (
              <li key={`${a.kind}-${a.code || a.form_url}`}>{a.display}</li>
            ))}
          </ul>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="cv-card-meta">Reason (kept as a case note)</span>
            <textarea className="cv-ctl" style={{ height: 80, padding: 10 }} value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" className="cv-btn" onClick={() => setConfirmWarn(false)}>Go back</button>
            <button type="button" className="cv-btn is-primary" disabled={!waiveReason.trim() || submitting} onClick={send}>Send anyway</button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmResend} onClose={() => setConfirmResend(false)} title="Send a fresh preauth?" subtitle="The payer receives a new preauth request for this case, built from the current records.">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="cv-card-meta" style={{ margin: 0 }}>To answer a query, resubmit after a rejection or raise the approved amount, use the Approval stage instead. A fresh preauth starts the payer's review over.</p>
          {submitError && <div className="cv-notice is-bad"><div className="cv-notice-body">{submitError}</div></div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" className="cv-btn" onClick={() => setConfirmResend(false)}>Cancel</button>
            <button type="button" className="cv-btn is-primary" disabled={!canSubmit} onClick={handleSubmit}>{submitting ? "Sending…" : `Send ${formatMoney(effectiveTotal)} preauth`}</button>
          </div>
        </div>
      </Modal>

      <FhirBundleModal open={showSent} onClose={() => setShowSent(false)} cashlessCaseId={caseId} transactionType="preauth" correlationId={sentCorrelationId} />
    </div>
  );
}
