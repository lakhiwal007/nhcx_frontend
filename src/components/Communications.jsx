import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, MessageSquare, AlertTriangle, X, CheckCircle2,
  Paperclip, FileText, Clock, ExternalLink, Circle, AlertCircle, Send,
} from "lucide-react";
import { api } from "../api";
import { resolveAction } from "../api/actionMap";
import { PageHeader, Card, Button, Input } from "./Common";
import SendCommunicationModal, { OUTBOUND_COMMUNICATIONS_ENABLED } from "./SendCommunicationModal";
import { useNavigate } from "react-router-dom";

const PRIORITY_CONFIG = {
  urgent: { badge: "badge-error",   label: "URGENT"  },
  asap:   { badge: "badge-error",   label: "ASAP"    },
  stat:   { badge: "badge-error",   label: "STAT"    },
  routine:{ badge: "badge-info",    label: "ROUTINE" },
};

const REASON_CONFIG = {
  tatquery:      { badge: "badge-warning", label: "TAT Dispute",      hint: "Time-sensitive - payer is disputing turnaround. Open the referenced claim and respond fast.", borderColor: "var(--warning)" },
  additionalinfo:{ badge: "badge-error",   label: "Additional Info",  hint: "The payer needs more documents before they can proceed with this claim. Submit the requested documents below to unblock it.", borderColor: "var(--error)" },
  grievance:     { badge: "badge-error",   label: "Grievance",        hint: "Needs a human owner. Resolve outside NHCX, then mark this task complete.", borderColor: "var(--error)" },
  policychange:  { badge: "badge-warning", label: "Policy Change",    hint: "Re-fetch policies for this patient before the next workflow action.", borderColor: "var(--warning)" },
  walletupdate:  { badge: "badge-info",    label: "Wallet Update",    hint: "Informational - refresh the case eligibility / benefit view.", borderColor: "var(--info)" },
};

const REFERENCE_KEYS = new Set(["claimNumber", "claimId", "claimnumber", "claimid"]);

function parseDocumentsFromTaskInputs(taskInputs) {
  if (!taskInputs) return [];
  return Object.entries(taskInputs)
    .filter(([k]) => !REFERENCE_KEYS.has(k))
    .map(([code, name]) => ({ code, name: typeof name === "string" ? name : code }));
}

