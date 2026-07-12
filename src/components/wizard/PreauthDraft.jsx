import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, User, AlertCircle, ChevronDown, ChevronUp, Save, ArrowLeft, Edit2, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../api";
import { Card, Button, DocumentChecklist, MissingFieldsAlert, LoadingBlock } from "../Common";

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

function PatientContextForm({ claimId, cashlessCaseId, missingFields, onResolved }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(true);

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
    <div style={{ border: "1px solid var(--error)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: "var(--space-4)" }}>
      <div
        onClick={() => setOpen((p) => !p)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(239,68,68,0.06)", cursor: "pointer", transition: "background 0.2s ease" }}
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.1)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.06)"}
      >
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontWeight: 700, color: "var(--error)", fontSize: "14px" }}>
          <AlertCircle size={16} /> Supply Missing Patient Attributes
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} style={{ color: "var(--error)" }}>
          <ChevronDown size={16} />
        </motion.div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: "auto", opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)", borderTop: "1px solid rgba(239,68,68,0.2)" }}>
              {allFields.map((f) => (
                <div key={f.key}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "var(--space-1)" }}>
                    {f.label}
                  </label>
                  <input
                    className="input-modern"
                    type={f.type || "text"}
                    placeholder={f.placeholder}
                    value={values[f.key] || ""}
                    onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
              <Button variant="primary" size="small" disabled={saving} onClick={handleSave} style={{ marginTop: "var(--space-2)" }}>
                {saving ? "Saving…" : "Save & Refresh"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PreauthDraft({ ctx }) {
  const navigate = useNavigate();
  const { caseState, updateCaseState, cashlessCase } = ctx;
  const { payer, policy, cashless_case_id, claim_id, draftData } = caseState;

  // This screen is a PRE-submission editor. Once a preauth has been submitted or
  // decided for the case, re-entering it (e.g. clicking the Preauth step in the
  // lifecycle stepper, which stays clickable as "done") would rebuild the draft
  // from the live DB and offer to submit an already-decided preauth again. Detect
  // that and send the user to the Decision screen instead. Corrections after a
  // decision go through Resubmit/Enhancement on that screen, never a fresh draft.
  const preauthAlreadyLive = !!(
    caseState.preauthCorrelationId ||
    caseState.preauthDecision ||
    cashlessCase?.preauth_status ||
    cashlessCase?.preauth?.correlation_id
  );

  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [submitting, setSaving2] = useState(false);

  // Editable sections — null means "use server draft unchanged"
  const [editedDiagnoses, setEditedDiagnoses] = useState(draftData?.editedDiagnoses ?? null);
  const [editedItems, setEditedItems] = useState(draftData?.editedItems ?? null);
  const [editedCareTeam, setEditedCareTeam] = useState(draftData?.editedCareTeam ?? null);
  const [careTeamEditMode, setCareTeamEditMode] = useState(false);

  const loadDraft = async () => {
    setLoading(true);
    try {
      const params = {};
      if (cashless_case_id) params.cashless_case_id = cashless_case_id;
      else if (claim_id) params.claim_id = claim_id;
      if (payer?.code) params.payer_id = payer.code;
      if (policy?.policyNumber || policy?.policy_number)
        params.policy_number = policy.policyNumber || policy.policy_number;
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
    if (preauthAlreadyLive) {
      navigate("../status", { replace: true });
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
        const qty = field === "quantity" ? val : it.quantity;
        const price = field === "unit_price" ? val : it.unit_price;
        next.net_amount = qty * price;
      }
      return next;
    });
    setEditedItems(updated);
  };

  // ── Diagnosis editing ─────────────────────────────────────────────────────
  const updateDiagnosis = (idx, field, value) => {
    const base = editedDiagnoses ?? draft?.diagnoses ?? [];
    setEditedDiagnoses(base.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));
  };
  const addDiagnosis = () => {
    const base = editedDiagnoses ?? draft?.diagnoses ?? [];
    setEditedDiagnoses([...base, { code: "", name: "", primary: false, on_admission: false }]);
  };
  const removeDiagnosis = (idx) => {
    const base = editedDiagnoses ?? draft?.diagnoses ?? [];
    setEditedDiagnoses(base.filter((_, i) => i !== idx));
  };

  // ── Care team editing ─────────────────────────────────────────────────────
  const updateCareTeamMember = (idx, field, value) => {
    const base = editedCareTeam ?? draft?.care_team ?? [];
    setEditedCareTeam(base.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));
  };

  const handleUpload = (doc) => {
    setDraft((prev) => ({
      ...prev,
      supporting_documents: prev.supporting_documents.map((d) =>
        d.code === doc.code ? { ...d, url: "https://hospital.example/mock/doc.pdf" } : d
      ),
    }));
  };

  const handleSaveDraft = () => {
    updateCaseState({ draftData: { editedDiagnoses, editedItems, editedCareTeam } });
  };

  const handleSubmit = async () => {
    setSaving2(true);
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
      if (editedDiagnoses) body.diagnoses = editedDiagnoses;
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
      updateCaseState({
        preauthCorrelationId: res.correlation_id,
        claim_id: draft.claim_id || claim_id,
        draftData: null,
      });
      navigate("../status");
    } catch (_) {
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

  return (
    <div className="wizard-step">
      {hisBlockers.length > 0 && (
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "12px 16px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)", fontSize: "13px", color: "var(--text-main)" }}>
          <AlertCircle size={16} color="var(--error)" style={{ flexShrink: 0, marginTop: "1px" }} />
          <div>
            <strong style={{ color: "var(--error)" }}>Clinical / billing data is incomplete.</strong>
            {" "}Diagnosis codes and billing items are missing. Please complete clinical and billing records in the HIS before submitting preauth.
            <div style={{ marginTop: "6px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {hisBlockers.map((f, i) => (
                <span key={i} className="badge-modern badge-error" style={{ fontSize: "11px" }}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      )}
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

      {draft?.eligibility && draft.eligibility.status !== "complete" && (
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "12px 16px", background: "rgba(245,158,11,0.08)", border: "1px solid var(--warning)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)", fontSize: "13px", color: "var(--text-main)" }}>
          <AlertCircle size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: "1px" }} />
          <span><strong>Benefits data from insurer is unavailable.</strong> Coverage details may be incomplete - the preauth draft was built from available eligibility data.</span>
        </div>
      )}

      <div className="grid-1-to-3" style={{ gap: "var(--space-6)" }}>
        {/* ── Left rail ── */}
        <div style={{ gridColumn: "span 1", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

          {/* Patient & Admission */}
          <Card title="Patient & Admission">
            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", marginBottom: "var(--space-4)" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--primary-light)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "18px" }}>
                <User size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{draft?.patient?.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {draft?.patient?.gender} · DOB: {draft?.patient?.dob}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-6)", fontSize: "13px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Admission</div>
                <div style={{ fontWeight: 600 }}>{draft?.admission_date || "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>ABHA</div>
                <div style={{ fontWeight: 600 }}>{draft?.patient?.abha || "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Member ID</div>
                <div style={{ fontWeight: 600 }}>{draft?.patient?.member_id || "-"}</div>
              </div>
            </div>
          </Card>

          {/* Payer & policy now live in the case identity strip — not repeated here. */}

          {/* Accommodation */}
          {draft?.accommodation && (
            <Card title="Accommodation">
              <div style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap", fontSize: "13px" }}>
                {["ward", "specialty", "room", "bed_code"].map((key) => (
                  draft.accommodation[key] != null && (
                    <div key={key}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                        {key.replace("_", " ")}
                      </div>
                      <div style={{ fontWeight: 600 }}>{draft.accommodation[key]}</div>
                    </div>
                  )
                ))}
              </div>
            </Card>
          )}

          {/* Eligibility Summary */}
          {draft?.eligibility && (
            <Card title="Eligibility Summary">
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)" }}>Status</span>
                  <span className={`badge-modern ${draft.eligibility.status === "complete" ? "badge-success" : "badge-warning"}`}>
                    {draft.eligibility.status}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)" }}>Policy in-force</span>
                  <span style={{ fontWeight: 700, color: draft.eligibility.inforce ? "var(--success)" : "var(--error)" }}>
                    {draft.eligibility.inforce === true ? "Yes" : draft.eligibility.inforce === false ? "No" : "-"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)" }}>Auth required</span>
                  <span style={{ fontWeight: 700, color: draft.eligibility.auth_required ? "var(--warning)" : "var(--success)" }}>
                    {draft.eligibility.auth_required === true ? "Yes" : draft.eligibility.auth_required === false ? "No" : "-"}
                  </span>
                </div>
                {draft.eligibility.correlation_id && (
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>
                    {draft.eligibility.correlation_id}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Clinical Information */}
          <Card title="Clinical Information">
            {/* Procedures (read-only) */}
            {draft?.procedures?.length > 0 && (
              <div style={{ marginBottom: "var(--space-4)" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "var(--space-2)", textTransform: "uppercase" }}>Procedures</div>
                {draft.procedures.map((proc, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "8px 12px", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", marginBottom: "6px" }}>
                    <span className="badge-modern badge-info" style={{ fontSize: "10px" }}>{proc.code}</span>
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>{proc.name}</span>
                    {proc.date && (
                      <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-muted)" }}>{proc.date}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Clinical justification chips (read-only, auto-attached) */}
            {[
              ["Chief Complaints", draft?.chief_complaints],
              ["Clinical Findings", draft?.clinical_findings],
              ["Medications", draft?.medications],
              ["Investigations", draft?.investigations],
            ].map(([label, codes]) => codes?.length > 0 && (
              <div key={label} style={{ marginBottom: "var(--space-4)" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "var(--space-2)", textTransform: "uppercase" }}>{label}</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {codes.map((c, i) => (
                    <span key={i} className="badge-modern badge-info" style={{ fontSize: "11px" }}>{c.name || c.code}</span>
                  ))}
                </div>
              </div>
            ))}

            {/* Diagnoses (editable) */}
            <div style={{ marginBottom: "var(--space-4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Diagnoses</div>
                <button
                  onClick={addDiagnosis}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "12px", fontWeight: 700, padding: "2px 6px" }}
                >
                  <Plus size={13} /> Add
                </button>
              </div>
              <AnimatePresence>
                {displayDiagnoses.map((diag, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "8px 10px", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", marginBottom: "6px", background: "var(--bg-card)" }}>
                      <input
                        className="input-modern"
                        style={{ width: "90px", fontSize: "12px", padding: "4px 8px" }}
                        placeholder="ICD code"
                        value={diag.code}
                        onChange={(e) => updateDiagnosis(i, "code", e.target.value)}
                      />
                      <input
                        className="input-modern"
                        style={{ flex: 1, fontSize: "12px", padding: "4px 8px" }}
                        placeholder="Diagnosis name"
                        value={diag.name}
                        onChange={(e) => updateDiagnosis(i, "name", e.target.value)}
                      />
                      {diag.primary && (
                        <span className="badge-modern badge-success" style={{ fontSize: "10px", whiteSpace: "nowrap" }}>PRIMARY</span>
                      )}
                      <button
                        onClick={() => removeDiagnosis(i)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--error)", padding: "2px", display: "flex", flexShrink: 0, transition: "transform 0.15s ease" }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
                        onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Line Items (editable) */}
            <div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "var(--space-2)", textTransform: "uppercase" }}>Line Items</div>
              <div className="table-responsive-wrapper">
                <table className="table-modern" style={{ fontSize: "13px" }}>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th style={{ textAlign: "right" }}>Net Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayItems.map((item, i) => (
                      <tr key={i}>
                        <td>{item.service_name} <code style={{ fontSize: "11px" }}>({item.service_code})</code></td>
                        <td>
                          <input
                            className="input-modern"
                            style={{ width: "60px", fontSize: "12px", padding: "4px 6px" }}
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(i, "quantity", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="input-modern"
                            style={{ width: "90px", fontSize: "12px", padding: "4px 6px" }}
                            type="number"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => updateItem(i, "unit_price", e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>₹{Number(item.net_amount)?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3" style={{ textAlign: "right", fontWeight: 700 }}>Total Billed</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: "var(--primary)", fontSize: "15px" }}>
                        ₹{effectiveTotal?.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </Card>

          {/* Care Team */}
          {displayCareTeam.length > 0 && (
            <Card title="Care Team">
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-2)" }}>
                <button
                  onClick={() => setCareTeamEditMode((p) => !p)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "12px", fontWeight: 700, padding: "2px 6px" }}
                >
                  {careTeamEditMode ? <><CheckCircle2 size={13} /> Done</> : <><Edit2 size={13} /> Edit</>}
                </button>
              </div>
              {displayCareTeam.map((doc, i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--border-color)" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--primary-light)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "14px", flexShrink: 0 }}>
                    {doc.doc_name?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    {careTeamEditMode ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <input
                          className="input-modern"
                          style={{ fontSize: "13px", padding: "4px 8px" }}
                          placeholder="Doctor name"
                          value={doc.doc_name || ""}
                          onChange={(e) => updateCareTeamMember(i, "doc_name", e.target.value)}
                        />
                        <input
                          className="input-modern"
                          style={{ fontSize: "13px", padding: "4px 8px" }}
                          placeholder="Speciality"
                          value={doc.speciality_display || doc.speciality || ""}
                          onChange={(e) => updateCareTeamMember(i, "speciality_display", e.target.value)}
                        />
                        <input
                          className="input-modern"
                          style={{ fontSize: "13px", padding: "4px 8px" }}
                          placeholder="Registration number"
                          value={doc.registration_no || ""}
                          onChange={(e) => updateCareTeamMember(i, "registration_no", e.target.value)}
                        />
                      </div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 700, fontSize: "14px" }}>{doc.doc_name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {doc.speciality_display || doc.speciality}
                          {doc.registration_no && ` · Reg: ${doc.registration_no}`}
                        </div>
                        {doc.role && (
                          <span className="badge-modern badge-info" style={{ fontSize: "10px", marginTop: "var(--space-1)" }}>{doc.role}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Discharge Summary — only present once the patient has been discharged */}
          {draft?.discharge_summary && (
            <Card title="Discharge Summary">
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                {draft.discharge_summary.condition && (
                  <div><span style={{ color: "var(--text-muted)" }}>Condition: </span><strong>{draft.discharge_summary.condition}</strong></div>
                )}
                {draft.discharge_summary.advice && (
                  <div><span style={{ color: "var(--text-muted)" }}>Advice: </span>{draft.discharge_summary.advice}</div>
                )}
                {draft.discharge_summary.followup_on && (
                  <div><span style={{ color: "var(--text-muted)" }}>Follow-up: </span>{draft.discharge_summary.followup_on}</div>
                )}
                {draft.discharge_summary.summary_html && (
                  <div style={{ whiteSpace: "pre-wrap" }}>{draft.discharge_summary.summary_html.replace(/<[^>]*>/g, "")}</div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* ── Right side ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <Card title="Required Documents">
            <DocumentChecklist documents={draft?.supporting_documents} onUpload={handleUpload} />
          </Card>

          <Card>
            <div style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: "var(--space-2)" }}>Total Request</div>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "var(--primary)" }}>
                ₹{effectiveTotal?.toLocaleString()}
              </div>
              {editedItems && (
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "var(--space-1)" }}>Edited · recomputed from line items</div>
              )}
            </div>

            {hasMissingFields && (
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", padding: "10px", background: "rgba(239,68,68,0.06)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-3)", fontSize: "12px", color: "var(--error)", fontWeight: 600 }}>
                <AlertCircle size={14} />
                Resolve missing patient attributes above before submitting.
              </div>
            )}

            {hasMissingDocs && !hasMissingFields && (
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", padding: "10px", background: "rgba(239,68,68,0.06)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-3)", fontSize: "12px", color: "var(--error)", fontWeight: 600 }}>
                <AlertCircle size={14} />
                Upload all required documents before submitting.
              </div>
            )}

            <Button
              variant="primary"
              className="w-full"
              icon={Send}
              disabled={!canSubmit}
              onClick={handleSubmit}
              style={{ justifyContent: "center" }}
            >
              {submitting ? "Submitting…" : "Submit to Payer"}
            </Button>
          </Card>
        </div>
      </div>

      {/* Sticky footer: Back · Save Draft · Submit */}
      <div style={{
        position: "sticky", bottom: 0, zIndex: 30,
        backgroundColor: "var(--glass)", backgroundImage: "var(--glass-sheen)",
        backdropFilter: "blur(var(--glass-blur)) saturate(180%)",
        WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(180%)",
        borderTop: "1px solid var(--glass-border)",
        padding: "14px 24px", margin: "24px -24px -24px -24px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)",
      }}>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate("../prep")}>
          Back
        </Button>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <Button variant="secondary" icon={Save} onClick={handleSaveDraft}>
            Save Draft
          </Button>
          <Button
            variant="primary"
            icon={Send}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? "Submitting…" : "Submit Preauth"}
          </Button>
        </div>
      </div>
    </div>
  );
}
