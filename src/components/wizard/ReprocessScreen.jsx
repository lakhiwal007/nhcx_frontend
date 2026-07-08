import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, ArrowRight } from "lucide-react";
import { api } from "../../api";
import { usePoll } from "../../hooks/usePoll";
import { Card, Button, DecisionBanner, DocumentChecklist } from "../Common";

const POLL_INTERVAL_MS = 7000;
const REASON_CODES = [
  { value: "claimrejected", label: "Claim Rejected" },
  { value: "partialpayment", label: "Partial Payment Dispute" },
  { value: "rejectiondisputed", label: "Rejection Disputed" },
  { value: "improvedoc", label: "Submitting Additional Documents" },
  { value: "clinicaleva", label: "Disputing Clinical Evaluation" },
  { value: "pricingquery", label: "Pricing Disagreement" },
  { value: "adminappeal", label: "Administrative Appeal" },
  { value: "other", label: "Other" },
];

export default function ReprocessScreen({ ctx }) {
  const navigate = useNavigate();
  const { caseState } = ctx;

  const claimId = caseState.claim_id || caseState.draftData?.claim_id;

  const [reasonCode, setReasonCode] = useState("other");
  const [description, setDescription] = useState("");
  const [supportingDocs, setSupportingDocs] = useState([
    { category: "attachment", name: "Justification / Supporting Document", code: "ATTACHMENT", url: null },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [reprocessCorrelationId, setReprocessCorrelationId] = useState(null);
  const [status, setStatus] = useState(null);
  const [polling, setPolling] = useState(false);

  const pollStatus = async (signal) => {
    try {
      const res = await api.getReprocessStatus(reprocessCorrelationId, signal);
      setStatus(res);
      if (res.status === "complete" || res.status === "not_found") setPolling(false);
    } catch (_) {}
  };
  usePoll(pollStatus, {
    active: polling && reprocessCorrelationId ? reprocessCorrelationId : null,
    intervalMs: POLL_INTERVAL_MS,
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await api.submitReprocess({
        claim_id: claimId,
        reason_code: reasonCode,
        description,
        supporting_documents: supportingDocs.filter((d) => d.url),
      });
      setReprocessCorrelationId(res.correlation_id);
      setPolling(true);
    } catch (_) {
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = (doc) => {
    setSupportingDocs((prev) =>
      prev.map((d) =>
        d.code === doc.code ? { ...d, url: "https://hospital.example/mock/doc.pdf" } : d
      )
    );
  };

  if (polling || status) {
    const isComplete = status?.status === "complete";
    return (
      <div className="wizard-step">
        {!isComplete ? (
          <Card className="mb-6">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="spinner" style={{ width: "24px", height: "24px" }} />
              <div>
                <div style={{ fontWeight: 700 }}>Appeal in Progress</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {reprocessCorrelationId} · polling every {POLL_INTERVAL_MS / 1000}s
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <DecisionBanner decision={status?.decision} message={status?.claim_response?.errors?.[0]?.detail || status?.process_notes?.[0]?.text} />
            {status?.decision === "REJECTED" ? (
              <div style={{ padding: "16px 20px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", borderRadius: "var(--radius-md)", marginTop: "16px", marginBottom: "16px" }}>
                <div style={{ fontWeight: 700, color: "var(--error)", marginBottom: "6px" }}>Appeal rejected</div>
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  The payer has rejected the appeal. This case remains in your history. Contact the payer directly if you wish to escalate further.
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <Button variant="outline" onClick={() => navigate("/")}>Save & Close</Button>
              {status?.decision !== "REJECTED" && (
                <Button variant="primary" onClick={() => navigate("../payment")}>
                  Proceed to Payment <ArrowRight size={18} style={{ marginLeft: "8px" }} />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="wizard-step">
      <div className="grid-1-to-2" style={{ gap: "24px" }}>
        <Card title="File an Appeal">
          <p className="text-muted" style={{ fontSize: "14px", marginBottom: "20px" }}>
            Use this when the claim was partially approved or rejected and you have additional justification or missing documents to submit.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label className="input-label-modern">Reason Code</label>
              <select
                className="input-modern"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
              >
                {REASON_CODES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label-modern">Description</label>
              <textarea
                className="input-modern"
                style={{ height: "100px", resize: "vertical" }}
                placeholder="Explain why the claim should be re-evaluated…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <Card title="Supporting Evidence">
            <div className="warning-banner mb-4" style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}>
              Attach any documents referenced in the payer's rejection notes.
            </div>
            <DocumentChecklist documents={supportingDocs} onUpload={handleUpload} />
          </Card>

          <Card>
            <Button
              variant="primary"
              className="w-full"
              icon={Send}
              disabled={!description || submitting}
              onClick={handleSubmit}
              style={{ justifyContent: "center" }}
            >
              {submitting ? "Submitting…" : "Submit Appeal"}
            </Button>
          </Card>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
        <Button variant="text" onClick={() => navigate("../claim")}>← Back to Claim</Button>
        <Button variant="outline" onClick={() => navigate("../payment")}>
          Skip to Payment <ArrowRight size={18} style={{ marginLeft: "8px" }} />
        </Button>
      </div>
    </div>
  );
}
