import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, FileText, AlertCircle } from "lucide-react";
import { api } from "../../api";
import { Card, Button, MissingFieldsAlert, StatusBadge } from "../Common";

export default function EligibilityPrep({ ctx }) {
  const navigate = useNavigate();
  const { patient, caseState, setCashlessCase } = ctx;
  const { payer, policy } = caseState;

  const [loading, setLoading] = useState(true);
  const [prepData, setPrepData] = useState(null);
  const [missingResolved, setMissingResolved] = useState(false); // mock resolve

  useEffect(() => {
    if (!patient || !payer || !policy) {
      navigate("../payer");
      return;
    }

    const initPrep = async () => {
      setLoading(true);
      try {
        const res = await api.prepareCashless({
          claim_id: Date.now(), // Generate a new ID if creating fresh
          child_id: patient.child_id,
          payer_code: payer.participant_code,
          policy_number: policy.policy_number
        });
        setPrepData(res);
        setCashlessCase(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    initPrep();
  }, [patient, payer, policy, navigate, setCashlessCase]);

  const handleResolveMissing = () => {
    // In real app, this opens a modal to patch /claims/{id}/patient-context
    setMissingResolved(true);
  };

  const handleNext = () => {
    navigate("../review");
  };

  if (loading) {
    return <div className="flex-center py-20 flex-col"><div className="spinner mb-4" /><p className="text-muted">Preparing Eligibility Context...</p></div>;
  }

  // Mock missing fields logic for UI demonstration
  const missing = missingResolved ? [] : ["DOB", "ABHA ID"];
  const isReady = missing.length === 0;

  return (
    <div className="wizard-step">
      <Card className="mb-6">
        <h3 style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle2 color="var(--success)" /> Context Validation
        </h3>
        
        <MissingFieldsAlert 
          fields={missing} 
          onResolve={handleResolveMissing} 
        />

        <div className="grid-1-to-2" style={{ gap: "24px", marginTop: "24px" }}>
          <div style={{ background: "var(--bg-main)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "12px", textTransform: "uppercase" }}>Selected Policy</div>
            <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>{policy?.product_name}</div>
            <code style={{ fontSize: "12px", color: "var(--primary)" }}>{policy?.policy_number}</code>
          </div>

          <div style={{ background: "var(--bg-main)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "12px", textTransform: "uppercase" }}>Extracted Procedures</div>
            {prepData?.procedures?.items?.map(proc => (
              <div key={proc.code} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", fontSize: "13px" }}>
                <FileText size={14} color="var(--primary)" /> {proc.name} <code>({proc.code})</code>
              </div>
            )) || <div className="text-muted text-sm">No procedures found in DB for this visit.</div>}
          </div>
        </div>
      </Card>

      {/* Navigation Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
        <Button variant="text" onClick={() => navigate("../payer")}>← Back</Button>
        <Button 
          variant="primary" 
          disabled={!isReady} 
          onClick={handleNext}
        >
          Proceed to Draft Review <ArrowRight size={18} style={{ marginLeft: "8px" }} />
        </Button>
      </div>
    </div>
  );
}
