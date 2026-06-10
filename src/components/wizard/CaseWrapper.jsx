import { useState, useEffect, useCallback } from "react";
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { User, Building2, Calendar, FileText, CheckCircle2, Hash } from "lucide-react";
import { api } from "../../api";
import { Button, StatusBadge } from "../Common";
import { saveWorkflow, loadWorkflow } from "../../workflowStorage";

import PayerPolicy from "./PayerPolicy";
import EligibilityPrep from "./EligibilityPrep";
import PreauthDraft from "./PreauthDraft";
import PreauthStatus from "./PreauthStatus";
import PreauthEnhancement from "./PreauthEnhancement";
import ClaimsScreen from "./ClaimsScreen";
import ReprocessScreen from "./ReprocessScreen";
import PaymentReconciliation from "./PaymentReconciliation";

const WIZARD_STEPS = [
  { id: "payer", label: "Payer & Policy", path: "payer" },
  { id: "prep", label: "Eligibility", path: "prep" },
  { id: "review", label: "Preauth Draft", path: "review" },
  { id: "status", label: "Preauth Status", path: "status" },
  { id: "claim", label: "Claim", path: "claim" },
  { id: "enhancement", label: "Enhancement", path: "enhancement" },
  { id: "reprocess", label: "Reprocess", path: "reprocess" },
  { id: "payment", label: "Payment", path: "payment" },
];

export default function CaseWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const currentStepPath = location.pathname.split("/").pop();
  const currentStepIndex = WIZARD_STEPS.findIndex((s) => s.path === currentStepPath);

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  const saved = loadWorkflow(id);

  const [caseState, setCaseState] = useState({
    payer: null,
    policy: null,
    admission_id: location.state?.admission_id || null,
    cashless_case_id: null,
    claim_id: null,
    eligibility_correlation_id: null,
    preauthCorrelationId: null,
    preauthRef: null,
    preauthDecision: null,
    claimCorrelationId: null,
    draftData: null,
    ...saved,
  });

  const [cashlessCase, setCashlessCase] = useState(null);

  const updateCaseState = useCallback((updates) => {
    setCaseState((prev) => {
      const next = { ...prev, ...updates };
      saveWorkflow(id, next);
      return next;
    });
  }, [id]);

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
              cashless_case_id: child.latest_claim.cashless_case_id ?? caseState.cashless_case_id,
              claim_id: child.latest_claim.claim_id ?? caseState.claim_id,
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

  return (
    <div className="case-wrapper">
      <div className="sticky-case-header" style={{
        position: "sticky", top: 0, zIndex: 40, background: "var(--glass)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border-color)", padding: "14px 24px", margin: "-24px -24px 24px -24px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--primary-light)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "18px", flexShrink: 0 }}>
            {patient.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0 }}>{patient.name}</h2>
              <span className="badge-modern badge-info" style={{ fontSize: "10px" }}>Child #{patient.child_id}</span>
              {caseState.claim_id && (
                <span className="badge-modern badge-info" style={{ fontSize: "10px" }}>Claim #{caseState.claim_id}</span>
              )}
              {caseState.cashless_case_id && (
                <span className="badge-modern badge-info" style={{ fontSize: "10px" }}>Case #{caseState.cashless_case_id}</span>
              )}
              {effectiveCase.status && <StatusBadge status={effectiveCase.status} />}
              {preauthDecision && <StatusBadge status={preauthDecision} />}
            </div>
            <div style={{ display: "flex", gap: "14px", fontSize: "12px", color: "var(--text-muted)", flexWrap: "wrap" }}>
              <span><User size={12} style={{ display: "inline", marginRight: "4px" }} />{patient.gender}</span>
              <span><Calendar size={12} style={{ display: "inline", marginRight: "4px" }} />{patient.dob}</span>
              {effectiveCase.payer_id && (
                <span><Building2 size={12} style={{ display: "inline", marginRight: "4px" }} />{effectiveCase.payer_id}</span>
              )}
              {(caseState.policy?.policyNumber || caseState.policy?.policy_number || effectiveCase.policy_number) && (
                <span><FileText size={12} style={{ display: "inline", marginRight: "4px" }} />{caseState.policy?.policyNumber || caseState.policy?.policy_number || effectiveCase.policy_number}</span>
              )}
              {preauthRef && (
                <span><Hash size={12} style={{ display: "inline", marginRight: "4px" }} />Preauth: {preauthRef}</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>Current Phase</div>
          <div style={{ fontWeight: 700, color: "var(--primary)", fontSize: "13px" }}>
            {WIZARD_STEPS[currentStepIndex]?.label || "Initialization"}
          </div>
        </div>
      </div>

      <div className="stepper-modern" style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "16px", marginBottom: "24px" }}>
        {WIZARD_STEPS.map((step, index) => {
          const isActive = currentStepPath === step.path;
          const isPast = currentStepIndex > 0 && index < currentStepIndex;
          return (
            <div
              key={step.id}
              onClick={() => isPast && navigate(`/case/${id}/${step.path}`)}
              style={{
                padding: "8px 14px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "6px",
                background: isActive ? "var(--primary)" : isPast ? "rgba(16,185,129,0.1)" : "var(--bg-main)",
                color: isActive ? "white" : isPast ? "var(--success)" : "var(--text-muted)",
                fontWeight: isActive || isPast ? 600 : 400,
                border: `1px solid ${isActive ? "var(--primary)" : isPast ? "var(--success)" : "var(--border-color)"}`,
                cursor: isPast ? "pointer" : "default",
                whiteSpace: "nowrap",
                fontSize: "12px",
              }}
            >
              {isPast ? <CheckCircle2 size={14} /> : (
                <div style={{ width: "14px", height: "14px", borderRadius: "50%", background: isActive ? "white" : "var(--border-color)", color: isActive ? "var(--primary)" : "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 800 }}>
                  {index + 1}
                </div>
              )}
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          <Routes>
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
  );
}
