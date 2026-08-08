import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, CheckCircle2, Paperclip, FileText, ExternalLink, Circle, Send,
} from "lucide-react";
import { api } from "../api";
import { resolveAction } from "../api/actionMap";
import { Button, QueryResponseFields } from "./Common";
import { formatDateTime } from "../format.js";
import { buildActionBody, documentFromFile, carriesDocuments } from "../queryResponse.js";
import { useNavigate } from "react-router-dom";

export const PRIORITY_CONFIG = {
  urgent: { badge: "badge-error",   label: "URGENT"  },
  asap:   { badge: "badge-error",   label: "ASAP"    },
  stat:   { badge: "badge-error",   label: "STAT"    },
  routine:{ badge: "badge-info",    label: "ROUTINE" },
};

export const REASON_CONFIG = {
  tatquery:      { badge: "badge-warning", label: "TAT Dispute",      hint: "Time-sensitive - payer is disputing turnaround. Open the referenced claim and respond fast.", borderColor: "var(--warning)" },
  additionalinfo:{ badge: "badge-error",   label: "Additional Info",  hint: "The payer needs more documents before they can proceed with this claim. Submit the requested documents below to unblock it.", borderColor: "var(--error)" },
  grievance:     { badge: "badge-error",   label: "Grievance",        hint: "Needs a human owner. Resolve outside NHCX, then mark this task complete.", borderColor: "var(--error)" },
  policychange:  { badge: "badge-warning", label: "Policy Change",    hint: "Re-fetch policies for this patient before the next workflow action.", borderColor: "var(--warning)" },
  walletupdate:  { badge: "badge-info",    label: "Wallet Update",    hint: "Informational - refresh the case eligibility / benefit view.", borderColor: "var(--info)" },
};

export const CATEGORY_LABELS = {
  alert: "Payer Alert",
  notification: "Notification",
  reminder: "Reminder",
  instruction: "Instruction",
};

const NON_DOCUMENT_KEYS = new Set(["claimnumber", "claimid", "include", "_include", "payload", "subject"]);

export function commHeadline(comm) {
  if (!comm) return "";
  if (comm.topic_display) return comm.topic_display;
  if (comm.reason_display) return comm.reason_display;
  const reasonCfg = REASON_CONFIG[comm.reason_code];
  if (reasonCfg) return reasonCfg.label;
  if (comm.category_display) return comm.category_display;
  const category = CATEGORY_LABELS[String(comm.category || "").toLowerCase()];
  if (category) return category;
  const payer = comm.payer_name || comm.payer_id;
  return payer ? `Message from ${payer}` : "Payer message";
}

export function commPreview(comm) {
  if (comm?.subject) return comm.subject;
  return comm?.payload?.find((p) => p.content_string)?.content_string || "";
}

export function commHasAttachment(comm) {
  return !!comm?.payload?.some((p) => p.content_attachment);
}

export function commTone(comm) {
  if (comm?.pending_tasks?.length > 0) return "action";
  if (!comm?.provider_read) return "unread";
  return "read";
}

export function parseDocumentsFromTaskInputs(taskInputs) {
  if (!taskInputs) return [];
  return Object.entries(taskInputs)
    .filter(([k]) => !NON_DOCUMENT_KEYS.has(String(k).toLowerCase()))
    .map(([code, name]) => ({ code, name: typeof name === "string" ? name : code }));
}

export function priorityBadge(priority) {
  const cfg = PRIORITY_CONFIG[priority?.toLowerCase()] ?? { badge: "badge-info", label: priority?.toUpperCase() ?? "-" };
  return <span className={`badge-modern ${cfg.badge}`}>{cfg.label}</span>;
}

