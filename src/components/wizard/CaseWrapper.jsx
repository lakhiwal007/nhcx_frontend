import { useState, useEffect, useCallback } from "react";
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { History } from "lucide-react";
import { api } from "../../api";
import { Button, EmptyState, LoadingBlock } from "../Common";
import { saveWorkflow, loadWorkflow } from "../../workflowStorage";
import CaseFileHeader from "../case/CaseFileHeader";
import CaseStepper from "../case/CaseStepper";
import CaseCommsBar from "../case/CaseCommsBar";
import CommunicationDetailDrawer from "../CommunicationDetail";
import { buildStages, projectCaseStatus } from "../case/caseStages";
import "../case/case-workspace.css";

import PayerPolicy from "./PayerPolicy";
import EligibilityPrep from "./EligibilityPrep";
import PreauthDraft from "./PreauthDraft";
import PreauthStatus from "./PreauthStatus";
import PreauthEnhancement from "./PreauthEnhancement";
import ClaimsScreen from "./ClaimsScreen";
import ReprocessScreen from "./ReprocessScreen";
import PaymentReconciliation from "./PaymentReconciliation";
import CaseTimeline from "./CaseTimeline";

const COMMS_POLL_MS = 60_000;

export default function CaseWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const currentStepPath = location.pathname.split("/").pop();

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  // Resume: load by cashless_case_id passed in nav state; new case: skip stale child_id save
  const childSaved = loadWorkflow(id);
  const resumeCaseId = location.state?.cashless_case_id ?? (location.state?.newCase ? null : childSaved?.cashless_case_id) ?? null;
  const saved = location.state?.newCase
    ? null
    : resumeCaseId
      ? loadWorkflow(resumeCaseId) || childSaved
      : childSaved;

  const isNewCase = !!location.state?.newCase || (!!saved && !saved.cashless_case_id);
  const navAdmissionId = location.state?.admission_id ?? saved?.admission_id ?? null;

  const [caseState, setCaseState] = useState({
    payer: null,
    policy: null,
    admission_id: location.state?.admission_id || null,
    estimatedBillAmount: location.state?.estimatedBillAmount || null,
    cashless_case_id: resumeCaseId || null,
    claim_id: location.state?.claim_id || null,
    eligibility_correlation_id: null,
    preauthCorrelationId: null,
    preauthRef: null,
    preauthDecision: null,
    approvedAmount: null,
    claimCorrelationId: null,
    dischargeCorrelationId: null,
    draftData: null,
    ...saved,
  });

  const [cashlessCase, setCashlessCase] = useState(null);

  // The rolled-up money ledger + decision provenance for this case (GET
  // /timeline). Fetched once here and shared with the header money strip
  // (billed→authorized→approved→collect) and the decision banners (raw payer
  // signal / classified_by), so each screen doesn't hit /timeline on its own.
  const [timeline, setTimeline] = useState(null);

  const updateCaseState = useCallback((updates) => {
    setCaseState((prev) => {
      const next = { ...prev, ...updates };
      // Save under cashless_case_id once known so multiple cases for the same
      // patient don't clobber each other in localStorage.
      const storageKey = next.cashless_case_id ?? id;
      saveWorkflow(storageKey, next);
      if (next.cashless_case_id && String(storageKey) !== String(id)) {
        saveWorkflow(id, { cashless_case_id: next.cashless_case_id });
      }
      return next;
    });
  }, [id]);

  // Shared money-ledger / audit-trail fetch. Re-runs as the case advances
  // (new preauth/claim decision, discharge, settlement) so the header strip
  // and banner provenance track the latest state without a manual reload.
  const ledgerCaseId = caseState.cashless_case_id;
  const refreshTimeline = useCallback(async () => {
    if (!ledgerCaseId) return;
    try {
      const res = await api.getCaseTimeline(ledgerCaseId, {});
      setTimeline(res || null);
    } catch (_) {}
  }, [ledgerCaseId]);
  useEffect(() => {
    refreshTimeline();
  }, [refreshTimeline, caseState.preauthDecision, caseState.approvedAmount, caseState.claimCorrelationId, caseState.dischargeCorrelationId]);

  const [communications, setCommunications] = useState([]);
  const [openCommId, setOpenCommId] = useState(null);

  const refreshComms = useCallback(async () => {
    if (!ledgerCaseId) return;
    try {
      const res = await api.listCommunications({ cashless_case_id: ledgerCaseId, limit: 50 });
      setCommunications(res?.communications || []);
    } catch (_) {}
  }, [ledgerCaseId]);

  useEffect(() => {
    refreshComms();
    if (!ledgerCaseId) return;
    const timer = setInterval(refreshComms, COMMS_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshComms, ledgerCaseId]);

  const markCommRead = useCallback((correlationId) => {
    setCommunications((prev) =>
      prev.map((c) => (c.correlation_id === correlationId ? { ...c, provider_read: true } : c)),
    );
  }, []);

  // Stages are routed views swapped inside the scrollable .content pane;
  // React Router keeps the scroll offset across navigations, so a new stage
  // would otherwise open already scrolled down. Reset to the top on each change.
  useEffect(() => {
    const scroller = document.querySelector(".content");
    if (scroller) scroller.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [currentStepPath]);

  useEffect(() => {
    const fetchPatient = async () => {
      setLoading(true);
      try {
        const response = await api.searchChildren({ child_id: id });
        const children = response?.children || [];
        const child = children.find((c) => c.child_id.toString() === id) || children[0];
        if (child) {
          setPatient(child);
          const prior = child.latest_claim;
          const priorMatchesTarget =
            !!prior &&
            !isNewCase &&
            (resumeCaseId
              ? String(prior.cashless_case_id) === String(resumeCaseId)
              : !navAdmissionId || String(prior.admission_id ?? "") === String(navAdmissionId));

          if (priorMatchesTarget) {
            setCashlessCase(prior);
            updateCaseState({
              cashless_case_id: resumeCaseId ?? prior.cashless_case_id ?? caseState.cashless_case_id,
              claim_id: location.state?.claim_id ?? prior.claim_id ?? null,
            });
          } else if (resumeCaseId) {
            const full = await api.getCashlessStatus(resumeCaseId);
            if (full) {
              setCashlessCase(projectCaseStatus(full));
              updateCaseState({
                cashless_case_id: full.cashless_case_id,
                claim_id: location.state?.claim_id ?? full.claim?.claim_id ?? null,
              });
            }
          }
        }
      } catch (_) {
      } finally {
        setLoading(false);
      }
    };
    fetchPatient();
  }, [id]);

  if (loading) {
    return <LoadingBlock text="Loading Case…" />;
  }

  if (!patient) {
    return (
      <EmptyState title="Patient Not Found" description="The patient record you are looking for does not exist.">
        <Button onClick={() => navigate("/registry")} className="mt-4">Back to Registry</Button>
      </EmptyState>
    );
  }

  const contextValue = {
    patient,
    cashlessCase,
    setCashlessCase,
    caseState,
    updateCaseState,
    moneyLedger: timeline?.money_ledger || null,
    timelineEvents: timeline?.events || [],
    refreshTimeline,
  };

  const effectiveCase = cashlessCase || {};
  const preauthRef = caseState.preauthRef || effectiveCase.preauth_ref;
  const preauthDecision = caseState.preauthDecision || effectiveCase.preauth_status;
  const approvedAmount = timeline?.money_ledger?.approved?.value
    ?? effectiveCase.approved_amount
    ?? caseState.approvedAmount
    ?? null;

  const stages = buildStages({
    caseState,
    effectiveCase,
    preauthRef,
    preauthDecision,
    currentPath: currentStepPath,
    moneyLedger: timeline?.money_ledger || null,
    paymentSummary: effectiveCase.payment || null,
  });
  const activeStage = stages.find((s) => s.state === "active");

  return (
    <div className="cx-root">
      <div className="cx-stack">
        <CaseStepper stages={stages} onNavigate={(path) => navigate(`/case/${id}/${path}`)} />

        <section className="cx-stage">
          <CaseFileHeader
            patient={patient}
            caseState={caseState}
            effectiveCase={effectiveCase}
            preauthRef={preauthRef}
            approvedAmount={approvedAmount}
            moneyLedger={timeline?.money_ledger || null}
          />

          <CaseCommsBar communications={communications} onOpen={setOpenCommId} />

          <div className="cx-stage-head">
            <div>
              <div className="cx-eyebrow">
                {activeStage
                  ? activeStage.branch
                    ? "Branch step"
                    : `Stage ${activeStage.num} of 6`
                  : "Cashless case"}
              </div>
              <h1 className="cx-stage-title">{activeStage?.label || "Case"}</h1>
              {activeStage?.hint && <p className="cx-stage-hint">{activeStage.hint}</p>}
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {activeStage?.note && (
                <span className={`cx-stage-flag${activeStage.tone ? ` tone-${activeStage.tone}` : ""}`}>
                  {activeStage.note}
                </span>
              )}
              {currentStepPath === "timeline" ? (
                <Button variant="outline" size="small" onClick={() => navigate(-1)}>Back to case</Button>
              ) : (
                <Button variant="outline" size="small" icon={History} onClick={() => navigate(`/case/${id}/timeline`)}>
                  Audit trail
                </Button>
              )}
            </div>
          </div>

          <div className="cx-stage-body">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {/* Pin Routes to this exact location instead of reading it live from
                    context. Without this, the previous Routes instance kept mounted by
                    AnimatePresence during its exit animation also picks up the new
                    location via context and briefly mounts the next screen a second
                    time, double-firing its init effect (e.g. prepareCashless). */}
                <Routes location={location}>
                  <Route path="/" element={<Navigate to="payer" replace />} />
                  <Route path="payer" element={<PayerPolicy ctx={contextValue} />} />
                  <Route path="prep" element={<EligibilityPrep ctx={contextValue} />} />
                  <Route path="review" element={<PreauthDraft ctx={contextValue} />} />
                  <Route path="status" element={<PreauthStatus ctx={contextValue} />} />
                  <Route path="enhancement" element={<PreauthEnhancement ctx={contextValue} />} />
                  <Route path="claim" element={<ClaimsScreen ctx={contextValue} />} />
                  <Route path="reprocess" element={<ReprocessScreen ctx={contextValue} />} />
                  <Route path="payment" element={<PaymentReconciliation ctx={contextValue} />} />
                  <Route path="timeline" element={<CaseTimeline ctx={contextValue} />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>

      <CommunicationDetailDrawer
        correlationId={openCommId}
        open={!!openCommId}
        onClose={() => {
          setOpenCommId(null);
          refreshComms();
        }}
        onRead={markCommRead}
        showOpenCase={false}
      />
    </div>
  );
}