function priorityBadge(priority) {
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

function CommunicationDetailDrawer({ correlationId, open, onClose, onRead, allFacilitiesMode }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState(null);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!open || !correlationId) return;
    setLoading(true);
    setDetail(null);
    setExecuteResult(null);
    api.getCommunicationStatus(correlationId)
      .then((res) => {
        setDetail(res);
        if (!res.provider_read) {
          api.markCommunicationRead(correlationId)
            .then(() => onRead(correlationId))
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, correlationId]);

  const reviewTask = detail?.pending_tasks?.find((t) => t.task_type === "review_communication");
  const taskId = reviewTask?.id ?? reviewTask?.task_id;
  const reasonCfg = REASON_CONFIG[detail?.reason_code] ?? {};
  const isAdditionalInfo = detail?.reason_code === "additionalinfo";
  const taskAction = reviewTask?.action;
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
      const res = method === "GET"
        ? await api.rawGet(url, taskAction.payload_hint ?? {})
        : await api.rawPost(url, taskAction.payload_hint ?? {});
      setExecuteResult({ success: true, correlation_id: res?.correlation_id, message: res?.message });
    } catch (err) {
      setExecuteResult({ success: false, message: err.message });
    } finally {
      setExecuting(false);
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
    if (detail?.cashless_case_id) {
      navigate(`/case/${detail.child_id || detail.claim_id}/`);
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
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", zIndex: 90 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: "min(600px, 95vw)", background: "var(--bg-card)", borderLeft: "1px solid var(--border-color)", zIndex: 91, display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800 }}>Communication Detail</h3>
                {detail?.reason_code && <span className={`badge-modern ${reasonCfg.badge || "badge-info"}`}>{reasonCfg.label || detail.reason_code}</span>}
                {detail?.priority && priorityBadge(detail.priority)}
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                <X size={22} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              {loading && <div className="flex-center py-10"><div className="spinner" /></div>}

              {detail && (
                <>
                  {detail.topic_display && <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.3 }}>{detail.topic_display}</div>}

                  {reasonCfg.hint && (
                    <div style={{ padding: "12px 16px", background: "var(--bg-main)", border: `1px solid ${reasonCfg.borderColor || "var(--border-color)"}`, borderLeft: `4px solid ${reasonCfg.borderColor || "var(--border-color)"}`, borderRadius: "8px", fontSize: "13px", lineHeight: 1.5 }}>
                      {reasonCfg.hint}
                    </div>
                  )}

                  <div className="grid-2-col" style={{ gap: "14px", padding: "16px", background: "var(--bg-main)", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                    <DetailField label="Payer" value={detail.payer_code} />
                    <DetailField label="Claim Reference" value={detail.claim_reference} />
                    <DetailField label="Subject" value={detail.subject} />
                    <DetailField label="Requested by" value={detail.task_requester} />
                    <DetailField label="Sent" value={detail.sent_at ? new Date(detail.sent_at).toLocaleString() : null} />
                    <DetailField label="Received" value={detail.received_at ? new Date(detail.received_at).toLocaleString() : null} />
                    {detail.authored_on && <DetailField label="Task Created" value={new Date(detail.authored_on).toLocaleString()} />}
                    {detail.comm_status && <DetailField label="Status" value={detail.comm_status} />}
                    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", paddingTop: "8px", borderTop: "1px solid var(--border-color)", marginTop: "4px", flexWrap: "wrap" }}>
                      <span className={`badge-modern badge-${detail.provider_read ? "success" : "warning"}`} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {detail.provider_read ? <><CheckCircle2 size={11} /> Read</> : <><Circle size={11} /> Unread</>}
                      </span>
                      <span className="badge-modern badge-success" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <CheckCircle2 size={11} /> Auto-acknowledged
                      </span>
                      {detail.ack_correlation_id && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>ACK: {detail.ack_correlation_id}</span>}
                    </div>
                  </div>

                  {detail.payload?.length > 0 && (
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Message from Payer</div>
                      {detail.payload.map((p, i) => (
                        <div key={i} style={{ padding: "14px 16px", background: "var(--bg-main)", borderRadius: "10px", border: "1px solid var(--border-color)", marginBottom: "8px", fontSize: "13px", lineHeight: 1.6 }}>
                          {p.content_string && <p style={{ margin: 0 }}>{p.content_string}</p>}
                          {p.content_attachment && (
                            <a href={p.content_attachment} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--primary)", fontWeight: 600, textDecoration: "none", marginTop: p.content_string ? "8px" : 0 }}>
                              <Paperclip size={14} /> View Attachment
                            </a>
                          )}
                          {p.content_reference && <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "4px" }}>Ref: {p.content_reference}</div>}
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

                  {isAdditionalInfo && taskAction && (
                    <div style={{ padding: "16px", background: "rgba(239,68,68,0.04)", border: "1px solid var(--error)", borderRadius: "10px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--error)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Required Action</div>
                      <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
                        Submit the documents listed above to the payer to unblock this claim. Once submitted, mark this communication as reviewed to close it from your queue.
                      </div>
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
                          <div style={{ fontWeight: 700, color: executeResult.success ? "var(--success)" : "var(--error)", marginBottom: "4px" }}>
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
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px" }}>Completed Actions</div>
                      {detail.completed_tasks.map((t, i) => (
                        <div key={i} style={{ fontSize: "12px", color: "var(--text-muted)", padding: "6px 10px", background: "var(--bg-main)", borderRadius: "6px", marginBottom: "4px" }}>✓ {t.title}</div>
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
                  disabled={completing || allFacilitiesMode || (isAdditionalInfo && !executeResult?.success)}
                  onClick={handleMarkReviewed}
                  style={{ flex: 1, justifyContent: "center" }}
                  title={
                    allFacilitiesMode
                      ? "Select a facility in Settings to act on this task"
                      : isAdditionalInfo && !executeResult?.success
                        ? "Submit the required documents first"
                        : undefined
                  }
                >
                  {completing ? "Completing…" : "Mark as Reviewed ✓"}
                </Button>
              )}
              {detail?.cashless_case_id && (
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

export default function Communications({ allFacilitiesMode = false }) {
  const [communications, setCommunications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [payerFilter, setPayerFilter] = useState("");
  const [selectedCorrelationId, setSelectedCorrelationId] = useState(null);
  const [showSendModal, setShowSendModal] = useState(false);

  const fetchComms = async (params = {}) => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.listCommunications(params);
      setCommunications(res?.communications || []);
    } catch (_) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchComms(); }, []);

  const handleRead = (correlationId) => {
    setCommunications((prev) =>
      prev.map((c) => c.correlation_id === correlationId ? { ...c, provider_read: true } : c)
    );
  };

  const uniquePayers = [...new Set(communications.map((c) => c.payer_code).filter(Boolean))];
  const unreadCount = communications.filter((c) => !c.provider_read).length;
  const actionNeededCount = communications.filter((c) => c.pending_tasks?.length > 0).length;

  const filteredComms = communications.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      c.topic_display?.toLowerCase().includes(q) ||
      c.payer_code?.toLowerCase().includes(q) ||
      c.claim_reference?.toLowerCase().includes(q) ||
      c.reason_display?.toLowerCase().includes(q) ||
      c.subject?.toLowerCase().includes(q);
    const matchPayer = !payerFilter || c.payer_code === payerFilter;
    return matchSearch && matchPayer;
  });

  return (
    <div className="communications-screen">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <PageHeader title="Payer Communications" subtitle="Review payer-initiated messages, queries, and notices." />
        <div style={{ display: "flex", gap: "10px", marginTop: "4px", alignItems: "center" }}>
          {OUTBOUND_COMMUNICATIONS_ENABLED && (
            <Button variant="outline" size="small" icon={Send} onClick={() => setShowSendModal(true)}>
              Message Payer
            </Button>
          )}
          {unreadCount > 0 && (
            <span style={{ padding: "6px 14px", background: "color-mix(in srgb, var(--info) 12%, transparent)", color: "var(--info)", border: "1px solid var(--info)", borderRadius: "var(--radius-pill)", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap" }}>
              {unreadCount} unread
            </span>
          )}
          {actionNeededCount > 0 && (
            <span style={{ padding: "6px 14px", background: "color-mix(in srgb, var(--error) 12%, transparent)", color: "var(--error)", border: "1px solid var(--error)", borderRadius: "var(--radius-pill)", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap" }}>
              {actionNeededCount} need action
            </span>
          )}
        </div>
      </div>

      {loadError && (
        <div className="inline-error-banner">
          <AlertCircle size={16} />
          Could not load communications. Showing the last known results, if any.
        </div>
      )}

      <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px" }}>
          <Input icon={Search} placeholder="Search topic, payer, claim, subject…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        {uniquePayers.length > 0 && (
          <select className="input-modern" style={{ width: "auto", minWidth: "180px" }} value={payerFilter} onChange={(e) => setPayerFilter(e.target.value)}>
            <option value="">All Payers</option>
            {uniquePayers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex-center py-20 flex-col">
          <div className="spinner mb-4" />
          <p className="text-muted">Loading communications…</p>
        </div>
      ) : filteredComms.length === 0 ? (
        <div className="empty-view" style={{ minHeight: "40vh" }}>
          <MessageSquare size={48} style={{ opacity: 0.3, marginBottom: "16px" }} />
          <h3>No Communications</h3>
          <p className="text-muted mt-2">No payer messages match your filters.</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filteredComms.map((comm) => {
            const reasonCfg = REASON_CONFIG[comm.reason_code] ?? {};
            const hasAction = comm.pending_tasks?.length > 0;
            const isUnread = !comm.provider_read;
            return (
              <Card key={comm.correlation_id}>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: "42px", height: "42px", borderRadius: "var(--radius-md)", background: hasAction ? "color-mix(in srgb, var(--error) 12%, transparent)" : isUnread ? "color-mix(in srgb, var(--info) 12%, transparent)" : "var(--primary-light)", color: hasAction ? "var(--error)" : isUnread ? "var(--info)" : "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <MessageSquare size={20} />
                    </div>
                    {isUnread && (
                      <div style={{ position: "absolute", top: "-3px", right: "-3px", width: "10px", height: "10px", borderRadius: "50%", background: "var(--info)", border: "2px solid var(--bg-card)" }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "5px", flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, fontSize: "14px", fontWeight: isUnread ? 800 : 600 }}>{comm.topic_display}</h3>
                      {comm.priority && priorityBadge(comm.priority)}
                      {comm.reason_code && <span className={`badge-modern ${reasonCfg.badge || "badge-info"}`}>{reasonCfg.label || comm.reason_display || comm.reason_code}</span>}
                      {hasAction && <span style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: "var(--error)", fontWeight: 700 }}><AlertTriangle size={11} /> Action Required</span>}
                    </div>

                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "12px", color: "var(--text-muted)" }}>
                      {comm.facility_name && <span><strong style={{ color: "var(--text-main)" }}>Facility:</strong> {comm.facility_name}</span>}
                      <span><strong style={{ color: "var(--text-main)" }}>Payer:</strong> {comm.payer_code}</span>
                      {comm.claim_reference && <span><strong style={{ color: "var(--text-main)" }}>Claim:</strong> {comm.claim_reference}</span>}
                      {comm.subject && <span>{comm.subject}</span>}
                      <span><Clock size={11} style={{ display: "inline", marginRight: "3px" }} />{new Date(comm.sent_at).toLocaleString()}</span>
                      {comm.provider_read
                        ? <span style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: "3px" }}><CheckCircle2 size={11} /> Read</span>
                        : <span style={{ color: "var(--info)", display: "flex", alignItems: "center", gap: "3px" }}><Circle size={11} /> Unread</span>
                      }
                    </div>

                    {hasAction && (
                      <div style={{ marginTop: "8px", padding: "7px 12px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,66,0.25)", borderRadius: "8px", fontSize: "12px" }}>
                        <strong style={{ color: "var(--error)" }}>{comm.pending_tasks.length} task{comm.pending_tasks.length > 1 ? "s" : ""}:</strong>{" "}
                        {comm.pending_tasks.map((t) => t.title).join(", ")}
                      </div>
                    )}
                  </div>

                  <Button variant={hasAction ? "primary" : "outline"} size="small" onClick={() => setSelectedCorrelationId(comm.correlation_id)} style={{ flexShrink: 0 }}>
                    {hasAction ? "Review & Act" : "View"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </motion.div>
      )}

      <CommunicationDetailDrawer
        correlationId={selectedCorrelationId}
        open={!!selectedCorrelationId}
        onClose={() => setSelectedCorrelationId(null)}
        onRead={handleRead}
        allFacilitiesMode={allFacilitiesMode}
      />

      <SendCommunicationModal open={showSendModal} onClose={() => setShowSendModal(false)} />
    </div>
  );
}
