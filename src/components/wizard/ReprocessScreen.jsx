import { useState, useEffect } from "react";
import StageBar from "../case/StageBar";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { usePoll } from "../../hooks/usePoll";
import { DocumentChecklist, LoadingBlock, NextStep, formatMoney } from "../Common";
import { formatDate } from "../../format.js";
import Dropdown from "../Dropdown";
import { projectCaseStatus } from "../case/caseStages";
import CaseChecklist from "../case/CaseChecklist";
import { useCasePane } from "../case/useCasePane";
import { buildReprocessChecklist, firstReprocessItem } from "../case/reprocessChecklist";

const POLL_INTERVAL_MS = 7000;
const REASON_CODES = [
  { value: "claimrejected", label: "Reprocess request due to claim rejected by payer", short: "Claim rejected" },
  { value: "rejectiondisputed", label: "Rejection disputed, additional evidence provided", short: "Disputed" },
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
  const { picked, paneRef, openItem } = useCasePane();
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
    ? { tone: "bad", label: "Not delivered", text: "The payer never received the appeal." }
    : isNotFound
      ? { tone: "warn", label: "No record", text: "The payer has no record of this request yet. Check again, or look at the Audit trail." }
      : !isComplete
        ? { tone: "info", label: "Awaiting payer", text: "This can take a few days. You can leave this page; the answer appears here and in the Work Queue." }
        : appealApproved
          ? { tone: decision === "PARTIALLY_APPROVED" ? "warn" : "ok", label: decision === "PARTIALLY_APPROVED" ? "Partially approved" : "Appeal accepted", text: "Track the money on the Payment step." }
          : decision === "QUERIED"
            ? { tone: "warn", label: "Query raised", text: "The payer has a question about the appeal. Answer it on the Claim step." }
            : decision === "REJECTED"
              ? { tone: "bad", label: "Appeal rejected", text: "You can appeal again with new evidence or contact the payer directly; if the decision stands, the patient may have to pay." }
              : { tone: "info", label: "Decision received", text: "The payer gave no clear decision. Read its notes and the Audit trail." };

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

  const claimResponse = status?.claim_response;
  const totals = claimResponse?.totals || {};
  const lines = claimResponse?.items || [];
  const notes = status?.process_notes || [];
  const approved = totals.benefit?.value ?? totals.eligible?.value;
  const cutLines = lines.filter((line) => {
    const adj = line.adjudication || {};
    const allowed = adj.benefit?.value ?? adj.eligible?.value;
    return allowed != null && adj.submitted?.value != null && allowed < adj.submitted.value;
  }).length;
  const noteCount = notes.length + (payerError ? 1 : 0);

  const groups = buildReprocessChecklist({
    sent: !!correlationId,
    reasonShort: REASON_CODES.find((c) => c.value === reasonCode)?.short,
    explained: !!explanation,
    attached,
    failed: isFailed,
    notFound: isNotFound,
    complete: isComplete,
    approved,
    lines: lines.length,
    cut: cutLines,
    notes: noteCount,
    readNotes: decision === "REJECTED" || decision === "QUERIED",
  });
  const blockers = groups.flatMap((g) => g.rows).filter((row) => row.blocks);
  const open = firstReprocessItem(groups, picked);
  const paneFor = (id) => ({ hidden: open !== id });
  const backToClaim = (
    <button type="button" className="cv-btn" onClick={() => navigate("../claim")}><ArrowLeft size={14} /> Back to claim</button>
  );

  if (correlationId) {
    return (
      <div className="cv-elig">
        <div className={`cv-notice cv-verdict is-${verdict.tone}`}>
          <div className="cv-verdict-row">
            <StageBar ctx={ctx} />
            <span className={`cv-chip is-${verdict.tone}`}>{verdict.label}</span>
            <span className="cv-notice-body">{verdict.text}</span>
            <span className="cv-verdict-actions">
              {backToClaim}
              {isFailed ? (
                <button type="button" className="cv-btn is-primary" onClick={handleRetry}>Try again</button>
              ) : isNotFound ? (
                <button type="button" className="cv-btn is-primary" onClick={checkAgain}>Check again</button>
              ) : appealApproved ? (
                <button type="button" className="cv-btn is-primary" onClick={() => navigate("../payment")}>Go to payment <ArrowRight size={14} /></button>
              ) : decision === "QUERIED" ? (
                <button type="button" className="cv-btn is-primary" onClick={() => navigate("../claim")}>Respond on the claim <ArrowRight size={14} /></button>
              ) : decision === "REJECTED" && canAppeal && !readOnly ? (
                <button type="button" className="cv-btn is-primary" onClick={handleRetry}><Send size={15} /> File another appeal</button>
              ) : null}
            </span>
          </div>
          {pollError && <div className="cv-notice-hint cv-verdict-note is-bad"><strong>Not updated:</strong> {pollError} Still trying.</div>}
        </div>

        <div className="cv-work">
          <CaseChecklist groups={groups} open={open} onOpen={openItem} label="Appeal checklist" />

          <div className="cv-work-pane" ref={paneRef}>
            <div {...paneFor("delivery")}>
              <section className="cv-card" aria-label="Delivery">
                <div className="cv-card-head"><h2 className="cv-card-title">Delivery</h2></div>
                <p className="cv-card-intro">{failureMessage}</p>
              </section>
            </div>

            <div {...paneFor("record")}>
              <section className="cv-card" aria-label="Payer's record">
                <div className="cv-card-head"><h2 className="cv-card-title">Payer's record</h2></div>
                <p className="cv-card-intro">{verdict.text}</p>
              </section>
            </div>

            <div {...paneFor("waiting")}>
              <section className="cv-card" aria-label="Payer's answer">
                <div className="cv-card-head">
                  <h2 className="cv-card-title">Payer's answer</h2>
                  <span className="cv-card-meta">Checking every {POLL_INTERVAL_MS / 1000} seconds</span>
                </div>
                <p className="cv-card-intro">Waiting for the payer's decision.</p>
              </section>
            </div>

            <div {...paneFor("amounts")}>
              <section className="cv-card" aria-label="Amounts">
                <div className="cv-card-head">
                  <h2 className="cv-card-title">Amounts</h2>
                  {claimResponse?.outcome && <span className="cv-card-meta">Outcome: {claimResponse.outcome}</span>}
                </div>
                {approved == null ? (
                  <p className="cv-card-intro">The payer's answer gives no amounts.</p>
                ) : (
                  <div className="cv-card-body">
                    {[
                      ["Claimed", totals.submitted],
                      ["Eligible", totals.eligible],
                      ["Co-pay", totals.copay],
                      ["Approved", { value: approved }],
                    ].filter(([, money]) => money?.value != null).map(([label, money]) => (
                      <div key={label} className="cv-kv"><span>{label}</span><span>{formatMoney(money.value)}</span></div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {lines.length > 0 && (
              <div {...paneFor("lines")}>
                <section className="cv-card" aria-label="Line by line">
                  <div className="cv-card-head"><h2 className="cv-card-title">Line by line</h2></div>
                  <div className="cv-tw cv-in-card">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 70 }}>Line</th>
                          <th style={{ width: 120 }}>Claimed</th>
                          <th style={{ width: 120 }}>Eligible</th>
                          <th style={{ width: 120 }}>Approved</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, i) => {
                          const adj = line.adjudication || {};
                          return (
                            <tr key={line.sequence ?? i}>
                              <td>{line.sequence ?? i + 1}</td>
                              <td>{formatMoney(adj.submitted?.value)}</td>
                              <td>{formatMoney(adj.eligible?.value)}</td>
                              <td>{formatMoney(adj.benefit?.value ?? adj.eligible?.value)}</td>
                              <td>{adj.eligible?.reason || adj.benefit?.reason || adj.reason?.text || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {noteCount > 0 && (
              <div {...paneFor("notes")}>
                <section className="cv-card" aria-label="Payer notes">
                  <div className="cv-card-head"><h2 className="cv-card-title">Payer notes</h2></div>
                  <div className="cv-card-body">
                    <ol className="ds-notes">
                      {notes.map((n, i) => (
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
                  </div>
                </section>
              </div>
            )}

            <div {...paneFor("details")}>
              <section className="cv-card" aria-label="Appeal details">
                <div className="cv-card-head"><h2 className="cv-card-title">Appeal details</h2></div>
                <div className="cv-card-body">
                  {[
                    ["Reason given", sentReason ? reasonName(sentReason) : null],
                    ["Explanation", sentId ? explanation : null],
                    ["Documents", sentId ? String(attached) : null],
                    ["Sent", status?.submitted_at ? formatDate(status.submitted_at) : null],
                    ["Request ID", correlationId],
                  ].filter(([, value]) => value).map(([label, value]) => (
                    <div key={label} className="cv-kv"><span>{label}</span><span>{value}</span></div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const barState = readOnly ? ["Not sent", "is-todo", "info"] : blockers.length > 0 ? [`${blockers.length} must be done`, "is-warn", "warn"] : ["Ready to send", "is-ok", "ok"];

  return (
    <div className="cv-elig">
      <div className={`cv-notice cv-verdict is-${barState[2]}`}>
        <div className="cv-verdict-row">
          <StageBar ctx={ctx} />
          <span className={`cv-chip ${barState[1]}`}>{barState[0]}</span>
          <span className="cv-notice-body">Appeal of claim {claimId ? <strong>{claimId}</strong> : null}</span>
          <span className="cv-verdict-actions">
            {backToClaim}
            {!readOnly && (
              <button
                type="button"
                className="cv-btn is-primary"
                disabled={!canSend}
                title={canSend || submitting ? undefined : !claimId ? "This case has no claim to appeal." : "Finish the items marked in red first."}
                onClick={handleSubmit}
              >
                <Send size={15} /> {submitting ? "Submitting…" : "Submit appeal"}
              </button>
            )}
          </span>
        </div>
        {submitError && <div className="cv-notice-hint cv-verdict-note is-bad"><strong>Not sent:</strong> {submitError} Fix what the message names and send again.</div>}
      </div>

      <div className="cv-work">
        <CaseChecklist groups={groups} open={open} onOpen={openItem} label="Appeal checklist" />

        <div className="cv-work-pane" ref={paneRef}>
          <div {...paneFor("reason")}>
            <section className="cv-card" aria-label="Reason">
              <div className="cv-card-head"><h2 className="cv-card-title">Reason</h2></div>
              <div className="cv-card-body">
                {readOnly ? reasonLabel : <Dropdown compact ariaLabel="Appeal reason" value={reasonCode} options={REASON_CODES} onChange={setReasonCode} />}
              </div>
            </section>
          </div>

          <div {...paneFor("explanation")}>
            <section className="cv-card" aria-label="Explanation">
              <div className="cv-card-head"><h2 className="cv-card-title">Explanation</h2></div>
              <p className="cv-card-intro">Say in plain words why the payer should look again, and point to the evidence you attach.</p>
              <div className="cv-card-body">
                <textarea
                  className="input-modern rp-textarea"
                  aria-label="Explanation"
                  placeholder="Explain why the claim should be re-evaluated, referring to the payer's notes…"
                  value={description}
                  readOnly={readOnly}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </section>
          </div>

          <div {...paneFor("documents")}>
            <section className="cv-card" aria-label="Documents">
              <div className="cv-card-head"><h2 className="cv-card-title">Documents</h2></div>
              <p className="cv-card-intro">An appeal without new evidence is usually rejected again. Attach anything the payer's rejection notes ask for.</p>
              <div className="cv-card-body">
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
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
