import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../../api";
import { usePoll } from "../../hooks/usePoll";
import { Button, DocumentChecklist } from "../Common";
import Dropdown from "../Dropdown";
import { Section, Fields } from "../case/CaseFile";

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
  const [submitError, setSubmitError] = useState(null);
  const [reprocessCorrelationId, setReprocessCorrelationId] = useState(null);
  const [status, setStatus] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (reprocessCorrelationId || !caseState.cashless_case_id) return;
    let live = true;
    api.getCashlessStatus(caseState.cashless_case_id)
      .then((res) => {
        const recovered = res?.reprocess?.correlation_id;
        if (!live || !recovered) return;
        setReprocessCorrelationId(recovered);
        setPolling(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [caseState.cashless_case_id]);

  const pollStatus = async (signal) => {
    try {
      const res = await api.getReprocessStatus(reprocessCorrelationId, signal);
      setStatus(res);
      if (res.status === "complete" || res.status === "not_found" || res.status === "failed") setPolling(false);
    } catch (_) {}
  };
  usePoll(pollStatus, {
    active: polling && reprocessCorrelationId ? reprocessCorrelationId : null,
    intervalMs: POLL_INTERVAL_MS,
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.submitReprocess({
        claim_id: claimId,
        reason_code: reasonCode,
        description,
        supporting_documents: supportingDocs.filter((d) => d.url),
      });
      if (res.status === "failed") {
        setSubmitError(res.message || res.error?.message || "Reprocess submission failed. Please try again.");
        return;
      }
      setReprocessCorrelationId(res.correlation_id);
      setPolling(true);
    } catch (err) {
      setSubmitError(err.message || "Reprocess submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setSubmitError(null);
    setStatus(null);
    setPolling(false);
    setReprocessCorrelationId(null);
  };

  const handleUpload = (doc, uploaded) => {
    setSupportingDocs((prev) =>
      prev.map((d) => (d.code === doc.code ? { ...d, ...uploaded } : d))
    );
  };

  // Lets the hospital attach a document that isn't on the backend's
  // pre-populated required/optional checklist (e.g. a payer-specific extra).
  const addDocument = () => {
    setSupportingDocs((prev) => [
      ...(prev || []),
      { code: `CUSTOM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "", category: "additional", optional: true, custom: true },
    ]);
  };
  const renameDocument = (idx, name) => {
    setSupportingDocs((prev) => prev.map((d, i) => (i === idx ? { ...d, name } : d)));
  };
  const removeDocument = (idx) => {
    setSupportingDocs((prev) => prev.filter((_, i) => i !== idx));
  };

  const decision = status?.decision;
  const isComplete = status?.status === "complete";
  const isFailed = status?.status === "failed";
  const reasonLabel = REASON_CODES.find((r) => r.value === reasonCode)?.label;
  const attached = supportingDocs.filter((d) => d.url).length;
  const appealApproved = ["APPROVED", "PARTIALLY_APPROVED", "REPROCESS_APPROVED"].includes(decision);
  const verdict = isFailed
    ? { tone: "bad", label: "Not delivered" }
    : !isComplete
      ? { tone: "pending", label: "Awaiting payer" }
      : appealApproved
        ? { tone: decision === "PARTIALLY_APPROVED" ? "warn" : "ok", label: decision === "PARTIALLY_APPROVED" ? "Partially approved" : "Appeal accepted" }
        : decision === "QUERIED"
          ? { tone: "warn", label: "Query raised" }
          : decision === "REJECTED"
            ? { tone: "bad", label: "Appeal rejected" }
            : { tone: "pending", label: "Decision received" };

  if (polling || status) {
    return (
      <div className="wizard-step pd-screen">
        <div className="pd-layout">
          <div className="pd-main">
            {isFailed ? (
              <div className="ep-notice is-bad">
                <strong>The appeal could not be delivered.</strong>{" "}
                {status?.error_message || "The request did not reach the payer."}
              </div>
            ) : !isComplete ? (
              <Section id="rp-waiting" title="Appeal sent">
                <Fields
                  cols={2}
                  rows={[
                    { label: "Status", value: "Waiting for the payer's decision" },
                    { label: "Checking every", value: `${POLL_INTERVAL_MS / 1000} seconds` },
                    { label: "Reason", value: reasonLabel },
                    { label: "Request ID", value: reprocessCorrelationId, mono: true },
                  ]}
                />
              </Section>
            ) : (
              <>
                {decision === "REJECTED" && (
                  <div className="ep-notice is-bad">
                    The payer rejected the appeal. The case stays in your history; contact the payer directly to escalate.
                  </div>
                )}
                {(status?.process_notes?.length > 0 || status?.claim_response?.errors?.[0]?.detail) && (
                  <Section id="rp-notes" title="Payer notes">
                    <ol className="ds-notes">
                      {(status.process_notes || []).map((n, i) => (
                        <li key={n.number ?? i}>
                          <span className="ep-mono ep-muted">{n.number ?? i + 1}</span>
                          <span>{n.text}</span>
                        </li>
                      ))}
                      {status?.claim_response?.errors?.[0]?.detail && (
                        <li>
                          <span className="ep-mono ep-muted">!</span>
                          <span>{status.claim_response.errors[0].detail}</span>
                        </li>
                      )}
                    </ol>
                  </Section>
                )}
                <Section id="rp-response" title="Appeal">
                  <Fields
                    cols={2}
                    rows={[
                      { label: "Decision", value: decision ? String(decision).replace(/_/g, " ").toLowerCase() : null },
                      { label: "Reason given", value: reasonLabel },
                      { label: "Explanation", value: description },
                      { label: "Request ID", value: reprocessCorrelationId, mono: true },
                    ]}
                  />
                </Section>
              </>
            )}
          </div>

          <aside className="pd-side">
            <section className="ep-section pd-request">
              <header className="ep-section-head">
                <h3 className="ep-section-title">Appeal</h3>
              </header>
              <div className={`ds-verdict is-${verdict.tone}`}>
                <span className="ep-dot" aria-hidden="true" />
                <span className="ds-verdict-label">{verdict.label}</span>
                {!isComplete && !isFailed && <span className="spinner ds-spinner" aria-hidden="true" />}
              </div>
              <div className="pd-submit">
                {isFailed ? (
                  <Button variant="primary" onClick={handleRetry} className="pd-submit-btn">
                    Try again
                  </Button>
                ) : appealApproved ? (
                  <Button variant="primary" icon={ArrowRight} onClick={() => navigate("../payment")} className="pd-submit-btn">
                    Go to payment
                  </Button>
                ) : decision === "QUERIED" ? (
                  <Button variant="primary" icon={ArrowRight} onClick={() => navigate("../claim")} className="pd-submit-btn">
                    Respond on the claim
                  </Button>
                ) : isComplete && verdict.tone === "bad" ? (
                  <Button variant="primary" icon={Send} onClick={handleRetry} className="pd-submit-btn">
                    File another appeal
                  </Button>
                ) : null}
                <button type="button" className="pd-text-btn" onClick={() => navigate("../claim")}>
                  Back to claim
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-step pd-screen">
      <div className="pd-layout">
        <div className="pd-main">
          <Section id="rp-form" title="Grounds for the appeal" meta="For a rejected or partly approved claim">
            <div className="pd-form rp-form">
              <label className="pd-form-field">
                <span>Reason</span>
                <Dropdown compact ariaLabel="Appeal reason" value={reasonCode} options={REASON_CODES} onChange={setReasonCode} />
              </label>
              <label className="pd-form-field rp-wide">
                <span>Explanation</span>
                <textarea
                  className="input-modern rp-textarea"
                  placeholder="Explain why the claim should be re-evaluated, referring to the payer's notes…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>
          </Section>

          <Section id="rp-docs" title="Supporting evidence" meta="Attach anything the payer's rejection notes ask for">
            <div className="pd-docs">
              <DocumentChecklist
                documents={supportingDocs}
                onUpload={handleUpload}
                onAddDocument={addDocument}
                onRenameDocument={renameDocument}
                onRemoveDocument={removeDocument}
                hideSummary
              />
            </div>
          </Section>

          <div className="ep-footer">
            <Button variant="text" onClick={() => navigate("../claim")}>
              ← Back to claim
            </Button>
          </div>
        </div>

        <aside className="pd-side">
          <section className="ep-section pd-request">
            <header className="ep-section-head">
              <h3 className="ep-section-title">Appeal</h3>
            </header>
            <ul className="pd-ready" aria-label="Appeal readiness">
              <li className="is-ok">
                <CheckCircle2 size={14} />
                <span>Reason</span>
                <span className="pd-ready-note">{reasonLabel}</span>
              </li>
              <li className={description ? "is-ok" : "is-todo"}>
                {description ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>Explanation</span>
              </li>
              <li className={attached ? "is-ok" : "is-soft"}>
                {attached ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>Evidence attached</span>
                <span className="pd-ready-note">{attached}</span>
              </li>
            </ul>
            <div className="pd-submit">
              {submitError && <div className="ep-notice is-bad">{submitError}</div>}
              <Button variant="primary" icon={Send} disabled={!description || submitting} onClick={handleSubmit} className="pd-submit-btn">
                {submitting ? "Submitting…" : "Submit appeal"}
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
