import { useState, useEffect, useCallback } from "react";
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../api";
import { Button } from "../Common";
import { saveWorkflow, loadWorkflow } from "../../workflowStorage";
import CaseFileHeader from "../case/CaseFileHeader";
import CaseStepper from "../case/CaseStepper";
import { buildStages } from "../case/caseStages";
import "../case/case-workspace.css";

import PayerPolicy from "./PayerPolicy";
import EligibilityPrep from "./EligibilityPrep";
import PreauthDraft from "./PreauthDraft";
import PreauthStatus from "./PreauthStatus";
import PreauthEnhancement from "./PreauthEnhancement";
import ClaimsScreen from "./ClaimsScreen";
import ReprocessScreen from "./ReprocessScreen";
import PaymentReconciliation from "./PaymentReconciliation";

export default function CaseWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const currentStepPath = location.pathname.split("/").pop();

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  // Resume: load by cashless_case_id passed in nav state; new case: skip stale child_id save
  const resumeCaseId = location.state?.cashless_case_id;
  const saved = location.state?.newCase
    ? null
    : resumeCaseId
      ? loadWorkflow(resumeCaseId) || loadWorkflow(id)
      : loadWorkflow(id);

  const [caseState, setCaseState] = useState({
    payer: null,
    policy: null,
    admission_id: location.state?.admission_id || null,
    cashless_case_id: location.state?.cashless_case_id || null,
    claim_id: location.state?.claim_id || null,
    eligibility_correlation_id: null,
    preauthCorrelationId: null,
    preauthRef: null,
    preauthDecision: null,
    approvedAmount: null,
    claimCorrelationId: null,
    draftData: null,
    ...saved,
  });

  const [cashlessCase, setCashlessCase] = useState(null);

  const updateCaseState = useCallback((updates) => {
    setCaseState((prev) => {
      const next = { ...prev, ...updates };
      // Save under cashless_case_id once known so multiple cases for the same
      // patient don't clobber each other in localStorage.
      const storageKey = next.cashless_case_id ?? id;
      saveWorkflow(storageKey, next);
      return next;
    });
  }, [id]);

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
          if (child.latest_claim) {
            setCashlessCase(child.latest_claim);
            updateCaseState({
              cashless_case_id: location.state?.cashless_case_id ?? child.latest_claim.cashless_case_id ?? caseState.cashless_case_id,
              claim_id: location.state?.claim_id ?? child.latest_claim.claim_id ?? caseState.claim_id,
            });
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
    return (
      <div className="flex-center py-20 flex-col">
        <div className="spinner mb-4" />
        <p className="text-muted">Loading Case…</p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="empty-view py-20 text-center">
        <h3>Patient Not Found</h3>
        <p className="text-muted">The patient record you are looking for does not exist.</p>
        <Button onClick={() => navigate("/registry")} className="mt-4">Back to Registry</Button>
      </div>
    );
  }

  const contextValue = { patient, cashlessCase, setCashlessCase, caseState, updateCaseState };

  const effectiveCase = cashlessCase || {};
  const preauthRef = caseState.preauthRef || effectiveCase.preauth_ref;
  const preauthDecision = caseState.preauthDecision || effectiveCase.preauth_status;
  const approvedAmount = caseState.approvedAmount;

  const stages = buildStages({
    caseState,
    effectiveCase,
    preauthRef,
    preauthDecision,
    currentPath: currentStepPath,
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
          />

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
            {activeStage?.note && (
              <span className={`cx-stage-flag${activeStage.tone ? ` tone-${activeStage.tone}` : ""}`}>
                {activeStage.note}
              </span>
            )}
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
                </Routes>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </div>
  );
}