function DetailField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "3px" }}>{label}</div>
      <div style={{ fontSize: "13px", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

export default function CommunicationDetailDrawer({ correlationId, open, onClose, onRead, allFacilitiesMode, showOpenCase = true }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [responseAnswer, setResponseAnswer] = useState("");
  const [responseDoc, setResponseDoc] = useState([]);
  const [respondMessage, setRespondMessage] = useState("");
  const [respondDocs, setRespondDocs] = useState([]);
  const [responding, setResponding] = useState(false);
  const [respondResult, setRespondResult] = useState(null);

  useEffect(() => {
    if (!open || !correlationId) return;
    setLoading(true);
    setDetail(null);
    setExecuteResult(null);
    setResponseAnswer("");
    setResponseDoc([]);
    setRespondMessage("");
    setRespondDocs([]);
    setRespondResult(null);
    api.getCommunicationStatus(correlationId)
      .then((res) => {
        setDetail(res);
        if (!res.provider_read) {
          api.markCommunicationRead(correlationId)
            .then(() => onRead?.(correlationId))
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, correlationId]);

  const reviewTask = detail?.pending_tasks?.find((t) => t.task_type === "review_communication");
  const taskId = reviewTask?.id ?? reviewTask?.task_id;
  const reasonCfg = REASON_CONFIG[detail?.reason_code] ?? {};
  const taskAction = reviewTask?.action;
  const actionable = !!taskAction && taskAction.code !== "review_communication";
  const respondingDisabled =
    responding || allFacilitiesMode || (!respondMessage.trim() && respondDocs.length === 0);
  const requiredDocs = reviewTask?.required_documents?.length
    ? reviewTask.required_documents
    : parseDocumentsFromTaskInputs(detail?.task_inputs);

  const handleExecuteAction = async () => {
    if (!taskAction) return;
    setExecuting(true);
    setExecuteResult(null);
    try {
      // Resolve method+URL via stable action.code (ACTION_MAP); fall back to
      // the DB-stored action.endpoint (assumed POST) only when unknown.
      const { method, url } = resolveAction(taskAction);
      const hint = taskAction.payload_hint ?? {};
      const body = carriesDocuments(taskAction.code)
        ? {
            ...hint,
            ...buildActionBody(taskAction.code, {
              claim_id: hint.claim_id ?? detail?.claim_id,
              cashless_case_id: hint.cashless_case_id ?? detail?.cashless_case_id,
              answer: responseAnswer,
              docs: responseDoc.map(documentFromFile),
            }),
          }
        : hint;
      const res = method === "GET"
        ? await api.rawGet(url, hint)
        : await api.rawPost(url, body);
      setExecuteResult({ success: res?.status !== "failed", correlation_id: res?.correlation_id, message: res?.message });
    } catch (err) {
      setExecuteResult({ success: false, message: err.message });
    } finally {
      setExecuting(false);
    }
  };

  const handleRespond = async () => {
    setResponding(true);
    setRespondResult(null);
    try {
      const res = await api.respondToCommunication(correlationId, {
        message: respondMessage || undefined,
        documents: respondDocs.map((d) => ({
          title: d.title,
          content_type: d.contentType,
          data: d.data,
        })),
      });
      setRespondResult({ success: res?.status !== "failed", message: res?.message });
    } catch (err) {
      setRespondResult({ success: false, message: err.message });
    } finally {
      setResponding(false);
    }
  };

  const handleMarkReviewed = async () => {
    if (!taskId) return;
    setCompleting(true);
    try {
      await api.completeTask(taskId, {
        note: "Reviewed from Communications screen",
        metadata: executeResult?.correlation_id ? { submitted_correlation_id: executeResult.correlation_id } : {},
      });
      onClose();
    } catch (_) {
    } finally {
      setCompleting(false);
    }
  };

  const handleOpenCase = () => {
    if (detail?.cashless_case_id && detail?.child_id) {
      navigate(`/case/${detail.child_id}/`, {
        state: { cashless_case_id: detail.cashless_case_id, claim_id: detail.claim_id ?? null },
      });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-overlay"
            style={{ position: "fixed", inset: 0, zIndex: 90 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="glass-panel"
            style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: "min(600px, 95vw)", zIndex: 91, display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800 }}>Communication Detail</h3>
                {detail?.reason_code && <span className={`badge-modern ${reasonCfg.badge || "badge-info"}`}>{reasonCfg.label || detail.reason_code}</span>}
                {detail?.priority && priorityBadge(detail.priority)}
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                <X size={22} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
              {loading && <div className="flex-center py-10"><div className="spinner" /></div>}

              {detail && (
                <>
                  <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.3 }}>{commHeadline(detail)}</div>

                  {reasonCfg.hint && (
                    <div style={{ padding: "12px 16px", background: "var(--bg-main)", border: `1px solid ${reasonCfg.borderColor || "var(--border-color)"}`, borderLeft: `4px solid ${reasonCfg.borderColor || "var(--border-color)"}`, borderRadius: "8px", fontSize: "13px", lineHeight: 1.5 }}>
                      {reasonCfg.hint}
                    </div>
                  )}

                  <div className="grid-2-col" style={{ gap: "14px", padding: "var(--space-4)", background: "var(--bg-main)", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                    <DetailField label="Payer" value={detail.payer_name || detail.payer_id} />
                    <DetailField label="Claim Reference" value={detail.claim_reference} />
                    <DetailField label="Subject" value={detail.subject} />
                    <DetailField label="Requested by" value={detail.task_requester} />
                    <DetailField label="Sent" value={detail.sent_at ? formatDateTime(detail.sent_at) : null} />
                    <DetailField label="Received" value={detail.received_at ? formatDateTime(detail.received_at) : null} />
                    {detail.authored_on && <DetailField label="Task Created" value={formatDateTime(detail.authored_on)} />}
                    {detail.comm_status && <DetailField label="Status" value={detail.comm_status} />}
                    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", paddingTop: "8px", borderTop: "1px solid var(--border-color)", marginTop: "var(--space-1)", flexWrap: "wrap" }}>
                      <span className={`badge-modern badge-${detail.provider_read ? "success" : "warning"}`} style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                        {detail.provider_read ? <><CheckCircle2 size={11} /> Read</> : <><Circle size={11} /> Unread</>}
                      </span>
                      <span className={`badge-modern badge-${detail.acknowledged ? "success" : "warning"}`} style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                        {detail.acknowledged
                          ? <><CheckCircle2 size={11} /> Answered</>
                          : <><Circle size={11} /> Awaiting reply</>}
                      </span>
                      {detail.ack_correlation_id && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>ACK: {detail.ack_correlation_id}</span>}
                    </div>
                  </div>

                  {detail.payload?.length > 0 && (
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Message from Payer</div>
                      {detail.payload.map((p, i) => (
                        <div key={i} style={{ padding: "14px 16px", background: "var(--bg-main)", borderRadius: "10px", border: "1px solid var(--border-color)", marginBottom: "var(--space-2)", fontSize: "13px", lineHeight: 1.6 }}>
                          {p.content_string && <p style={{ margin: 0 }}>{p.content_string}</p>}
                          {p.content_attachment && (
                            <a href={p.content_attachment} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--primary)", fontWeight: 600, textDecoration: "none", marginTop: p.content_string ? "8px" : 0 }}>
                              <Paperclip size={14} /> View Attachment
                            </a>
                          )}
                          {p.content_reference && <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "var(--space-1)" }}>Ref: {p.content_reference}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {requiredDocs.length > 0 && (
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Documents Requested ({requiredDocs.length})</div>
                      {requiredDocs.map((doc, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", background: "var(--bg-main)", border: "1px solid var(--border-color)", borderRadius: "8px", marginBottom: "6px", fontSize: "13px" }}>
                          <FileText size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 600 }}>{doc.name || doc.display}</span>
                          <code style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>{doc.code}</code>
                        </div>
                      ))}
                    </div>
                  )}

                  {detail?.direction !== "outbound" && !detail?.acknowledged && (
                    <div style={{ padding: "var(--space-4)", background: "var(--bg-main)", border: "1px solid var(--border-color)", borderRadius: "10px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>
                        Reply To The Payer
                      </div>
                      <div style={{ fontSize: "12.5px", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
                        Attach the documents the payer asked for. This answers their request directly,
                        whether it concerns the preauth or the claim.
                      </div>
                      {!respondResult ? (
                        <>
                          <QueryResponseFields
                            label="Message To Payer"
                            placeholder="Add a note for the payer…"
                            answer={respondMessage}
                            onAnswerChange={setRespondMessage}
                            documents={respondDocs}
                            onDocumentsChange={setRespondDocs}
                          />
                          <Button
                            variant="primary"
                            icon={Send}
                            disabled={respondingDisabled}
                            title={allFacilitiesMode ? "Select a facility in Settings to reply" : undefined}
                            onClick={handleRespond}
                            style={{ justifyContent: "center" }}
                          >
                            {responding ? "Sending…" : "Send Response"}
                          </Button>
                        </>
                      ) : (
                        <div style={{ padding: "10px 14px", background: respondResult.success ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${respondResult.success ? "var(--success)" : "var(--error)"}`, borderRadius: "8px", fontSize: "13px" }}>
                          <div style={{ fontWeight: 700, color: respondResult.success ? "var(--success)" : "var(--error)" }}>
                            {respondResult.success ? "Response sent" : "Could not send response"}
                          </div>
                          {respondResult.message && (
                            <div style={{ color: "var(--text-muted)", marginTop: "var(--space-1)" }}>{respondResult.message}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {actionable && (
                    <div style={{ padding: "var(--space-4)", background: "rgba(239,68,68,0.04)", border: "1px solid var(--error)", borderRadius: "10px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--error)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Required Action</div>
                      <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
                        Submit the documents listed above to the payer to unblock this claim. Once submitted, mark this communication as reviewed to close it from your queue.
                      </div>
                      {!executeResult && carriesDocuments(taskAction.code) && (
                        <QueryResponseFields
                          answer={responseAnswer}
                          onAnswerChange={setResponseAnswer}
                          documents={responseDoc}
                          onDocumentsChange={setResponseDoc}
                        />
                      )}
                      {!executeResult ? (
                        <Button
                          variant="primary"
                          disabled={executing || allFacilitiesMode}
                          title={allFacilitiesMode ? "Select a facility in Settings to act on this task" : undefined}
                          onClick={handleExecuteAction}
                          style={{ justifyContent: "center" }}
                        >
                          {executing ? "Submitting…" : taskAction.label}
                        </Button>
                      ) : (
                        <div style={{ padding: "10px 14px", background: executeResult.success ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${executeResult.success ? "var(--success)" : "var(--error)"}`, borderRadius: "8px", fontSize: "13px" }}>
                          <div style={{ fontWeight: 700, color: executeResult.success ? "var(--success)" : "var(--error)", marginBottom: "var(--space-1)" }}>
                            {executeResult.success ? "Submitted successfully" : "Submission failed"}
                          </div>
                          {executeResult.correlation_id && <code style={{ fontSize: "11px" }}>{executeResult.correlation_id}</code>}
                          {executeResult.message && <div style={{ color: "var(--text-muted)" }}>{executeResult.message}</div>}
                        </div>
                      )}
                    </div>
                  )}

                  {detail.completed_tasks?.length > 0 && (
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "var(--space-2)" }}>Completed Actions</div>
                      {detail.completed_tasks.map((t, i) => (
                        <div key={i} style={{ fontSize: "12px", color: "var(--text-muted)", padding: "6px 10px", background: "var(--bg-main)", borderRadius: "6px", marginBottom: "var(--space-1)" }}>✓ {t.title}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-color)", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {taskId && (
                <Button
                  variant="primary"
                  disabled={completing || allFacilitiesMode || (actionable && !executeResult?.success)}
                  onClick={handleMarkReviewed}
                  style={{ flex: 1, justifyContent: "center" }}
                  title={
                    allFacilitiesMode
                      ? "Select a facility in Settings to act on this task"
                      : actionable && !executeResult?.success
                        ? "Submit the required documents first"
                        : undefined
                  }
                >
                  {completing ? "Completing…" : "Mark as Reviewed ✓"}
                </Button>
              )}
              {showOpenCase && detail?.cashless_case_id && detail?.child_id && (
                <Button variant="outline" icon={ExternalLink} onClick={handleOpenCase}>Open Case</Button>
              )}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
