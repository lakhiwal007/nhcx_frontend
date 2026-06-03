import { useState, useEffect, useCallback } from "react";
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, User, Building2, Calendar, FileText, CheckCircle2 } from "lucide-react";
import { api } from "../../api";
import { Button, StatusBadge } from "../Common";

// Steps for the wizard
const WIZARD_STEPS = [
  { id: "payer", label: "Payer & Policy", path: "payer" },
  { id: "prep", label: "Eligibility Prep", path: "prep" },
  { id: "review", label: "Preauth Draft", path: "review" },
  { id: "status", label: "Preauth Status", path: "status" },
  { id: "claim", label: "Claim Submission", path: "claim" },
  { id: "reprocess", label: "Reprocess", path: "reprocess" },
  { id: "payment", label: "Payment", path: "payment" },
];

import PayerPolicy from "./PayerPolicy";
import EligibilityPrep from "./EligibilityPrep";
import PreauthDraft from "./PreauthDraft";
import PreauthStatus from "./PreauthStatus";
import ClaimsScreen from "./ClaimsScreen";
import ReprocessScreen from "./ReprocessScreen";
import PaymentReconciliation from "./PaymentReconciliation";

export default function CaseWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const currentStepPath = location.pathname.split("/").pop();

  const [patient, setPatient] = useState(null);
  const [cashlessCase, setCashlessCase] = useState(null);
  const [loading, setLoading] = useState(true);

  // Global case state
  const [caseState, setCaseState] = useState({
    payer: null,
    policy: null,
    draftData: null,
    preauthResponse: null,
    claimResponse: null
  });

  const updateCaseState = useCallback((updates) => {
    setCaseState(prev => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    const fetchPatient = async () => {
      setLoading(true);
      try {
        const response = await api.searchChildren();
        const child = response?.children?.find(c => c.child_id.toString() === id);
        if (child) {
          setPatient(child);
          // If the child has a latest claim, maybe load it.
          if (child.latest_claim) {
             setCashlessCase(child.latest_claim);
             // Hydrate state if needed
             setCaseState(prev => ({ ...prev, payer: { participant_code: child.latest_claim.payer_code } }));
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPatient();
  }, [id]);

  if (loading) {
    return <div className="flex-center py-20 flex-col"><div className="spinner mb-4" /><p className="text-muted">Loading Case...</p></div>;
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

  const currentStepIndex = WIZARD_STEPS.findIndex(s => s.path === currentStepPath) || 0;

  // Context provider value
  const contextValue = {
    patient,
    cashlessCase,
    setCashlessCase,
    caseState,
    updateCaseState
  };

  return (
    <div className="case-wrapper">
      {/* Sticky Header */}
      <div className="sticky-case-header" style={{
        position: "sticky", top: 0, zIndex: 40, background: "var(--glass)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border-color)", padding: "16px 24px", margin: "-24px -24px 24px -24px",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '20px' }}>
            {patient.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>{patient.name}</h2>
              <span className="badge-modern badge-info">ID: #{patient.child_id}</span>
              {cashlessCase && <StatusBadge status={cashlessCase.status} />}
            </div>
            <div style={{ display: "flex", gap: "16px", fontSize: '12px', color: 'var(--text-muted)' }}>
              <span><User size={12} style={{ display: 'inline', marginRight: '4px' }}/> {patient.gender}</span>
              <span><Calendar size={12} style={{ display: 'inline', marginRight: '4px' }}/> {patient.dob}</span>
              {cashlessCase?.policy_number && <span><Building2 size={12} style={{ display: 'inline', marginRight: '4px' }}/> {cashlessCase.payer_code} • {cashlessCase.policy_number}</span>}
            </div>
          </div>
        </div>
        
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>Current Case Phase</div>
          <div style={{ fontWeight: 700, color: "var(--primary)" }}>{WIZARD_STEPS[currentStepIndex]?.label || "Initialization"}</div>
        </div>
      </div>

      {/* Stepper Navigation */}
      <div className="stepper-modern" style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "16px", marginBottom: "24px" }}>
        {WIZARD_STEPS.map((step, index) => {
          const isActive = currentStepPath === step.path;
          const isPast = index < currentStepIndex;
          return (
            <div 
              key={step.id}
              onClick={() => isPast && navigate(step.path)}
              style={{
                padding: "10px 16px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "8px",
                background: isActive ? "var(--primary)" : isPast ? "rgba(16,185,129,0.1)" : "var(--bg-main)",
                color: isActive ? "white" : isPast ? "var(--success)" : "var(--text-muted)",
                fontWeight: isActive || isPast ? 600 : 400,
                border: `1px solid ${isActive ? "var(--primary)" : isPast ? "var(--success)" : "var(--border-color)"}`,
                cursor: isPast ? "pointer" : "default",
                whiteSpace: "nowrap"
              }}
            >
              {isPast ? <CheckCircle2 size={16} /> : <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: isActive ? "white" : "var(--border-color)", color: isActive ? "var(--primary)" : "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 800 }}>{index + 1}</div>}
              <span style={{ fontSize: "13px" }}>{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Sub-Routes */}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="payer" replace />} />
            <Route path="payer" element={<PayerPolicy ctx={contextValue} />} />
            <Route path="prep" element={<EligibilityPrep ctx={contextValue} />} />
            <Route path="review" element={<PreauthDraft ctx={contextValue} />} />
            <Route path="status" element={<PreauthStatus ctx={contextValue} />} />
            <Route path="claim" element={<ClaimsScreen ctx={contextValue} />} />
            <Route path="reprocess" element={<ReprocessScreen ctx={contextValue} />} />
            <Route path="payment" element={<PaymentReconciliation ctx={contextValue} />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
