import { useState, useEffect } from "react";
import {
  CheckCircle2, Paperclip, FileText, ExternalLink, Circle, Send,
} from "lucide-react";
import { api } from "../api";
import { resolveAction } from "../api/actionMap";
import { Button, QueryResponseFields } from "./Common";
import { Drawer } from "./Overlay";
import { formatDateTime, humanize, priorityLabel, safeHref } from "../format.js";
import { buildActionBody, documentFromFile, carriesDocuments } from "../queryResponse.js";
import { useNavigate } from "react-router-dom";
import PayerName from "./PayerName";

export const PRIORITY_CONFIG = {
  urgent: { badge: "badge-error" },
  asap:   { badge: "badge-error" },
  stat:   { badge: "badge-error" },
  routine:{ badge: "badge-info" },
};

// Two timestamps within a minute of each other are the same moment.
const sameMoment = (a, b) => !!a && !!b && Math.abs(new Date(a) - new Date(b)) < 60_000;

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

export function parseDocumentsFromTaskInputs(taskInputs) {
  if (!taskInputs) return [];
  return Object.entries(taskInputs)
    .filter(([k]) => !NON_DOCUMENT_KEYS.has(String(k).toLowerCase()))
    .map(([code, name]) => ({ code, name: typeof name === "string" ? name : code }));
}

export function priorityBadge(priority) {
  const cfg = PRIORITY_CONFIG[priority?.toLowerCase()] ?? { badge: "badge-info" };
  return <span className={`badge-modern ${cfg.badge}`}>{priorityLabel(priority) || "-"}</span>;
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
  // `acknowledged` is only the receipt the backend auto-sends to the payer; it
  // says nothing about whether the hospital has replied. A query is answered
  // once its review task is closed (or a reply was just sent from here).
  const inbound = detail?.direction !== "outbound";
  const answered =
    respondResult?.success ||
    (!reviewTask && !!detail?.completed_tasks?.some((t) => t.task_type === "review_communication"));
  // A task with its own document action is answered through "Required action".
  // Only a query takes an answer; a notification is acknowledged, a note is read.
  const isQuery = !detail?.kind || detail.kind === "query";
  const canReply = inbound && isQuery && !answered && !actionable;
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
    <Drawer
      open={open}
      onClose={onClose}
      width={600}
      stack
      title="Communication detail"
      titleExtra={
        <>
          {detail?.reason_code && <span className={`badge-modern ${reasonCfg.badge || "badge-info"}`}>{reasonCfg.label || detail.reason_code}</span>}
          {detail?.priority && priorityBadge(detail.priority)}
        </>
      }
      footer={
        <>
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
        </>
      }
    >
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
                    <DetailField label="Payer" value={(detail.payer_name || detail.payer_id) && <PayerName id={detail.payer_id} name={detail.payer_name} />} />
                    <DetailField label="Claim Reference" value={detail.claim_reference} />
                    <DetailField label="Subject" value={detail.subject} />
                    <DetailField label="Requested by" value={detail.task_requester} />
                    <DetailField label="Received" value={formatDateTime(detail.received_at || detail.sent_at)} />
                    {!sameMoment(detail.sent_at, detail.received_at) && detail.received_at && (
                      <DetailField label="Sent by payer" value={formatDateTime(detail.sent_at)} />
                    )}
                    {detail.comm_status && <DetailField label="Message status" value={humanize(detail.comm_status)} />}
                    {detail.authored_on && !sameMoment(detail.authored_on, detail.received_at || detail.sent_at) && (
                      <DetailField label="Task created" value={formatDateTime(detail.authored_on)} />
                    )}
                    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", paddingTop: "8px", borderTop: "1px solid var(--border-color)", marginTop: "var(--space-1)", flexWrap: "wrap", fontSize: "12.5px" }}>
                      {inbound && reviewTask ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, color: "var(--warning)" }}>
                          <Circle size={11} /> Awaiting your reply
                        </span>
                      ) : answered ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
                          <CheckCircle2 size={12} color="var(--success)" /> Answered
                        </span>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{inbound ? "Reply optional" : "Sent to payer"}</span>
                      )}
                      {detail.acknowledged && (
                        <span style={{ color: "var(--text-muted)" }} title={detail.ack_correlation_id ? `ACK ${detail.ack_correlation_id}` : undefined}>
                          · Receipt acknowledged to payer{detail.acknowledged_at ? ` ${formatDateTime(detail.acknowledged_at)}` : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {detail.payload?.length > 0 && (
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Message from Payer</div>
                      {detail.payload.map((p, i) => (
                        <div key={i} style={{ padding: "14px 16px", background: "var(--bg-main)", borderRadius: "10px", border: "1px solid var(--border-color)", marginBottom: "var(--space-2)", fontSize: "13px", lineHeight: 1.6 }}>
                          {p.content_string && <p style={{ margin: 0 }}>{p.content_string}</p>}
                          {safeHref(p.content_attachment) && (
                            <a href={safeHref(p.content_attachment)} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--primary)", fontWeight: 600, textDecoration: "none", marginTop: p.content_string ? "8px" : 0 }}>
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

                  {canReply && (
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
    </Drawer>
  );
}
