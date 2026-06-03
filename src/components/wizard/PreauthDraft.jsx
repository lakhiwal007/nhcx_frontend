import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, FileText, CheckCircle2 } from "lucide-react";
import { api } from "../../api";
import { Card, Button, DocumentChecklist, StatusBadge } from "../Common";

export default function PreauthDraft({ ctx }) {
  const navigate = useNavigate();
  const { patient, cashlessCase, caseState, updateCaseState } = ctx;
  const { payer, policy } = caseState;

  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!cashlessCase) {
      navigate("../payer");
      return;
    }

    const loadDraft = async () => {
      setLoading(true);
      try {
        const res = await api.preparePreauth({
          claim_id: cashlessCase.claim_id,
          payer_code: payer?.participant_code,
          policy_number: policy?.policy_number
        });
        setDraft(res);
        updateCaseState({ draftData: res });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadDraft();
  }, [cashlessCase, navigate, payer, policy, updateCaseState]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await api.submitPreauth({
        claim_id: draft.claim_id,
        policy_number: draft.policy_number,
        supporting_documents: draft.supporting_documents
      });
      updateCaseState({ preauthResponse: res });
      navigate("../status");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex-center py-20 flex-col"><div className="spinner mb-4" /><p className="text-muted">Generating Preauth Draft...</p></div>;
  }

  const handleUpload = (docToUpload) => {
    // Simulate upload by updating the draft document with a mock URL
    const updatedDocs = draft.supporting_documents.map(d => 
      d.code === docToUpload.code ? { ...d, url: "https://mock-url.com/doc.pdf" } : d
    );
    setDraft({ ...draft, supporting_documents: updatedDocs });
  };

  // Calculate missing mandatory docs
  const hasMissingDocs = draft?.supporting_documents?.some(d => !d.optional && !d.url);

  return (
    <div className="wizard-step">
      <div className="grid-1-to-3" style={{ gap: "24px" }}>
        
        {/* Main Content: Diagnoses & Items */}
        <div style={{ gridColumn: "span 1", display: "flex", flexDirection: "column", gap: "24px" }}>
          <Card title="Clinical Information">
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase" }}>Diagnoses</div>
              {draft?.diagnoses?.map((diag, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px", border: "1px solid var(--border-color)", borderRadius: "8px", marginBottom: "8px" }}>
                  <span className="badge-modern badge-primary">ICD: {diag.code}</span>
                  <span style={{ fontSize: "14px", fontWeight: 600 }}>{diag.name}</span>
                  {diag.primary && <span className="badge-modern badge-success" style={{ marginLeft: "auto", fontSize: "10px" }}>PRIMARY</span>}
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase" }}>Line Items</div>
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
                    {draft?.items?.map((item, i) => (
                      <tr key={i}>
                        <td>{item.service_name} <code>({item.service_code})</code></td>
                        <td>{item.quantity}</td>
                        <td>₹{item.unit_price?.toLocaleString()}</td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>₹{item.net_amount?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3" style={{ textAlign: "right", fontWeight: 700 }}>Total Billed</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: "var(--primary)", fontSize: "15px" }}>₹{draft?.total_amount?.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar: Documents & Submit */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <Card title="Required Documents">
            <DocumentChecklist documents={draft?.supporting_documents} onUpload={handleUpload} />
          </Card>

          <Card>
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}>Total Request</div>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "var(--primary)" }}>₹{draft?.total_amount?.toLocaleString()}</div>
            </div>
            
            <Button 
              variant="primary" 
              className="w-full" 
              icon={Send} 
              disabled={hasMissingDocs || submitting}
              onClick={handleSubmit}
              style={{ justifyContent: "center" }}
            >
              {submitting ? "Submitting..." : "Submit to Payer"}
            </Button>
            
            {hasMissingDocs && (
              <p style={{ fontSize: "11px", color: "var(--error)", textAlign: "center", marginTop: "12px", fontWeight: 600 }}>
                Please upload all required documents before submitting.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
