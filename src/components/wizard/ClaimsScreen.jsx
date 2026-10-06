import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Send, ArrowRight, AlertCircle, CheckCircle2, ChevronDown, Edit2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../api";
import { usePoll } from "../../hooks/usePoll";
import { Button, DocumentChecklist, LoadingBlock, formatMoney } from "../Common";
import { formatDate, formatDateTime } from "../../format.js";
import { Section, Fields } from "../case/CaseFile";
import { Drawer } from "../Overlay";
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
  const [dischargeSubmitError, setDischargeSubmitError] = useState(null);

  // Final claim flow
  const [finalCorrelationId, setFinalCorrelationId] = useState(caseState.claimCorrelationId || null);
  const [claimStatus, setClaimStatus] = useState(null);
  const [polling, setPolling] = useState(false);
  const [submitError, setSubmitError] = useState(null);

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

  const draftParams = (id) => {
    if (id) return { claim_id: id };
    if (resolvedCashlessCaseId) return { cashless_case_id: resolvedCashlessCaseId };
    return resolvedClaimId ? { claim_id: resolvedClaimId } : {};
  };

  const loadDraft = async (id, params) => {
    setLoading(true);
    try {
      const res = await api.prepareClaimDraft(params || draftParams(id));
      setClaimDraft(res);
      setMissingFields(res.missing_fields ?? []);
      if (res.claim_id && !resolvedClaimId) {
        updateCaseState({ claim_id: res.claim_id });
      }
      if (res.cashless_case_id && !resolvedCashlessCaseId) {
        updateCaseState({ cashless_case_id: res.cashless_case_id });
      }
    } catch (e) {
      setClaimDraft({ _error: e?.message || "Could not load the claim draft." });
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

    loadDraft(null, draftParams(null));
  }, []);

  useEffect(() => {
    if (finalCorrelationId) return;
    if (!resolvedCashlessCaseId) return;
    const recover = async () => {
      try {
        const res = await api.getCashlessStatus(resolvedCashlessCaseId);
        if (res.claim?.correlation_id) {
          setFinalCorrelationId(res.claim.correlation_id);
          updateCaseState({ claimCorrelationId: res.claim.correlation_id });
          setActiveTab("decision");
          setPolling(true);
        }
      } catch (_) {}
    };
    recover();
  }, []);

  // Discharge claim polling
  const pollDischarge = async (signal) => {
    try {
      const res = await api.getClaimStatus(dischargeCorrelationId, signal);
      setDischargeStatus(res);
      // REJECTED is terminal for the interim discharge submission too — the
      // claim itself reverts to draft, but there is nothing left to poll for
      // until the hospital corrects and resubmits via DC01.
      if (res.status === "complete" || res.status === "not_found" || res.status === "failed" || res.decision === "REJECTED") {
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
      if (res.status === "complete" || res.status === "not_found" || res.status === "failed") {
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

  const handleUpload = (doc, uploaded) => {
    setClaimDraft((prev) => ({
      ...prev,
      supporting_documents: prev.supporting_documents.map((d) =>
        d.code === doc.code ? { ...d, ...uploaded } : d
      ),
    }));
  };

  // Lets the hospital attach a document that isn't on the backend's
  // pre-populated required/optional checklist (e.g. a payer-specific extra).
  const addDocument = () => {
    setClaimDraft((prev) => ({
      ...prev,
      supporting_documents: [
        ...(prev.supporting_documents || []),
        { code: `CUSTOM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "", category: "additional", optional: true, custom: true },
      ],
    }));
  };
  const renameDocument = (idx, name) => {
    setClaimDraft((prev) => ({
      ...prev,
      supporting_documents: prev.supporting_documents.map((d, i) => (i === idx ? { ...d, name } : d)),
    }));
  };
  const removeDocument = (idx) => {
    setClaimDraft((prev) => ({
      ...prev,
      supporting_documents: prev.supporting_documents.filter((_, i) => i !== idx),
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
    setDischargeSubmitError(null);
    try {
      const attachedDocs = claimDraft?.supporting_documents?.filter((d) => d.url) ?? [];
      const res = await api.submitDischargeClaim({
        claim_id: claimDraft.claim_id,
        ...(attachedDocs.length > 0 && { supporting_documents: attachedDocs }),
      });
      if (res.status === "failed") {
        setDischargeSubmitError(res.message || res.error?.message || "Discharge claim submission failed. Please try again.");
        return;
      }
      setDischargeCorrelationId(res.correlation_id);
      updateCaseState({ dischargeCorrelationId: res.correlation_id });
      setDischargePolling(true);
    } catch (err) {
      setDischargeSubmitError(err.message || "Discharge claim submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitFinal = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.submitFinalClaim({ claim_id: claimDraft.claim_id });
      if (res.status === "failed") {
        setSubmitError(res.message || res.error?.message || "Final claim submission failed. Please try again.");
        return;
      }
      setFinalCorrelationId(res.correlation_id);
      updateCaseState({ claimCorrelationId: res.correlation_id });
      setActiveTab("decision");
      setPolling(true);
    } catch (err) {
      setSubmitError(err.message || "Final claim submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuerySubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
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
      if (res.status === "failed") {
        setSubmitError(res.message || res.error?.message || "Query response submission failed. Please try again.");
        return;
      }
      setShowQueryDrawer(false);
      setFinalCorrelationId(res.correlation_id);
      updateCaseState({ claimCorrelationId: res.correlation_id });
      setActiveTab("decision");
      setPolling(true);
    } catch (err) {
      setSubmitError(err.message || "Query response submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmitClaim = async () => {
    setSubmitting(true);
    setSubmitError(null);
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
      if (res.status === "failed") {
        setSubmitError(res.message || res.error?.message || "Claim resubmission failed. Please try again.");
        return;
      }
      setShowResubmitDrawer(false);
      setFinalCorrelationId(res.correlation_id);
      updateCaseState({ claimCorrelationId: res.correlation_id });
      setActiveTab("decision");
      setPolling(true);
    } catch (err) {
      setSubmitError(err.message || "Claim resubmission failed. Please try again.");
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
    setDischargeSubmitError(null);
    try {
      const body = {
        ...(resolvedClaimId ? { claim_id: resolvedClaimId } : {}),
      };
      if (resubmitEditItems?.length > 0) {
        body.items = resubmitEditItems;
      }
      const attachedDocs = claimDraft?.supporting_documents?.filter((d) => d.url) ?? [];
      if (attachedDocs.length > 0) body.supporting_documents = attachedDocs;
      const res = await api.resubmitDischargeClaim(body);
      if (res.status === "failed") {
        setDischargeSubmitError(res.message || res.error?.message || "Discharge claim resubmission failed. Please try again.");
        return;
      }
      setShowDischargeResubmitDrawer(false);
      setDischargeCorrelationId(res.correlation_id);
      updateCaseState({ dischargeCorrelationId: res.correlation_id });
      setDischargeStatus(null);
      setDischargePolling(true);
    } catch (err) {
      setDischargeSubmitError(err.message || "Discharge claim resubmission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
      <div className="wizard-step pd-screen">
        <Section id="cl-error" title="Cannot load the claim">
          <p className="ds-empty">{claimDraft._error}</p>
          <div className="ds-empty-actions">
            <Button variant="outline" size="small" onClick={() => navigate("../status")}>
              Back to preauth decision
            </Button>
          </div>
        </Section>
      </div>
    );
  }

  const docs = claimDraft?.supporting_documents || [];
  const attachedDocs = docs.filter((d) => d.url).length;
  const dischargeRejected = dischargeStatus?.decision === "REJECTED";
  const dischargeFailed = dischargeStatus?.status === "failed";
  const dischargeDone = !!dischargeCorrelationId && !dischargeRejected && !dischargeFailed;
  const claimDecided = claimStatus?.status === "complete" && !!claimDecision;
  const claimTotals = claimStatus?.totals || {};
  const claimApproved = claimStatus?.approved_amount ?? claimTotals.benefit?.value ?? claimTotals.approved?.value ?? null;
  const claimRequested = claimTotals.submitted?.value ?? claimDraft?.total_amount ?? null;
  const justification = [
    ["Chief complaints", claimDraft?.chief_complaints],
    ["Clinical findings", claimDraft?.clinical_findings],
    ["Investigations", claimDraft?.investigations],
    ["Medications", claimDraft?.medications],
  ].filter(([, codes]) => codes?.length > 0);

  // The four parts of the claim, each with where it stands.
  const steps = [
    { id: "draft", label: "Review claim", done: hasPreauthRef && !hasMissingFields },
    { id: "discharge", label: "Discharge documents", done: dischargeDone, bad: dischargeRejected || dischargeFailed },
    { id: "final", label: "Final claim", done: !!finalCorrelationId },
    { id: "decision", label: "Decision", done: claimDecided, bad: claimStatus?.status === "failed" || isClaimRejected },
  ];

  const readiness = [
    { label: "Approved preauth", ok: hasPreauthRef, note: claimDraft?.preauth_ref || "missing" },
    { label: "Patient details", ok: patientContextMissing.length === 0, note: patientContextMissing.length ? `${patientContextMissing.length} missing` : null },
    { label: "Clinical & billing records", ok: hisBlockers.length === 0 },
    { label: "Discharge documents", ok: !hasMissingDocs, note: docs.length ? `${attachedDocs} of ${docs.length}` : null },
    { label: "Discharge claim sent", ok: dischargeDone, bad: dischargeRejected || dischargeFailed, note: dischargeRejected ? "rejected" : dischargeFailed ? "failed" : dischargePolling ? "awaiting payer" : null },
    { label: "Final claim sent", ok: !!finalCorrelationId },
  ];

  // One primary action for the part being viewed.
  let primary = null;
  if (activeTab === "draft") {
    primary = { label: "Continue to discharge documents", onClick: () => setActiveTab("discharge"), disabled: !hasPreauthRef || hasMissingFields, icon: ArrowRight };
  } else if (activeTab === "discharge") {
    primary = dischargeRejected
      ? { label: "Resubmit discharge claim", onClick: () => setShowDischargeResubmitDrawer(true) }
      : dischargeCorrelationId
        ? { label: "Continue to final claim", onClick: () => setActiveTab("final"), disabled: dischargeFailed, icon: ArrowRight }
        : { label: submitting ? "Submitting…" : "Submit discharge claim", onClick: handleSubmitDischarge, disabled: !canSubmit, icon: Send };
  } else if (activeTab === "final") {
    primary = finalCorrelationId
      ? { label: "View decision", onClick: () => setActiveTab("decision"), icon: ArrowRight }
      : { label: submitting ? "Submitting…" : "Submit final claim", onClick: handleSubmitFinal, disabled: !canSubmitFinal || submitting, icon: Send };
  } else if (claimDecided) {
    primary = isClaimApproved || isPartialApproval
      ? { label: "View payment status", onClick: () => navigate("../payment"), icon: ArrowRight }
      : isClaimQueried
        ? { label: "Respond to query", onClick: () => setShowQueryDrawer(true) }
        : isClaimRejected
          ? { label: "Resubmit claim", onClick: () => setShowResubmitDrawer(true) }
          : null;
  }

  const secondary = [];
  if (activeTab === "final" && overCeiling) secondary.push({ label: "File an enhancement", onClick: () => navigate("../enhancement") });
  if (activeTab === "decision" && claimDecided) {
    if (isClaimQueried || isPartialApproval) secondary.push({ label: "Resubmit claim", onClick: () => setShowResubmitDrawer(true) });
    if (isClaimRejected || isPartialApproval) secondary.push({ label: "Appeal / reprocess", onClick: () => navigate("../reprocess") });
    if ((isClaimQueried || isClaimRejected || isPartialApproval) && OUTBOUND_COMMUNICATIONS_ENABLED)
      secondary.push({ label: "Message payer", icon: Send, onClick: () => setShowSendModal(true) });
  }

  const billTable = (
    <div className="ep-table-wrap">
      <table className="ep-table ds-lines-table">
        <thead>
          <tr>
            <th>Service</th>
            <th className="ep-num">Qty</th>
            <th className="ep-num">Unit price</th>
            <th className="ep-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(claimDraft?.items || []).map((item, i) => (
            <tr key={i}>
              <td className="ep-col-name">
                <div className="ep-strong">{item.service_name}</div>
                <div className="ep-muted">{[item.service_code, item.category].filter(Boolean).join(" · ")}</div>
              </td>
              <td className="ep-num ep-mono">{item.quantity}</td>
              <td className="ep-num ep-mono">{formatMoney(item.unit_price)}</td>
              <td className="ep-num ep-mono">{formatMoney(item.net_amount)}</td>
            </tr>
          ))}
          {!claimDraft?.items?.length && (
            <tr>
              <td colSpan={4} className="ep-muted">No billable items on the final bill.</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="pd-total-row">
            <td colSpan={3}>Final bill</td>
            <td className="ep-num ep-mono">{formatMoney(claimDraft?.total_amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const waitingSection = (title, correlationId) => (
    <Section id="cl-waiting" title={title}>
      <Fields
        cols={2}
        rows={[
          { label: "Status", value: "Waiting for the payer's decision" },
          { label: "Checking every", value: `${POLL_INTERVAL_MS / 1000} seconds` },
          { label: "Request ID", value: correlationId, mono: true },
        ]}
      />
    </Section>
  );

  return (
    <div className="wizard-step pd-screen">
      <nav className="cl-steps" aria-label="Claim steps">
        {steps.map((st, i) => (
          <button
            key={st.id}
            type="button"
            className={`cl-step${activeTab === st.id ? " is-on" : ""}${st.done ? " is-done" : ""}${st.bad ? " is-bad" : ""}`}
            aria-current={activeTab === st.id ? "step" : undefined}
            onClick={() => setActiveTab(st.id)}
          >
            <span className="cl-step-num" aria-hidden="true">
              {st.done ? <CheckCircle2 size={14} /> : i + 1}
            </span>
            {st.label}
          </button>
        ))}
      </nav>

      <div className="pd-layout">
        <div className="pd-main">
          {activeTab === "draft" && (
            <>
              {hisBlockers.length > 0 && (
                <div className="ep-notice is-bad">
                  <strong>Clinical or billing records are incomplete</strong> ({hisBlockers.join(", ")}). Complete them in
                  the HIS before submitting this claim.
                </div>
              )}
              {patientContextMissing.length > 0 && (
                <div className="ep-notice is-bad">
                  {patientContextMissing.length} patient detail{patientContextMissing.length === 1 ? " is" : "s are"} missing
                  ({patientContextMissing.join(", ")}).
                  <button type="button" className="pd-inline-link" onClick={() => setShowContextDrawer(true)}>
                    Add them →
                  </button>
                </div>
              )}
              {!hasPreauthRef && (
                <div className="ep-notice is-bad">
                  This claim has no approved preauth reference. Submit the preauth and wait for its approval first.
                </div>
              )}
              <Section id="cl-stay" title="Stay">
                <Fields
                  cols={3}
                  rows={[
                    { label: "Admission", value: claimDraft?.admission_date ? formatDate(claimDraft.admission_date) : null },
                    { label: "Discharge", value: claimDraft?.discharge_date ? formatDate(claimDraft.discharge_date) : "Not discharged" },
                    { label: "Preauth reference", value: claimDraft?.preauth_ref || "Missing", mono: !!claimDraft?.preauth_ref, tone: claimDraft?.preauth_ref ? undefined : "bad" },
                  ]}
                />
              </Section>
              <Section id="cl-bill" title="Final bill">
                {billTable}
              </Section>
              <Section id="cl-justification" title="Clinical justification" meta="Coded from the clinical notes; sent with the claim">
                {justification.length ? (
                  <Fields cols={1} rows={justification.map(([label, codes]) => ({ label, value: codes.map((c) => c.name || c.code).join(", ") }))} />
                ) : (
                  <div className="ep-muted ep-pad">No coded complaints, findings, investigations or medications on the clinical note.</div>
                )}
              </Section>
              {claimDraft?.discharge_summary && (
                <Section id="cl-discharge-summary" title="Discharge summary">
                  <Fields
                    cols={1}
                    rows={[
                      { label: "Condition", value: claimDraft.discharge_summary.condition },
                      { label: "Advice", value: claimDraft.discharge_summary.advice },
                      { label: "Follow-up", value: claimDraft.discharge_summary.followup_on ? formatDate(claimDraft.discharge_summary.followup_on) : null },
                      { label: "Summary", value: claimDraft.discharge_summary.summary_html?.replace(/<[^>]*>/g, "") },
                    ]}
                  />
                </Section>
              )}
            </>
          )}

          {activeTab === "discharge" && (
            <>
              {dischargeFailed && (
                <div className="ep-notice is-bad">
                  <strong>The discharge claim could not be delivered.</strong>{" "}
                  {dischargeStatus.error_message || "The request did not reach the payer."}
                </div>
              )}
              {dischargeRejected && (
                <div className="ep-notice is-bad">
                  <strong>The payer rejected the discharge claim.</strong> No final claim exists yet, so there is nothing to
                  appeal; correct and resend the discharge intimation instead.
                </div>
              )}
              <Section
                id="cl-docs"
                title="Discharge documents"
                meta={docs.length ? `${attachedDocs} of ${docs.length} attached` : null}
              >
                <div className="pd-docs">
                  <DocumentChecklist
                    documents={claimDraft?.supporting_documents}
                    onUpload={handleUpload}
                    onAddDocument={addDocument}
                    onRenameDocument={renameDocument}
                    onRemoveDocument={removeDocument}
                    hideSummary
                  />
                </div>
              </Section>
              {dischargePolling && waitingSection("Discharge claim sent", dischargeCorrelationId)}
              {dischargeStatus?.status === "complete" && !dischargeRejected && (
                <Section id="cl-discharge-result" title="Discharge claim">
                  <Fields
                    cols={2}
                    rows={[
                      { label: "Decision", value: dischargeStatus.decision ? String(dischargeStatus.decision).replace(/_/g, " ").toLowerCase() : "Received" },
                      { label: "Request ID", value: dischargeCorrelationId, mono: true },
                    ]}
                  />
                </Section>
              )}
            </>
          )}

          {activeTab === "final" && (
            <>
              <Section id="cl-final-bill" title="Final bill">
                {billTable}
              </Section>
              <Section id="cl-ceiling" title="Against the authorized amount">
                <dl className="ds-statement">
                  <div>
                    <dt>Final bill</dt>
                    <dd className="ep-mono">{formatMoney(billedTotal)}</dd>
                  </div>
                  {authorizedCeiling != null && (
                    <div>
                      <dt>
                        Authorized ceiling
                        {moneyLedger?.authorized_ceiling?.cumulative && <span className="ep-muted"> · preauth + enhancements</span>}
                      </dt>
                      <dd className="ep-mono">{formatMoney(authorizedCeiling)}</dd>
                    </div>
                  )}
                  {authorizedCeiling != null && (
                    <div className="is-total">
                      <dt className={overCeiling ? "is-bad" : undefined}>{overCeiling ? "Above the ceiling" : "Within the ceiling"}</dt>
                      <dd className={`ep-mono${overCeiling ? " is-bad" : ""}`}>{overCeiling ? formatMoney(ceilingExcess) : "—"}</dd>
                    </div>
                  )}
                </dl>
                {overCeiling && (
                  <div className="cl-ack">
                    <p>
                      The payer will not cover the {formatMoney(ceilingExcess)} above the sanctioned amount. Collect it from
                      the patient, or file an enhancement to raise the ceiling first.
                    </p>
                    <label>
                      <input type="checkbox" checked={ackOverCeiling} onChange={(e) => setAckOverCeiling(e.target.checked)} />
                      I acknowledge the {formatMoney(ceilingExcess)} excess and will collect it from the patient.
                    </label>
                  </div>
                )}
              </Section>
            </>
          )}

          {activeTab === "decision" && (
            <>
              {!finalCorrelationId ? (
                <Section id="cl-no-final" title="No final claim yet">
                  <p className="ds-empty">Submit the final claim to receive the payer's decision here.</p>
                  <div className="ds-empty-actions">
                    <Button variant="outline" size="small" onClick={() => setActiveTab("final")}>
                      Go to final claim
                    </Button>
                  </div>
                </Section>
              ) : !claimStatus || polling ? (
                waitingSection("Final claim sent", finalCorrelationId)
              ) : claimStatus.status === "failed" ? (
                <div className="ep-notice is-bad">
                  <strong>The final claim could not be delivered.</strong>{" "}
                  {claimStatus.error_message || "The request did not reach the payer."}
                  <button type="button" className="pd-inline-link" onClick={() => setActiveTab("final")}>
                    Back to final claim →
                  </button>
                </div>
              ) : (
                <>
                  <Section id="cl-amounts" title="Amount breakdown">
                    <dl className="ds-statement">
                      <div>
                        <dt>Claimed</dt>
                        <dd className="ep-mono">{formatMoney(claimRequested)}</dd>
                      </div>
                      {claimTotals.eligible?.value != null && claimRequested != null && claimRequested > claimTotals.eligible.value && (
                        <div>
                          <dt>Disallowed</dt>
                          <dd className="ep-mono">− {formatMoney(claimRequested - claimTotals.eligible.value)}</dd>
                        </div>
                      )}
                      {claimTotals.copay?.value > 0 && (
                        <div>
                          <dt>Co-payment</dt>
                          <dd className="ep-mono">− {formatMoney(claimTotals.copay.value)}</dd>
                        </div>
                      )}
                      {claimTotals.deductible?.value > 0 && (
                        <div>
                          <dt>Deductible</dt>
                          <dd className="ep-mono">− {formatMoney(claimTotals.deductible.value)}</dd>
                        </div>
                      )}
                      <div className="is-total">
                        <dt>Approved</dt>
                        <dd className="ep-mono">{formatMoney(claimApproved)}</dd>
                      </div>
                    </dl>
                  </Section>
                  {claimStatus.process_notes?.length > 0 && (
                    <Section id="cl-notes" title="Payer notes">
                      <ol className="ds-notes">
                        {claimStatus.process_notes.map((n, i) => (
                          <li key={n.number ?? i}>
                            <span className="ep-mono ep-muted">{n.number ?? i + 1}</span>
                            <span>{n.text}</span>
                          </li>
                        ))}
                      </ol>
                    </Section>
                  )}
                  <Section id="cl-response" title="Payer response" meta="As received over NHCX">
                    <Fields
                      cols={3}
                      rows={[
                        { label: "Classified decision", value: claimDecision ? String(claimDecision).replace(/_/g, " ").toLowerCase() : null },
                        { label: "Raw outcome", value: claimProvenance?.raw_outcome ?? claimStatus.outcome, mono: true },
                        { label: "Reason codes", value: claimProvenance?.reason_codes?.join(", "), mono: true },
                        { label: "Payer claim reference", value: claimStatus.claim_response_ref, mono: true },
                        { label: "Payment status", value: claimStatus.payment_status ? String(claimStatus.payment_status).replace(/^PAYMENT_/, "").toLowerCase() : null },
                        { label: "Sent", value: claimStatus.submitted_at ? formatDateTime(claimStatus.submitted_at) : null },
                        { label: "Request ID", value: finalCorrelationId, mono: true },
                      ]}
                    />
                  </Section>
                </>
              )}
            </>
          )}
        </div>

        <aside className="pd-side">
          <section className="ep-section pd-request">
            <header className="ep-section-head">
              <h3 className="ep-section-title">Claim</h3>
            </header>
            {activeTab === "decision" && claimDecided ? (
              <>
                <div className={`ds-verdict is-${isClaimApproved ? "ok" : isClaimRejected ? "bad" : "warn"}`}>
                  <span className="ep-dot" aria-hidden="true" />
                  <span className="ds-verdict-label ep-cap">{String(claimDecision).replace(/_/g, " ").toLowerCase()}</span>
                </div>
                {claimApproved != null && (
                  <div className="pd-amount">
                    <div className="ep-muted">Approved</div>
                    <div className="pd-amount-value ep-mono">{formatMoney(claimApproved)}</div>
                    {claimRequested != null && <div className="ep-muted">of {formatMoney(claimRequested)} claimed</div>}
                  </div>
                )}
              </>
            ) : (
              <div className="pd-amount">
                <div className="ep-muted">Final bill</div>
                <div className="pd-amount-value ep-mono">{formatMoney(claimDraft?.total_amount)}</div>
                {authorizedCeiling != null && (
                  <div className={overCeiling ? "is-bad" : "ep-muted"}>
                    {overCeiling ? `${formatMoney(ceilingExcess)} above` : "Within"} the {formatMoney(authorizedCeiling)} authorized
                  </div>
                )}
              </div>
            )}

            <ul className="pd-ready" aria-label="Claim readiness">
              {readiness.map((r) => (
                <li key={r.label} className={r.ok ? "is-ok" : r.bad ? "is-todo" : "is-soft"}>
                  {r.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  <span>{r.label}</span>
                  {r.note && <span className="pd-ready-note">{r.note}</span>}
                </li>
              ))}
            </ul>

            <div className="pd-submit">
              {(activeTab === "final" || activeTab === "decision") && submitError && <div className="ep-notice is-bad">{submitError}</div>}
              {activeTab === "discharge" && dischargeSubmitError && <div className="ep-notice is-bad">{dischargeSubmitError}</div>}
              {primary && (
                <Button variant="primary" icon={primary.icon} disabled={primary.disabled} onClick={primary.onClick} className="pd-submit-btn">
                  {primary.label}
                </Button>
              )}
              {secondary.length > 0 && (
                <ul className="ds-actions">
                  {secondary.map((a) => (
                    <li key={a.label}>
                      <button type="button" onClick={a.onClick}>
                        {a.icon && <a.icon size={14} />}
                        {a.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>

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
        {submitError && (
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-4)", fontSize: "12px", color: "var(--error)", fontWeight: 600 }}>
            {submitError}
          </div>
        )}
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
                      {formatMoney(resubmitEditItems.reduce((s, it) => s + (Number(it.net_amount) || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
        {submitError && (
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-4)", fontSize: "12px", color: "var(--error)", fontWeight: 600 }}>
            {submitError}
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
                      {formatMoney(resubmitEditItems.reduce((s, it) => s + (Number(it.net_amount) || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
        {dischargeSubmitError && (
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-4)", fontSize: "12px", color: "var(--error)", fontWeight: 600 }}>
            {dischargeSubmitError}
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
