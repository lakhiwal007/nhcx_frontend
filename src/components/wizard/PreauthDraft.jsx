import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Send, AlertCircle, Save, Edit2, CheckCircle2, Plus, Trash2, FileJson, ArrowRight } from "lucide-react";
import { api } from "../../api";
import { Button, DocumentChecklist, LoadingBlock, formatMoney } from "../Common";
import { formatDate } from "../../format.js";
import { STEP_FORWARD_ROUTE, STEP_FORWARD_LABEL } from "../case/caseStages";
import { Section, Fields } from "../case/CaseFile";
import { Modal } from "../Overlay";
import FhirBundleModal from "../FhirBundleModal";
import PayerName from "../PayerName";
import { eligibilityBeneficiaries, eligibilityRequirements } from "../../caseStatus";

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
        <Button variant="primary" size="small" disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save & refresh draft"}
        </Button>
      </div>
    </Section>
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
  const [careTeamEditMode, setCareTeamEditMode] = useState(false);

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

  const patientContextMissing = missingFields.filter((f) => !HIS_BLOCKERS.has(f.toLowerCase()));
  const hisBlockers = missingFields.filter((f) => HIS_BLOCKERS.has(f.toLowerCase()));
  const hasMissingFields = missingFields.length > 0;
  const hasMissingDocs = draft?.supporting_documents?.some((d) => !d.optional && !d.url);
  const canSubmit = !hasMissingFields && !hasMissingDocs && !submitting;

  const docs = draft?.supporting_documents || [];
  const payerAsks = eligibilityRequirements(cashlessCase?.coverage_eligibility).filter((r) => r.at_preauth || r.stage === "pre");
  const cardMembers = eligibilityBeneficiaries(cashlessCase?.coverage_eligibility);
  const memberUnchosen = cardMembers.length > 1 && !caseState.beneficiaryMemberId;
  const requiredDocs = docs.filter((d) => !d.optional);
  const attachedRequired = requiredDocs.filter((d) => d.url).length;
  const eligibility = draft?.eligibility;
  const accommodation = draft?.accommodation || {};
  const justification = [
    ["Chief complaints", draft?.chief_complaints],
    ["Clinical findings", draft?.clinical_findings],
    ["Investigations", draft?.investigations],
    ["Medications", draft?.medications],
  ].filter(([, codes]) => codes?.length > 0);

  // What still stands between this draft and the payer, in reading order.
  const readiness = [
    { label: "Patient details", ok: patientContextMissing.length === 0, note: patientContextMissing.length ? `${patientContextMissing.length} missing` : null },
    { label: "Diagnosis with a principal", ok: displayDiagnoses.length > 0 && displayDiagnoses.some((d) => d.primary) && !hisBlockers.some((f) => /diagnos/i.test(f)) },
    { label: "Billable line items", ok: displayItems.length > 0 && effectiveTotal > 0 && !hisBlockers.some((f) => /items/i.test(f)) },
    { label: "Required documents", ok: !hasMissingDocs, note: requiredDocs.length ? `${attachedRequired} of ${requiredDocs.length}` : null },
    { label: "Eligibility checked", ok: !eligibility || eligibility.status === "complete", soft: true, note: eligibility && eligibility.status !== "complete" ? "incomplete" : null },
  ];
  const blocking = readiness.filter((r) => !r.ok && !r.soft).length;

  const fieldRow = (label, value, opts = {}) => ({ label, value, ...opts });
  // Procedures already billed as a line item are shown there; list the rest.
  const billedCodes = new Set(displayItems.map((it) => String(it.service_code)));
  const unbilledProcedures = (draft?.procedures || []).filter((p) => !billedCodes.has(String(p.code)));

  return (
    <div className="wizard-step pd-screen">
      {preauthAlreadyLive && (
        <div className="ep-notice">
          A preauth has already been sent for this case
          {movedOnLabel ? ` and it has moved on to ${movedOnLabel}` : ""}. The form below is rebuilt from current
          records, not what was sent.
          {movedOn && (
            <button type="button" className="pd-inline-link" onClick={() => navigate(`../${movedOn}`)}>
              Go to {movedOnLabel} →
            </button>
          )}
        </div>
      )}
      {hisBlockers.length > 0 && (
        <div className="ep-notice is-bad">
          <strong>Clinical or billing records are incomplete</strong> ({hisBlockers.join(", ")}). Complete them in the
          HIS, then reload this draft.
        </div>
      )}
      {eligibility && eligibility.status !== "complete" && (
        <div className="ep-notice is-warn">
          Eligibility is incomplete. The draft was built from the eligibility data available so far.
        </div>
      )}
      {memberUnchosen && !preauthAlreadyLive && (
        <div className="ep-notice is-warn">
          The payer's card has {cardMembers.length} members and none is chosen as the patient yet.
          <button type="button" className="pd-inline-link" onClick={() => navigate("../prep")}>
            Choose the member on Eligibility →
          </button>
        </div>
      )}

      <div className="pd-layout">
        <div className="pd-main">
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

          <Section id="pd-admission" title="Admission">
            <Fields
              cols={3}
              rows={[
                fieldRow("Admission date", draft?.admission_date ? formatDate(draft.admission_date) : null),
                fieldRow("Discharge date", draft?.discharge_date ? formatDate(draft.discharge_date) : "Not discharged"),
                fieldRow("Encounter", draft?.inpatient === false ? "Out-patient" : "In-patient"),
                fieldRow("Priority", draft?.urgent ? "Urgent" : "Routine"),
                fieldRow("Ward", accommodation.ward),
                fieldRow("Specialty", accommodation.specialty),
                fieldRow("Room", accommodation.room),
                fieldRow("Bed", accommodation.bed_code, { mono: true }),
              ]}
            />
          </Section>

          <Section
            id="pd-diagnosis"
            title="Diagnosis"
            meta={
              <button type="button" className="ep-action" onClick={addDiagnosis}>
                <Plus size={13} /> Add diagnosis
              </button>
            }
          >
            {displayDiagnoses.length ? (
              <div className="ep-table-wrap">
                <table className="ep-table pd-edit-table">
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Code</th>
                      <th style={{ width: 130 }}>System</th>
                      <th>Description</th>
                      <th style={{ width: 90 }}>Principal</th>
                      <th style={{ width: 44 }} aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayDiagnoses.map((diag, i) => (
                      <tr key={diag._uid ?? `d-${i}`}>
                        <td>
                          <input
                            className="input-modern pd-input ep-mono"
                            placeholder="Code"
                            aria-label="Diagnosis code"
                            value={diag.code ?? ""}
                            onChange={(e) => updateDiagnosis(i, "code", e.target.value)}
                          />
                        </td>
                        <td>
                          <select
                            className="input-modern pd-input"
                            disabled={!diag.code}
                            value={effectiveSystem(diag)}
                            onChange={(e) => updateDiagnosis(i, "code_system", e.target.value)}
                            title={diag.code ? "Terminology this code belongs to" : "Enter a code first"}
                            aria-label="Code system"
                          >
                            {!diag.code && <option value="">—</option>}
                            {CODE_SYSTEMS.map((sys) => (
                              <option key={sys.value} value={sys.value}>{sys.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="input-modern pd-input"
                            placeholder="Diagnosis description"
                            aria-label="Diagnosis description"
                            value={diag.name ?? ""}
                            onChange={(e) => updateDiagnosis(i, "name", e.target.value)}
                          />
                        </td>
                        <td>
                          <label className="pd-radio" title="Principal diagnosis — exactly one per claim">
                            <input
                              type="radio"
                              name="primary-diagnosis"
                              checked={!!diag.primary}
                              onChange={() => setPrimaryDiagnosis(i)}
                            />
                            {diag.primary ? "Principal" : ""}
                          </label>
                        </td>
                        <td>
                          <button type="button" className="pd-icon-btn" onClick={() => removeDiagnosis(i)} aria-label="Remove diagnosis">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ep-muted ep-pad">No diagnosis on record. Add the principal diagnosis before submitting.</div>
            )}
          </Section>

          <Section id="pd-treatment" title="Treatment & cost" meta={editedItems ? "Edited — amount recomputed from the lines below" : null}>
            {unbilledProcedures.length > 0 && (
              <Fields
                cols={1}
                rows={unbilledProcedures.map((p, i) =>
                  fieldRow(i === 0 ? "Procedures not billed" : " ", `${p.name}${p.date ? ` · ${formatDate(p.date)}` : ""}`, { sub: p.code }),
                )}
              />
            )}
            <div className="ep-table-wrap">
              <table className="ep-table pd-edit-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th style={{ width: 90 }}>Qty</th>
                    <th style={{ width: 140 }}>Unit price</th>
                    <th className="ep-num" style={{ width: 140 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item, i) => (
                    <tr key={i}>
                      <td>
                        <div className="ep-strong">{item.service_name}</div>
                        <div className="ep-muted">
                          {[item.service_code, item.category, item.service_start_date && formatDate(item.service_start_date)].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td>
                        <input
                          className="input-modern pd-input ep-mono"
                          type="number"
                          min="1"
                          aria-label="Quantity"
                          value={item.quantity}
                          onChange={(e) => updateItem(i, "quantity", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="input-modern pd-input ep-mono"
                          type="number"
                          min="0"
                          aria-label="Unit price"
                          value={item.unit_price}
                          onChange={(e) => updateItem(i, "unit_price", e.target.value)}
                        />
                      </td>
                      <td className="ep-num ep-mono">{formatMoney(item.net_amount)}</td>
                    </tr>
                  ))}
                  {!displayItems.length && (
                    <tr>
                      <td colSpan={4} className="ep-muted">No billable items on record.</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="pd-total-row">
                    <td colSpan={3}>Amount requested</td>
                    <td className="ep-num ep-mono">{formatMoney(effectiveTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>

          <Section id="pd-justification" title="Clinical justification" meta="Coded from the clinical notes; sent with the request">
            {justification.length ? (
              <Fields
                cols={1}
                rows={justification.map(([label, codes]) => fieldRow(label, codes.map((c) => c.name || c.code).join(", ")))}
              />
            ) : (
              <div className="ep-muted ep-pad">No coded complaints, findings, investigations or medications on the clinical note.</div>
            )}
          </Section>

          {displayCareTeam.length > 0 && (
            <Section
              id="pd-team"
              title="Treating team"
              meta={
                <button type="button" className="ep-action" onClick={() => setCareTeamEditMode((p) => !p)}>
                  {careTeamEditMode ? <><CheckCircle2 size={13} /> Done</> : <><Edit2 size={13} /> Edit</>}
                </button>
              }
            >
              <div className="ep-table-wrap">
                <table className="ep-table pd-edit-table">
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
                        {careTeamEditMode ? (
                          <>
                            <td>
                              <input className="input-modern pd-input" aria-label="Doctor name" placeholder="Doctor name" value={doc.doc_name || ""} onChange={(e) => updateCareTeamMember(i, "doc_name", e.target.value)} />
                            </td>
                            <td>
                              <input className="input-modern pd-input" aria-label="Speciality" placeholder="Speciality" value={doc.speciality_display || doc.speciality || ""} onChange={(e) => updateCareTeamMember(i, "speciality_display", e.target.value)} />
                            </td>
                            <td>
                              <input className="input-modern pd-input ep-mono" aria-label="Registration number" placeholder="Registration number" value={doc.registration_no || ""} onChange={(e) => updateCareTeamMember(i, "registration_no", e.target.value)} />
                            </td>
                          </>
                        ) : (
                          <>
                            <td>
                              <div className="ep-strong">{doc.doc_name || "—"}</div>
                              {doc.role && <div className="ep-muted">{doc.role}</div>}
                            </td>
                            <td>{doc.speciality_display || doc.speciality || "—"}</td>
                            <td className={doc.registration_no ? "ep-mono" : "is-bad"}>{doc.registration_no || "Missing"}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section
            id="pd-documents"
            title="Supporting documents"
            meta={requiredDocs.length ? `${attachedRequired} of ${requiredDocs.length} required attached` : null}
          >
            {payerAsks.length > 0 && (
              <div className="ep-notice">
                The payer asked for these at pre-auth:{" "}
                {payerAsks
                  .map((r) => `${r.display || r.code || r.text}${r.kind === "form" ? " (form)" : ""}${r.for_code ? ` for ${r.for_code}` : ""}`)
                  .join(" · ")}
              </div>
            )}
            <div className="pd-docs">
              <DocumentChecklist
                documents={draft?.supporting_documents}
                onUpload={handleUpload}
                onAddDocument={addDocument}
                onRenameDocument={renameDocument}
                onRemoveDocument={removeDocument}
                hideSummary
              />
            </div>
          </Section>

          {draft?.discharge_summary && (
            <Section id="pd-discharge" title="Discharge summary">
              <Fields
                cols={1}
                rows={[
                  fieldRow("Condition", draft.discharge_summary.condition),
                  fieldRow("Advice", draft.discharge_summary.advice),
                  fieldRow("Follow-up", draft.discharge_summary.followup_on ? formatDate(draft.discharge_summary.followup_on) : null),
                  fieldRow("Summary", draft.discharge_summary.summary_html?.replace(/<[^>]*>/g, "")),
                ]}
              />
            </Section>
          )}

          <div className="ep-footer">
            <Button variant="text" onClick={() => navigate("../prep")}>
              ← Back to eligibility
            </Button>
          </div>
        </div>

        {/* The request as it will be sent, and the one place to submit it */}
        <aside className="pd-side">
          <section className="ep-section pd-request">
            <header className="ep-section-head">
              <h3 className="ep-section-title">Preauth request</h3>
            </header>
            <div className="pd-amount">
              <div className="ep-muted">Amount requested</div>
              <div className="pd-amount-value ep-mono">{formatMoney(effectiveTotal)}</div>
              <div className="ep-muted">
                {displayItems.length} line item{displayItems.length === 1 ? "" : "s"}
                {editedItems ? " · edited" : ""}
              </div>
            </div>

            <ul className="pd-ready" aria-label="Readiness">
              {readiness.map((r) => (
                <li key={r.label} className={r.ok ? "is-ok" : r.soft ? "is-soft" : "is-todo"}>
                  {r.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  <span>{r.label}</span>
                  {r.note && <span className="pd-ready-note">{r.note}</span>}
                </li>
              ))}
            </ul>

            <dl className="pd-sent">
              <div><dt>Payer</dt><dd><PayerName id={draft?.payer_id || payer?.code} name={payer?.name} /></dd></div>
              <div><dt>Policy</dt><dd className="ep-mono" title={draft?.policy_number}>{draft?.policy_number || "—"}</dd></div>
              <div><dt>Member ID</dt><dd className="ep-mono">{draft?.patient?.member_id || "—"}</dd></div>
              <div><dt>ABHA</dt><dd className="ep-mono">{draft?.patient?.abha || "—"}</dd></div>
              {eligibility?.correlation_id && (
                <div><dt>Eligibility ref.</dt><dd className="ep-mono" title={eligibility.correlation_id}>{eligibility.correlation_id}</dd></div>
              )}
            </dl>

            <div className="pd-submit">
              {submitError && <div className="ep-notice is-bad">{submitError}</div>}
              {!submitError && !preauthAlreadyLive && blocking > 0 && (
                <div className="ep-muted">
                  {blocking} item{blocking === 1 ? "" : "s"} above must be resolved before submitting.
                </div>
              )}
              {preauthAlreadyLive ? (
                <>
                  <Button variant="primary" icon={ArrowRight} onClick={() => navigate("../status")} className="pd-submit-btn">
                    View decision
                  </Button>
                  {sentCorrelationId && (cashless_case_id || draft?.cashless_case_id) && (
                    <button type="button" className="pd-text-btn" onClick={() => setShowSent(true)}>
                      <FileJson size={13} /> View what was sent
                    </button>
                  )}
                  {!caseClosed && (
                    <button type="button" className="pd-text-btn" disabled={!canSubmit} onClick={() => setConfirmResend(true)}>
                      <Send size={13} /> Send a fresh preauth…
                    </button>
                  )}
                </>
              ) : (
                <>
                  <Button variant="primary" icon={Send} disabled={!canSubmit} onClick={handleSubmit} className="pd-submit-btn">
                    {submitting ? "Submitting…" : "Submit preauth"}
                  </Button>
                  <button type="button" className="pd-text-btn" onClick={handleSaveDraft}>
                    <Save size={13} /> Save draft
                  </button>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>

      <Modal
        open={confirmResend}
        onClose={() => setConfirmResend(false)}
        title="Send a fresh preauth?"
        subtitle="The payer receives a new preauth request for this case, built from the current records."
      >
        <div className="pd-confirm">
          <p className="ep-muted">
            To answer a payer query, resubmit after a rejection, or raise the approved amount, use the Approval stage
            instead. A fresh preauth starts the payer's review over.
          </p>
          {submitError && <div className="ep-notice is-bad">{submitError}</div>}
          <div className="pd-confirm-actions">
            <Button variant="outline" onClick={() => setConfirmResend(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Send} disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? "Sending…" : `Send ${formatMoney(effectiveTotal)} preauth`}
            </Button>
          </div>
        </div>
      </Modal>

      <FhirBundleModal
        open={showSent}
        onClose={() => setShowSent(false)}
        cashlessCaseId={cashless_case_id || draft?.cashless_case_id}
        transactionType="preauth"
        correlationId={sentCorrelationId}
      />
    </div>
  );
}
