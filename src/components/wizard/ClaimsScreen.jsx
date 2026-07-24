import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Send, ArrowRight, AlertCircle, AlertTriangle, X, Edit2, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../api";
import { usePoll } from "../../hooks/usePoll";
import { Card, Button, DocumentChecklist, DecisionBanner, AmountGrid, MissingFieldsAlert, LoadingBlock, formatMoney } from "../Common";
import SendCommunicationModal, { OUTBOUND_COMMUNICATIONS_ENABLED } from "../SendCommunicationModal";

const POLL_INTERVAL_MS = 7000;
const PATIENT_CONTEXT_FIELDS = [
  { key: "abha", label: "ABHA Number", placeholder: "91-XXXX-XXXX-XXXX" },
  { key: "member_id", label: "Member / PMJAY ID", placeholder: "PMJAY-MEM-XXXXX" },
  { key: "dob", label: "Date of Birth", type: "date" },
  { key: "admission_date", label: "Admission Date", type: "date" },
  { key: "discharge_date", label: "Discharge Date", type: "date" },
];

// Fields that cannot be resolved from the UI — they must be completed in the
// HIS. Showing the patient-context form for these is a bug (per the spec):
// diagnosis codes and billing items come from clinical/billing records, and
// preauth_ref requires an approved preauth. preauth_ref has its own banner, so
// the HIS-blocker banner only surfaces diagnoses/items.
const HIS_BLOCKERS = new Set(["diagnoses", "items", "preauth_ref"]);

