import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { usePoll } from "../../hooks/usePoll";
import { Button, DocumentChecklist, LoadingBlock, NextStep } from "../Common";
import Dropdown from "../Dropdown";
import { Section, Fields } from "../case/CaseFile";
import { projectCaseStatus } from "../case/caseStages";

const POLL_INTERVAL_MS = 7000;
const REASON_CODES = [
  { value: "claimrejected", label: "Reprocess request due to claim rejected by payer" },
  { value: "rejectiondisputed", label: "Rejection disputed, additional evidence provided" },
];
const EVIDENCE = { category: "attachment", name: "Justification / Supporting Document", code: "ATTACHMENT", optional: true };
const FINISHED = ["complete", "failed", "not_found"];

const reasonName = (code) => REASON_CODES.find((r) => r.value === code)?.label || code;

// The backend takes an appeal only on a rejected final claim that is not paid in full.
function unavailableReason(claimLeg, settled) {
  if (settled) return "This claim is settled, so there is nothing left to appeal.";
  if (!claimLeg || claimLeg === "rejected") return null;
  if (claimLeg === "approved" || claimLeg === "partial") return "The payer did not reject this claim. To recover an unpaid balance, use Ask for the balance on the Claim step.";
  if (claimLeg === "queried") return "The payer has an open query on this claim. Answer it on the Claim step.";
  if (claimLeg === "submitting") return "The payer has not decided this claim yet. An appeal can follow only a rejection.";
  return "Only a final claim the payer has rejected can be appealed.";
}

