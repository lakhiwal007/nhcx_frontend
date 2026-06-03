import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircle, Send, ArrowRight } from "lucide-react";
import { api } from "../../api";
import { Card, Button, Input } from "../Common";

export default function PreauthEnhancement({ ctx, onClose }) {
  const navigate = useNavigate();
  const { caseState, updateCaseState } = ctx;
  
  const [submitting, setSubmitting] = useState(false);
  const [enhancementReason, setEnhancementReason] = useState("");
  const [additionalAmount, setAdditionalAmount] = useState("");
  const [uploaded, setUploaded] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await api.submitPreauthEnhancement({
        claim_id: caseState.draftData?.claim_id || Date.now(),
        policy_number: caseState.policy?.policy_number,
        reason: enhancementReason,
        additional_amount: Number(additionalAmount)
      });
      updateCaseState({ preauthResponse: res });
      if (onClose) onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <p className="text-muted" style={{ fontSize: "14px" }}>
          Submit an enhancement if the clinical situation has changed and additional funds are required before discharge.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label className="input-label-modern">Additional Amount Required (₹)</label>
            <Input 
              type="number"
              placeholder="e.g. 15000"
              value={additionalAmount}
              onChange={(e) => setAdditionalAmount(e.target.value)}
            />
          </div>
          
          <div>
            <label className="input-label-modern">Clinical Reason for Enhancement</label>
            <textarea 
              className="input-modern"
              style={{ height: "100px", resize: "vertical", width: "100%" }}
              placeholder="Describe why additional funds or procedures are required..."
              value={enhancementReason}
              onChange={(e) => setEnhancementReason(e.target.value)}
            />
          </div>
        </div>
        
        <div>
          <h4 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>Required Documents</h4>
          <div className="warning-banner mb-4" style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)", fontSize: "13px" }}>
            Please attach updated clinical notes or investigation reports justifying the enhancement.
          </div>
          {/* Mocking document list for enhancement */}
          <div className="doc-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600 }}>Updated Clinical Notes</span>
            {uploaded ? (
              <span className="badge-modern badge-success" style={{ fontSize: '10px' }}>Attached</span>
            ) : (
              <Button variant="outline" size="small" onClick={() => setUploaded(true)}>Upload</Button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            variant="primary" 
            icon={Send}
            disabled={!additionalAmount || !enhancementReason || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Submitting..." : "Submit Enhancement"}
          </Button>
        </div>
      </div>
    </div>
  );
}