function Drawer({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-overlay"
            style={{ position: "fixed", inset: 0, zIndex: 90 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="glass-panel"
            style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: "min(520px, 95vw)", zIndex: 91, display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid var(--border-color)" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>{title}</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                <X size={22} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-6)" }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function PatientContextForm({ claimId, onResolved }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(true);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.patchPatientContext(claimId, { patient_context: values });
      onResolved(res.missing_fields ?? []);
    } catch (_) {
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ border: "1px solid var(--error)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
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
              {PATIENT_CONTEXT_FIELDS.map((f) => (
                <div key={f.key}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "var(--space-1)" }}>{f.label}</label>
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

export default function ClaimsScreen({ ctx }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { caseState, updateCaseState, cashlessCase, moneyLedger, timelineEvents, refreshTimeline } = ctx;
  const payerId = caseState.payer?.code || cashlessCase?.payer_id || "";

  const [loading, setLoading] = useState(true);
  const [claimDraft, setClaimDraft] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState(location.state?.tab || "draft");

  // Discharge flow
  const [dischargeCorrelationId, setDischargeCorrelationId] = useState(caseState.dischargeCorrelationId || null);
  const [dischargeStatus, setDischargeStatus] = useState(null);
  const [dischargePolling, setDischargePolling] = useState(false);

  // Final claim flow
  const [finalCorrelationId, setFinalCorrelationId] = useState(caseState.claimCorrelationId || null);
  const [claimStatus, setClaimStatus] = useState(null);
  const [polling, setPolling] = useState(false);

  const [showQueryDrawer, setShowQueryDrawer] = useState(false);
  const [showResubmitDrawer, setShowResubmitDrawer] = useState(false);
  // Separate from showResubmitDrawer: corrects a rejected *discharge*
  // (interim, wf=14) claim via DC01, not the final claim (workflow 16) —
  // no reprocess option applies since no final claim exists yet.
  const [showDischargeResubmitDrawer, setShowDischargeResubmitDrawer] = useState(false);
  const [showContextDrawer, setShowContextDrawer] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [queryAnswer, setQueryAnswer] = useState("");

  // Editable items in resubmit drawer
  const [resubmitEditItems, setResubmitEditItems] = useState(null);

  // Acknowledgement that the final bill exceeds the authorized ceiling — the
  // over-ceiling excess is recovered from the patient (or needs an enhancement),
  // so the desk must confirm before the final claim goes out (J2 guard).
  const [ackOverCeiling, setAckOverCeiling] = useState(false);

  const claimId = caseState.claim_id || location.state?.claim_id;
  const resolvedClaimId = claimId || caseState.claim_id || null;
  const resolvedCashlessCaseId = caseState.cashless_case_id || location.state?.cashless_case_id || null;

  const loadDraft = async (id, params) => {
    setLoading(true);
    try {
      const queryParams = params || (id || resolvedClaimId ? { claim_id: id || resolvedClaimId } : {});
      const res = await api.prepareClaimDraft(queryParams);
      setClaimDraft(res);
      setMissingFields(res.missing_fields ?? []);
      if (res.claim_id && !resolvedClaimId) {
        updateCaseState({ claim_id: res.claim_id });
      }
      if (res.cashless_case_id && !resolvedCashlessCaseId) {
        updateCaseState({ cashless_case_id: res.cashless_case_id });
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (finalCorrelationId) {
      setActiveTab("decision");
      setPolling(true);
    } else if (dischargeCorrelationId) {
      // Resume polling a discharge submission from a prior session/tab close
      // — e.g. a resubmit_discharge_claim Work Queue task landing here fresh.
      setDischargePolling(true);
    }

    if (!resolvedClaimId && !resolvedCashlessCaseId) {
      setLoading(false);
      setClaimDraft({ _error: "No claim ID available. Please complete the preauth step first." });
      return;
    }

    const params = {};
    if (resolvedClaimId) params.claim_id = resolvedClaimId;
    else if (resolvedCashlessCaseId) params.cashless_case_id = resolvedCashlessCaseId;

    loadDraft(null, params);
  }, []);

  // Discharge claim polling
  const pollDischarge = async (signal) => {
    try {
      const res = await api.getClaimStatus(dischargeCorrelationId, signal);
      setDischargeStatus(res);
      // REJECTED is terminal for the interim discharge submission too — the
      // claim itself reverts to draft, but there is nothing left to poll for
      // until the hospital corrects and resubmits via DC01.
      if (res.status === "complete" || res.status === "not_found" || res.decision === "REJECTED") {
        setDischargePolling(false);
        // A terminal claim decision moves the money ledger — refresh the shared
        // timeline so the case header's money strip tracks it (this screen polls
        // locally, so caseState — which the header watches — wouldn't otherwise change).
        refreshTimeline?.();
      }
    } catch (_) {}
  };
  usePoll(pollDischarge, {
    active: dischargePolling && dischargeCorrelationId ? dischargeCorrelationId : null,
    intervalMs: POLL_INTERVAL_MS,
  });

  // Final claim polling
  const pollFinal = async (signal) => {
    try {
      const res = await api.getClaimStatus(finalCorrelationId, signal);
      setClaimStatus(res);
      if (res.status === "complete" || res.status === "not_found") {
        setPolling(false);
        refreshTimeline?.();
      }
    } catch (_) {}
  };
  usePoll(pollFinal, {
    active: polling && finalCorrelationId ? finalCorrelationId : null,
    intervalMs: POLL_INTERVAL_MS,
  });

  // Seed resubmit drawer items when either the final-claim or discharge-claim
  // resubmit drawer opens.
  useEffect(() => {
    if (showResubmitDrawer || showDischargeResubmitDrawer) {
      setResubmitEditItems(claimDraft?.items?.map((it) => ({ ...it })) ?? []);
    }
  }, [showResubmitDrawer, showDischargeResubmitDrawer]);

  const handleUpload = (doc) => {
    setClaimDraft((prev) => ({
      ...prev,
      supporting_documents: prev.supporting_documents.map((d) =>
        d.code === doc.code ? { ...d, url: "https://hospital.example/mock/doc.pdf" } : d
      ),
    }));
  };

  const updateResubmitItem = (idx, field, raw) => {
    const val = Number(raw);
    setResubmitEditItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, [field]: isNaN(val) ? raw : val };
        if (field === "quantity" || field === "unit_price") {
          const qty = field === "quantity" ? val : it.quantity;
          const price = field === "unit_price" ? val : it.unit_price;
          next.net_amount = qty * price;
        }
        return next;
      })
    );
  };

  const handleSubmitDischarge = async () => {
    setSubmitting(true);
    try {
      const res = await api.submitDischargeClaim({ claim_id: claimDraft.claim_id });
      setDischargeCorrelationId(res.correlation_id);
      updateCaseState({ dischargeCorrelationId: res.correlation_id });
      setDischargePolling(true);
    } catch (_) {
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitFinal = async () => {
    setSubmitting(true);
    try {
      const res = await api.submitFinalClaim({ claim_id: claimDraft.claim_id });
      setFinalCorrelationId(res.correlation_id);
      updateCaseState({ claimCorrelationId: res.correlation_id });
      setActiveTab("decision");
      setPolling(true);
    } catch (_) {
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuerySubmit = async () => {
    setSubmitting(true);
    try {
      const res = await api.respondClaimQuery({
        claim_id: claimDraft?.claim_id || claimId,
        ...(queryAnswer && {
          questionnaire_response: {
            status: "completed",
            item: [{ linkId: "query-1", answer: [{ valueString: queryAnswer }] }],
          },
        }),
      });
      setShowQueryDrawer(false);
      setFinalCorrelationId(res.correlation_id);
      updateCaseState({ claimCorrelationId: res.correlation_id });
      setActiveTab("decision");
      setPolling(true);
    } catch (_) {
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmitClaim = async () => {
    setSubmitting(true);
    try {
      const body = {
        ...(resolvedClaimId ? { claim_id: resolvedClaimId } : {}),
        ...(resolvedCashlessCaseId ? { cashless_case_id: resolvedCashlessCaseId } : {}),
        ...(payerId ? { payer_id: payerId } : {}),
      };
      if (resubmitEditItems?.length > 0) {
        const total = resubmitEditItems.reduce((s, it) => s + (Number(it.net_amount) || 0), 0);
        body.items = resubmitEditItems;
        body.total_amount = total;
      }
      const res = await api.resubmitClaim(body);
      setShowResubmitDrawer(false);
      setFinalCorrelationId(res.correlation_id);
      updateCaseState({ claimCorrelationId: res.correlation_id });
      setActiveTab("decision");
      setPolling(true);
    } catch (_) {
    } finally {
      setSubmitting(false);
    }
  };

  // Corrects a rejected *discharge* claim under NHCX workflow DC01 — same
  // body shape as the original discharge submit, distinct from
  // handleResubmitClaim (final claim, workflow 16). Stays on the Discharge
  // Claim tab and resumes polling the same correlation id, mirroring how a
  // successful call clears the stale REJECTED decision server-side.
  const handleResubmitDischargeClaim = async () => {
    setSubmitting(true);
    try {
      const body = {
        ...(resolvedClaimId ? { claim_id: resolvedClaimId } : {}),
      };
      if (resubmitEditItems?.length > 0) {
        body.items = resubmitEditItems;
      }
      const res = await api.resubmitDischargeClaim(body);
      setShowDischargeResubmitDrawer(false);
      setDischargeCorrelationId(res.correlation_id);
      updateCaseState({ dischargeCorrelationId: res.correlation_id });
      setDischargeStatus(null);
      setDischargePolling(true);
    } catch (_) {
    } finally {
      setSubmitting(false);
    }
  };

  const tabs = [
    { id: "draft", label: "Claim Draft" },
    { id: "discharge", label: "Discharge Claim" },
    { id: "final", label: "Final Claim" },
    { id: "decision", label: "Claim Decision" },
  ];

  const hasMissingFields = missingFields.length > 0;
  // Split missing_fields: patient-context fields are resolvable inline via the
  // patient-context PATCH; HIS blockers (diagnoses/items) must be fixed in the
  // HIS and must NOT route to the patient-context form.
  const patientContextMissing = missingFields.filter((f) => !HIS_BLOCKERS.has(f.toLowerCase()));
  const hisBlockers = missingFields.filter(
    (f) => HIS_BLOCKERS.has(f.toLowerCase()) && f.toLowerCase() !== "preauth_ref",
  );
  const hasPreauthRef = !!claimDraft?.preauth_ref;
  // Docs block submit when any has no URL (all returned docs are required)
  const hasMissingDocs = claimDraft?.supporting_documents?.some((d) => !d.url);

  // J2 — the final bill against the cumulative authorized ceiling (preauth +
  // enhancements). When it exceeds the sanction, warn and require an explicit
  // acknowledgement before submitting, since the excess is not payer-covered.
  const authorizedCeiling = moneyLedger?.authorized_ceiling?.value;
  const billedTotal = claimDraft?.total_amount;
  const overCeiling =
    authorizedCeiling != null && billedTotal != null && billedTotal > authorizedCeiling;
  const ceilingExcess = overCeiling ? billedTotal - authorizedCeiling : 0;

  const canSubmit = !hasMissingFields && hasPreauthRef && !hasMissingDocs && !submitting;
  // The final claim carries the extra over-ceiling acknowledgement gate; the
  // interim discharge submit (which has no ack UI) keeps the base canSubmit.
  const canSubmitFinal = canSubmit && (!overCeiling || ackOverCeiling);

  const claimDecision = claimStatus?.decision;
  // Latest claim decision event from the audit trail — carries the payer's raw
  // outcome / reason codes / classified_by / inbound workflow id for the banner
  // (fuller provenance). nhcx_workflow_id is a sibling of `decision`, fold it in.
  const claimDecisionEvent =
    [...(timelineEvents || [])].reverse().find((e) => e.workflow === "claim" && e.decision);
  const claimProvenance = claimDecisionEvent
    ? { ...claimDecisionEvent.decision, nhcx_workflow_id: claimDecisionEvent.nhcx_workflow_id }
    : null;
  const isClaimApproved = claimDecision === "APPROVED";
  const isPartialApproval = claimDecision === "PARTIALLY_APPROVED";
  const isClaimQueried = claimDecision === "QUERIED";
  const isClaimRejected = claimDecision === "REJECTED";

  useEffect(() => {
    const action = location.state?.openAction;
    // The discharge (interim, wf=14) rejection has no claimStatus-derived
    // decision to gate on — the task existing at all is the signal, there is
    // no separate "decided" state to wait for like the final-claim actions
    // below. Routes to the Discharge tab, not Claim Decision.
    if (action === "resubmit_discharge_claim") {
      if (resolvedCashlessCaseId && !caseState.cashless_case_id) {
        updateCaseState({ cashless_case_id: resolvedCashlessCaseId });
      }
      if (resolvedClaimId && !caseState.claim_id) {
        updateCaseState({ claim_id: resolvedClaimId });
      }
      setActiveTab("discharge");
      setShowDischargeResubmitDrawer(true);
      return;
    }
    if (action !== "resubmit_claim" && action !== "respond_claim_query") return;
    if (isClaimQueried || isClaimRejected || isPartialApproval) {
      if (resolvedCashlessCaseId && !caseState.cashless_case_id) {
        updateCaseState({ cashless_case_id: resolvedCashlessCaseId });
      }
      if (resolvedClaimId && !caseState.claim_id) {
        updateCaseState({ claim_id: resolvedClaimId });
      }
      setActiveTab("decision");
      if (action === "resubmit_claim") {
        setShowResubmitDrawer(true);
      } else if (action === "respond_claim_query") {
        setShowQueryDrawer(true);
      }
    }
  }, [location.state?.openAction, resolvedClaimId, resolvedCashlessCaseId, caseState.cashless_case_id, caseState.claim_id, isClaimQueried, isClaimRejected, isPartialApproval, updateCaseState]);

  if (loading) {
    return <LoadingBlock text="Building claim draft…" />;
  }

  if (claimDraft?._error) {
    return (
      <Card>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", padding: "8px 0" }}>
          <AlertCircle size={22} color="var(--error)" />
          <div>
            <div style={{ fontWeight: 700, color: "var(--error)", marginBottom: "var(--space-1)" }}>Cannot load claim</div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>{claimDraft._error}</div>
          </div>
        </div>
        <div style={{ marginTop: "var(--space-4)" }}>
          <Button variant="outline" onClick={() => navigate("../status")}>← Back to Preauth Status</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="wizard-step">
      <div style={{ display: "flex", gap: "var(--space-2)", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px", marginBottom: "var(--space-6)", overflowX: "auto" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 20px",
              background: activeTab === tab.id ? "var(--primary)" : "transparent",
              color: activeTab === tab.id ? "white" : "var(--text-muted)",
              border: `1px solid ${activeTab === tab.id ? "var(--primary)" : "var(--border-color)"}`,
              borderRadius: "var(--radius-pill)",
              cursor: "pointer",
              fontWeight: activeTab === tab.id ? 600 : 400,
              whiteSpace: "nowrap",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Claim Draft ── */}
      {activeTab === "draft" && (
        <Card title="Claim Draft">
          {hisBlockers.length > 0 && (
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "12px 16px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)", fontSize: "13px", color: "var(--text-main)" }}>
              <AlertCircle size={16} color="var(--error)" style={{ flexShrink: 0, marginTop: "1px" }} />
              <div>
                <strong style={{ color: "var(--error)" }}>Clinical / billing data is incomplete.</strong>
                {" "}Diagnosis codes and billing items are missing. Please complete clinical and billing records in the HIS before submitting this claim.
                <div style={{ marginTop: "6px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {hisBlockers.map((f, i) => (
                    <span key={i} className="badge-modern badge-error" style={{ fontSize: "11px" }}>{f}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
          {patientContextMissing.length > 0 && (
            <div style={{ marginBottom: "var(--space-4)" }}>
              <MissingFieldsAlert fields={patientContextMissing} onResolve={() => setShowContextDrawer(true)} />
            </div>
          )}
          {!hasPreauthRef && (
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)", fontSize: "13px", color: "var(--error)", fontWeight: 600 }}>
              <AlertCircle size={14} />
              No approved preauth reference on this claim. Submit and await preauth before proceeding.
            </div>
          )}
          <div style={{ display: "flex", gap: "var(--space-6)", marginBottom: "var(--space-5)", fontSize: "13px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Admission</div>
              <div style={{ fontWeight: 600 }}>{claimDraft?.admission_date || "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Discharge</div>
              <div style={{ fontWeight: 600 }}>{claimDraft?.discharge_date || "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Preauth Ref</div>
              <div style={{ fontWeight: 600, color: hasPreauthRef ? "var(--primary)" : "var(--error)" }}>
                {claimDraft?.preauth_ref || "Missing"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Total</div>
              <div style={{ fontWeight: 700, color: "var(--primary)" }}>{formatMoney(claimDraft?.total_amount)}</div>
            </div>
          </div>
          {/* Clinical justification chips (read-only, auto-attached) */}
          {[
            ["Chief Complaints", claimDraft?.chief_complaints],
            ["Clinical Findings", claimDraft?.clinical_findings],
            ["Medications", claimDraft?.medications],
            ["Investigations", claimDraft?.investigations],
          ].map(([label, codes]) => codes?.length > 0 && (
            <div key={label} style={{ marginBottom: "var(--space-4)" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, marginBottom: "var(--space-2)", textTransform: "uppercase" }}>{label}</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {codes.map((c, i) => (
                  <span key={i} className="badge-modern badge-info" style={{ fontSize: "11px" }}>{c.name || c.code}</span>
                ))}
              </div>
            </div>
          ))}

          <div className="table-responsive-wrapper" style={{ marginBottom: "var(--space-5)" }}>
            <table className="table-modern" style={{ fontSize: "13px" }}>
              <thead>
                <tr>
                  <th>Final Bill Items</th>
                  <th>Qty</th>
                  <th style={{ textAlign: "right" }}>Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {claimDraft?.items?.map((item, i) => (
                  <tr key={i}>
                    <td>{item.service_name}</td>
                    <td>{item.quantity}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(item.net_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Discharge Summary — only present once the patient has been discharged */}
          {claimDraft?.discharge_summary && (
            <div style={{ marginBottom: "var(--space-5)" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, marginBottom: "var(--space-2)", textTransform: "uppercase" }}>Discharge Summary</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "13px" }}>
                {claimDraft.discharge_summary.condition && (
                  <div><span style={{ color: "var(--text-muted)" }}>Condition: </span><strong>{claimDraft.discharge_summary.condition}</strong></div>
                )}
                {claimDraft.discharge_summary.advice && (
                  <div><span style={{ color: "var(--text-muted)" }}>Advice: </span>{claimDraft.discharge_summary.advice}</div>
                )}
                {claimDraft.discharge_summary.followup_on && (
                  <div><span style={{ color: "var(--text-muted)" }}>Follow-up: </span>{claimDraft.discharge_summary.followup_on}</div>
                )}
                {claimDraft.discharge_summary.summary_html && (
                  <div style={{ whiteSpace: "pre-wrap" }}>{claimDraft.discharge_summary.summary_html.replace(/<[^>]*>/g, "")}</div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="primary" disabled={!hasPreauthRef || hasMissingFields} onClick={() => setActiveTab("discharge")}>
              Proceed to Discharge Docs <ArrowRight size={16} style={{ marginLeft: "8px" }} />
            </Button>
          </div>
        </Card>
      )}

      {/* ── Discharge Claim ── */}
      {activeTab === "discharge" && (
        <Card title="Discharge Documents">
          <DocumentChecklist documents={claimDraft?.supporting_documents} onUpload={handleUpload} />

          {/* Discharge polling / status */}
          {dischargePolling && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "12px 14px", background: "var(--bg-main)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", marginBottom: "var(--space-4)" }}>
              <div className="spinner" style={{ width: "20px", height: "20px" }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px" }}>Discharge claim submitted - awaiting payer decision</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{dischargeCorrelationId} · polling every {POLL_INTERVAL_MS / 1000}s</div>
              </div>
            </div>
          )}
          {dischargeStatus?.decision === "REJECTED" ? (
            <div style={{ padding: "12px 14px", background: "rgba(225,29,72,0.06)", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-4)" }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--error)", marginBottom: "6px" }}>
                Discharge claim rejected
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-main)", marginBottom: "10px" }}>
                No final claim has been submitted yet, so there's nothing to appeal — correct and
                resend the discharge intimation instead.
              </div>
              <Button variant="outline" onClick={() => setShowDischargeResubmitDrawer(true)}>
                Resubmit Discharge Claim
              </Button>
            </div>
          ) : dischargeStatus?.status === "complete" && (
            <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.06)", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", fontSize: "12px", marginBottom: "var(--space-4)" }}>
              Discharge claim adjudicated - decision: <strong>{dischargeStatus.decision || "complete"}</strong>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-6)" }}>
            <Button variant="text" onClick={() => setActiveTab("draft")}>Back</Button>
            <div style={{ display: "flex", gap: "var(--space-3)" }}>
              <Button
                variant="primary"
                disabled={!canSubmit || !!dischargeCorrelationId}
                onClick={handleSubmitDischarge}
              >
                {submitting ? "Submitting…" : dischargeCorrelationId ? "Discharge Submitted ✓" : "Submit Discharge Claim"}
              </Button>
              {(dischargeStatus?.status === "complete" || dischargeCorrelationId) && dischargeStatus?.decision !== "REJECTED" && (
                <Button variant="primary" onClick={() => setActiveTab("final")}>
                  Proceed to Final Claim <ArrowRight size={16} style={{ marginLeft: "8px" }} />
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Final Claim ── */}
      {activeTab === "final" && (
        <Card title="Final Claim">
          <div style={{ display: "flex", gap: "var(--space-6)", marginBottom: "var(--space-5)", fontSize: "13px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Discharge</div>
              <div style={{ fontWeight: 600 }}>{claimDraft?.discharge_date || "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Preauth Ref</div>
              <div style={{ fontWeight: 600 }}>{claimDraft?.preauth_ref || "-"}</div>
            </div>
          </div>
          <div className="table-responsive-wrapper" style={{ marginBottom: "var(--space-6)" }}>
            <table className="table-modern" style={{ fontSize: "13px" }}>
              <thead>
                <tr>
                  <th>Final Bill Items</th>
                  <th>Qty</th>
                  <th style={{ textAlign: "right" }}>Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {claimDraft?.items?.map((item, i) => (
                  <tr key={i}>
                    <td>{item.service_name}</td>
                    <td>{item.quantity}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(item.net_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: "center", marginBottom: "var(--space-4)", padding: "var(--space-5)", background: "var(--bg-main)", borderRadius: "var(--radius-md)", border: `1px solid ${overCeiling ? "var(--warning)" : "var(--border-color)"}` }}>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: "var(--space-2)" }}>Final Claim Total</div>
            <div style={{ fontSize: "32px", fontWeight: 800, color: overCeiling ? "var(--warning)" : "var(--primary)" }}>{formatMoney(claimDraft?.total_amount)}</div>
            {authorizedCeiling != null && (
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>
                Authorized ceiling{moneyLedger?.authorized_ceiling?.cumulative ? " (cumulative)" : ""}: <strong>₹{authorizedCeiling.toLocaleString()}</strong>
              </div>
            )}
          </div>

          {/* J2 — over-ceiling guard: warn + require acknowledgement before submit */}
          {overCeiling && (
            <div style={{ padding: "14px 16px", background: "rgba(245,158,11,0.08)", border: "1px solid var(--warning)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-5)" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: "1px" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "var(--warning)", marginBottom: "var(--space-1)" }}>
                    Bill exceeds the authorized ceiling by ₹{ceilingExcess.toLocaleString()}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-main)" }}>
                    The final bill of ₹{billedTotal?.toLocaleString()} is above the sanctioned ₹{authorizedCeiling?.toLocaleString()}.
                    The payer will not cover the excess — it is recovered from the patient, or file an enhancement to raise the ceiling first.
                  </div>
                  <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
                    <Button variant="outline" size="small" onClick={() => navigate("../enhancement")}>
                      File Enhancement
                    </Button>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                      <input type="checkbox" checked={ackOverCeiling} onChange={(e) => setAckOverCeiling(e.target.checked)} />
                      I acknowledge the ₹{ceilingExcess.toLocaleString()} excess and will collect it from the patient.
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center" }}>
            <Button
              variant="primary"
              size="large"
              icon={Send}
              disabled={!canSubmitFinal || submitting}
              onClick={handleSubmitFinal}
            >
              {submitting ? "Submitting…" : "Submit Final Claim"}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Claim Decision ── */}
      {activeTab === "decision" && (
        <div>
          {(!claimStatus || polling) ? (
            <Card className="mb-6">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <div className="spinner" style={{ width: "24px", height: "24px" }} />
                <div>
                  <div style={{ fontWeight: 700 }}>Claim Adjudication in Progress</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {finalCorrelationId} · polling every {POLL_INTERVAL_MS / 1000}s
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <>
              <DecisionBanner decision={claimDecision} outcome={claimStatus?.outcome} approvedAmount={claimStatus?.approved_amount} provenance={claimProvenance} />

              {/* Claim reference + payment status strip */}
              {(claimStatus?.claim_response_ref || claimStatus?.payment_status) && (
                <div style={{ display: "flex", gap: "var(--space-4)", marginBottom: "var(--space-4)", padding: "10px 16px", background: "var(--bg-main)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", fontSize: "13px", flexWrap: "wrap" }}>
                  {claimStatus.claim_response_ref && (
                    <div>
                      <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Payer Ref: </span>
                      <code style={{ fontSize: "12px" }}>{claimStatus.claim_response_ref}</code>
                    </div>
                  )}
                  {claimStatus.payment_status && (
                    <div>
                      <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Payment: </span>
                      <span className="badge-modern badge-info" style={{ fontSize: "11px" }}>{claimStatus.payment_status}</span>
                    </div>
                  )}
                </div>
              )}

              <Card title="Adjudication Summary" className="mb-6">
                <AmountGrid totals={claimStatus?.totals} />

                {/* Payer notes */}
                {claimStatus?.process_notes?.length > 0 && (
                  <div style={{ marginTop: "var(--space-4)" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "var(--space-2)" }}>Payer Notes</div>
                    {claimStatus.process_notes.map((note, i) => (
                      <div key={i} style={{ fontSize: "13px", padding: "8px 12px", background: "rgba(245,158,11,0.06)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--warning)", marginBottom: "6px" }}>
                        {note.text}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Button variant="outline" onClick={() => navigate("/")}>Save & Close</Button>
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                  {isClaimQueried && (
                    <>
                      <Button variant="outline" onClick={() => setShowQueryDrawer(true)}>Respond to Query</Button>
                      <Button variant="outline" onClick={() => setShowResubmitDrawer(true)}>Resubmit Claim</Button>
                    </>
                  )}
                  {isClaimRejected && (
                    <>
                      <Button variant="outline" onClick={() => setShowResubmitDrawer(true)}>Resubmit Claim</Button>
                      <Button variant="outline" onClick={() => navigate("../reprocess")}>Appeal / Reprocess</Button>
                    </>
                  )}
                  {isPartialApproval && (
                    <>
                      <Button variant="outline" onClick={() => setShowResubmitDrawer(true)}>Resubmit Claim</Button>
                      <Button variant="outline" onClick={() => navigate("../reprocess")}>Appeal / Reprocess</Button>
                    </>
                  )}
                  {(isClaimApproved || isPartialApproval) && (
                    <Button variant="primary" onClick={() => navigate("../payment")}>
                      View Payment Status <ArrowRight size={18} style={{ marginLeft: "8px" }} />
                    </Button>
                  )}
                  {(isClaimQueried || isClaimRejected || isPartialApproval) && OUTBOUND_COMMUNICATIONS_ENABLED && (
                    <Button variant="outline" icon={Send} onClick={() => setShowSendModal(true)}>
                      Message Payer
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Query Drawer ── */}
      <Drawer open={showQueryDrawer} onClose={() => setShowQueryDrawer(false)} title="Respond to Claim Query">
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "var(--space-5)" }}>
          Provide a clarification and attach any documents the payer requested.
        </p>
        <div style={{ marginBottom: "var(--space-4)" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Clarification</label>
          <textarea
            className="input-modern"
            style={{ height: "100px", resize: "vertical" }}
            placeholder="Describe your response to the payer's query…"
            value={queryAnswer}
            onChange={(e) => setQueryAnswer(e.target.value)}
          />
        </div>
        <Button variant="primary" className="w-full" disabled={!queryAnswer || submitting} onClick={handleQuerySubmit} style={{ justifyContent: "center" }}>
          {submitting ? "Submitting…" : "Submit Response"}
        </Button>
      </Drawer>

      {/* ── Resubmit Drawer (editable items) ── */}
      <Drawer open={showResubmitDrawer} onClose={() => setShowResubmitDrawer(false)} title="Resubmit Claim">
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "var(--space-5)" }}>
          Correct clinical or billing data. Only the fields you change are sent; everything else is re-derived from the hospital DB.
        </p>
        {resubmitEditItems?.length > 0 && (
          <div style={{ marginBottom: "var(--space-5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Line Items</div>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "11px", color: "var(--primary)" }}><Edit2 size={11} /> Editable</span>
            </div>
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
                  {resubmitEditItems.map((item, i) => (
                    <tr key={i}>
                      <td>{item.service_name}</td>
                      <td>
                        <input
                          className="input-modern"
                          style={{ width: "60px", fontSize: "12px", padding: "4px 6px" }}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateResubmitItem(i, "quantity", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="input-modern"
                          style={{ width: "90px", fontSize: "12px", padding: "4px 6px" }}
                          type="number"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => updateResubmitItem(i, "unit_price", e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(item.net_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" style={{ textAlign: "right", fontWeight: 700 }}>Total</td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: "var(--primary)" }}>
                      ₹{resubmitEditItems.reduce((s, it) => s + (Number(it.net_amount) || 0), 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
        <Button variant="primary" className="w-full" disabled={submitting} onClick={handleResubmitClaim} style={{ justifyContent: "center" }}>
          {submitting ? "Resubmitting…" : "Resubmit Claim"}
        </Button>
      </Drawer>

      {/* ── Discharge Resubmit Drawer (DC01 correction — editable items) ── */}
      <Drawer open={showDischargeResubmitDrawer} onClose={() => setShowDischargeResubmitDrawer(false)} title="Resubmit Discharge Claim">
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "var(--space-5)" }}>
          Correct clinical or billing data on the discharge intimation. Only the fields you change
          are sent; everything else is re-derived from the hospital DB. This resends under NHCX
          workflow DC01 (Discharge Correction Intimation) — it does not touch the final claim.
        </p>
        {resubmitEditItems?.length > 0 && (
          <div style={{ marginBottom: "var(--space-5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Line Items</div>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "11px", color: "var(--primary)" }}><Edit2 size={11} /> Editable</span>
            </div>
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
                  {resubmitEditItems.map((item, i) => (
                    <tr key={i}>
                      <td>{item.service_name}</td>
                      <td>
                        <input
                          className="input-modern"
                          style={{ width: "60px", fontSize: "12px", padding: "4px 6px" }}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateResubmitItem(i, "quantity", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="input-modern"
                          style={{ width: "90px", fontSize: "12px", padding: "4px 6px" }}
                          type="number"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => updateResubmitItem(i, "unit_price", e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(item.net_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" style={{ textAlign: "right", fontWeight: 700 }}>Total</td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: "var(--primary)" }}>
                      ₹{resubmitEditItems.reduce((s, it) => s + (Number(it.net_amount) || 0), 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
        <Button variant="primary" className="w-full" disabled={submitting} onClick={handleResubmitDischargeClaim} style={{ justifyContent: "center" }}>
          {submitting ? "Resubmitting…" : "Resubmit Discharge Claim"}
        </Button>
      </Drawer>

      {/* ── Patient Context Drawer ── */}
      <Drawer open={showContextDrawer} onClose={() => setShowContextDrawer(false)} title="Supply Missing Patient Attributes">
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "var(--space-5)" }}>
          These attributes are required by NHCX but could not be resolved from the hospital DB. They are saved to the cashless case and do not need to be re-sent on submission.
        </p>
        <PatientContextForm
          claimId={claimDraft?.claim_id || claimId}
          onResolved={(remaining) => {
            setMissingFields(remaining);
            if (remaining.length === 0) {
              setShowContextDrawer(false);
              loadDraft(claimDraft?.claim_id || claimId);
            }
          }}
        />
      </Drawer>

      <SendCommunicationModal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        defaultPayerId={payerId}
        defaultClaimReference={claimStatus?.claim_response_ref || ""}
        claimId={claimId}
        cashlessCaseId={caseState.cashless_case_id}
      />
    </div>
  );
}