export default function ReprocessScreen({ ctx }) {
  const navigate = useNavigate();
  const { caseState, cashlessCase, setCashlessCase, caseClosed, draftFiles, setDraftFiles } = ctx;
  const caseId = caseState.cashless_case_id;
  const readOnly = useReadOnly();
  const filesKey = caseId || caseState.claim_id ? `${caseId || caseState.claim_id}:reprocess` : null;

  const [caseNow, setCaseNow] = useState(null);
  const [loading, setLoading] = useState(!!caseId);
  const [loadError, setLoadError] = useState(null);
  // Staff leave for the Claim step to read the payer's notes, so the draft stays.
  const draftKey = filesKey ? `${filesKey}:text` : null;
  const [reasonCode, setReasonCode] = useState(draftFiles?.[draftKey]?.reasonCode || "claimrejected");
  const [description, setDescription] = useState(draftFiles?.[draftKey]?.description || "");
  const [supportingDocs, setSupportingDocs] = useState(() => {
    const docs = [EVIDENCE];
    (draftFiles?.[filesKey] || []).forEach((file) => {
      const idx = docs.findIndex((d) => d.code === file.code);
      if (idx >= 0) docs[idx] = { ...docs[idx], ...file };
      else docs.push(file);
    });
    return docs;
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [sentId, setSentId] = useState(null);
  const [dismissedId, setDismissedId] = useState(null);
  const [status, setStatus] = useState(null);
  const [pollError, setPollError] = useState(null);

  const loadCase = async () => {
    if (!caseId) return;
    setLoadError(null);
    try {
      const res = await api.getCashlessStatus(caseId);
      setCaseNow(res);
      setCashlessCase((prev) => (prev ? { ...prev, ...projectCaseStatus(res) } : prev));
    } catch (err) {
      setLoadError(err.message || "The case could not be read.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadCase, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  useEffect(() => {
    if (!filesKey) return;
    setDraftFiles(filesKey, supportingDocs.filter((d) => d.attachment || d.custom));
  }, [supportingDocs, filesKey, setDraftFiles]);

  useEffect(() => {
    if (draftKey) setDraftFiles(draftKey, { reasonCode, description });
  }, [draftKey, reasonCode, description, setDraftFiles]);

  const appeal = caseNow?.reprocess;
  const recoveredId = appeal?.correlation_id !== dismissedId ? appeal?.correlation_id : null;
  const correlationId = sentId || recoveredId;
  const claimId = caseNow?.claim?.claim_id ?? caseNow?.claim_id ?? cashlessCase?.claim_id ?? caseState.claim_id;
  const claimLeg = (caseNow?.legs ?? cashlessCase?.legs)?.claim;

  const pollStatus = async (signal) => {
    try {
      const res = await api.getReprocessStatus(correlationId, signal);
      setStatus(res);
      setPollError(null);
      if (FINISHED.includes(res.status)) loadCase();
    } catch (err) {
      if (err?.name !== "AbortError") setPollError(err.message || "The appeal status could not be read.");
    }
  };
  usePoll(pollStatus, {
    active: correlationId && !FINISHED.includes(status?.status) ? correlationId : null,
    intervalMs: POLL_INTERVAL_MS,
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.submitReprocess({
        claim_id: claimId,
        reason_code: reasonCode,
        description: description.trim(),
        supporting_documents: supportingDocs.filter((d) => d.url),
      });
      if (res.status === "failed") {
        setSubmitError(res.message || res.error?.message || "Reprocess submission failed. Please try again.");
        return;
      }
      if (filesKey) setDraftFiles(filesKey, []);
      if (draftKey) setDraftFiles(draftKey, null);
      setStatus(null);
      setSentId(res.correlation_id);
      loadCase();
    } catch (err) {
      setSubmitError(err.message || "Reprocess submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setSubmitError(null);
    setPollError(null);
    setStatus(null);
    setSentId(null);
    setDismissedId(correlationId);
  };

  const checkAgain = () => {
    setPollError(null);
    setStatus(null);
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

  // The case can name the decision before the first poll answers.
  const seeded = !status && correlationId === appeal?.correlation_id ? appeal : null;
  const decision = String(status?.decision ?? seeded?.decision ?? "").replace(/^REPROCESS_/, "") || null;
  const isComplete = status?.status === "complete" || !!seeded?.decision;
  const isFailed = status?.status === "failed";
  const isNotFound = status?.status === "not_found";
  const attached = supportingDocs.filter((d) => d.url).length;
  const explanation = description.trim();
  const sentReason = status?.reason_code ?? seeded?.reason_code ?? (sentId ? reasonCode : null);
  const reasonLabel = reasonName(reasonCode);
  const failureMessage = status?.errors?.[0]?.message || status?.error_message || "The request did not reach the payer.";
  const payerError = status?.claim_response?.errors?.[0]?.detail;
  const canAppeal = !unavailableReason(claimLeg, caseClosed);
  const canSend = !readOnly && !submitting && !!explanation && !!claimId;
  const appealApproved = decision === "APPROVED" || decision === "PARTIALLY_APPROVED";
  const verdict = isFailed
    ? { tone: "bad", label: "Not delivered" }
    : isNotFound
      ? { tone: "pending", label: "No record" }
      : !isComplete
        ? { tone: "pending", label: "Awaiting payer" }
        : appealApproved
          ? { tone: decision === "PARTIALLY_APPROVED" ? "warn" : "ok", label: decision === "PARTIALLY_APPROVED" ? "Partially approved" : "Appeal accepted" }
          : decision === "QUERIED"
            ? { tone: "warn", label: "Query raised" }
            : decision === "REJECTED"
              ? { tone: "bad", label: "Appeal rejected" }
              : { tone: "pending", label: "Decision received" };

  const guide = isFailed
    ? { tone: "bad", title: "The payer never received the appeal", text: "Check the reason below and press Try again." }
    : isNotFound
      ? { tone: "warn", title: "This appeal has no record", text: "The payer has no record of this request yet. Check again, or look at the Audit trail." }
      : !isComplete
        ? { tone: "info", title: "The payer is reviewing your appeal", text: "This can take a few days. You can leave this page; the answer appears here and in the Work Queue." }
        : appealApproved
          ? { tone: decision === "PARTIALLY_APPROVED" ? "warn" : "ok", title: "Appeal accepted", text: "Track the money on the Payment step." }
          : decision === "QUERIED"
            ? { tone: "warn", title: "The payer has a question about the appeal", text: "Go to the Claim step, press Respond to query and send what it asks for." }
            : decision === "REJECTED"
              ? { tone: "bad", title: "Appeal rejected", text: "Read the payer's notes. You can appeal again with new evidence or contact the payer directly; if the decision stands, the patient may have to pay." }
              : { tone: "info", title: "The payer has answered", text: "It did not give a clear decision. Read its notes and the Audit trail." };

  if (loading) return <LoadingBlock compact />;

  if (loadError && !correlationId) {
    return (
      <NextStep
        tone="bad"
        title="The case could not be read"
        actions={
          <>
            <button type="button" className="cv-btn" onClick={loadCase}>Retry</button>
            <button type="button" className="cv-btn" onClick={() => navigate("../claim")}>Back to claim</button>
          </>
        }
      >
        {loadError}
      </NextStep>
    );
  }

  if (!correlationId && !canAppeal) {
    return (
      <NextStep
        tone="warn"
        title="Appeal not available"
        actions={<button type="button" className="cv-btn" onClick={() => navigate("../claim")}>Back to claim</button>}
      >
        {unavailableReason(claimLeg, caseClosed)}
      </NextStep>
    );
  }

  if (correlationId) {
    return (
      <div className="wizard-step pd-screen">
        {guide && (
          <NextStep tone={guide.tone} title={guide.title} className="ds-guide">
            {guide.text}
          </NextStep>
        )}
        <div className="pd-layout">
          <div className="pd-main">
            {pollError && <div className="ep-notice is-bad">{pollError} Still trying.</div>}
            {isFailed ? (
              <div className="ep-notice is-bad">
                <strong>The appeal could not be delivered.</strong> {failureMessage}
              </div>
            ) : isNotFound ? (
              <Section id="rp-waiting" title="Appeal sent">
                <Fields cols={2} rows={[{ label: "Request ID", value: correlationId, mono: true }]} />
              </Section>
            ) : !isComplete ? (
              <Section id="rp-waiting" title="Appeal sent">
                <Fields
                  cols={2}
                  rows={[
                    { label: "Status", value: "Waiting for the payer's decision" },
                    { label: "Checking every", value: `${POLL_INTERVAL_MS / 1000} seconds` },
                    { label: "Reason", value: reasonName(sentReason) },
                    { label: "Request ID", value: correlationId, mono: true },
                  ]}
                />
              </Section>
            ) : (
              <>
                {(status?.process_notes?.length > 0 || payerError) && (
                  <Section id="rp-notes" title="Payer notes">
                    <ol className="ds-notes">
                      {(status?.process_notes || []).map((n, i) => (
                        <li key={n.number ?? i}>
                          <span className="ep-mono ep-muted">{n.number ?? i + 1}</span>
                          <span>{n.text}</span>
                        </li>
                      ))}
                      {payerError && (
                        <li>
                          <span className="ep-mono ep-muted">!</span>
                          <span>{payerError}</span>
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
                      { label: "Reason given", value: reasonName(sentReason) },
                      ...(sentId ? [{ label: "Explanation", value: explanation }] : []),
                      { label: "Request ID", value: correlationId, mono: true },
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
                {!isComplete && !isFailed && !isNotFound && <span className="spinner ds-spinner" aria-hidden="true" />}
              </div>
              <div className="pd-submit">
                {isFailed ? (
                  <Button variant="primary" onClick={handleRetry} className="pd-submit-btn">
                    Try again
                  </Button>
                ) : isNotFound ? (
                  <Button variant="primary" onClick={checkAgain} className="pd-submit-btn">
                    Check again
                  </Button>
                ) : appealApproved ? (
                  <Button variant="primary" icon={ArrowRight} onClick={() => navigate("../payment")} className="pd-submit-btn">
                    Go to payment
                  </Button>
                ) : decision === "QUERIED" ? (
                  <Button variant="primary" icon={ArrowRight} onClick={() => navigate("../claim")} className="pd-submit-btn">
                    Respond on the claim
                  </Button>
                ) : decision === "REJECTED" && canAppeal ? (
                  <Button write variant="primary" icon={Send} onClick={handleRetry} className="pd-submit-btn">
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
          <Section
            id="rp-form"
            title="Grounds for the appeal"
            meta="For a claim the payer rejected"
            info="reprocess"
            tip="Say in plain words why the payer should look again, and point to the evidence you attach below."
          >
            <div className="pd-form rp-form">
              <label className="pd-form-field">
                <span>Reason</span>
                {readOnly ? <span>{reasonLabel}</span> : <Dropdown compact ariaLabel="Appeal reason" value={reasonCode} options={REASON_CODES} onChange={setReasonCode} />}
              </label>
              <label className="pd-form-field rp-wide">
                <span>Explanation</span>
                <textarea
                  className="input-modern rp-textarea"
                  placeholder="Explain why the claim should be re-evaluated, referring to the payer's notes…"
                  value={description}
                  readOnly={readOnly}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>
          </Section>

          <Section
            id="rp-docs"
            title="Supporting evidence"
            meta="Attach anything the payer's rejection notes ask for"
            tip="An appeal without new evidence is usually rejected again."
          >
            <div className="pd-docs">
              <DocumentChecklist
                documents={supportingDocs}
                onUpload={handleUpload}
                onAddDocument={addDocument}
                onRenameDocument={renameDocument}
                onRemoveDocument={removeDocument}
                readOnly={readOnly}
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
              <li className={explanation ? "is-ok" : "is-todo"}>
                {explanation ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>Explanation</span>
              </li>
              <li className={attached ? "is-ok" : "is-soft"}>
                {attached ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>Evidence attached</span>
                <span className="pd-ready-note">{attached}</span>
              </li>
            </ul>
            <div className="pd-submit">
              {submitError && (
                <NextStep tone="bad" title="Not sent">
                  {submitError} Fix what the message names and send again.
                </NextStep>
              )}
              <Button
                write
                variant="primary"
                icon={Send}
                disabled={!canSend}
                disabledReason={submitting ? "Sending…" : !claimId ? "This case has no claim to appeal." : "Write the reason for the appeal first."}
                onClick={handleSubmit}
                className="pd-submit-btn"
              >
                {submitting ? "Submitting…" : "Submit appeal"}
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
