import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, MessageSquare, AlertTriangle, X, CheckCircle2,
  Paperclip, FileText, Clock, ExternalLink, Circle, AlertCircle, Send, LayoutGrid, List
} from "lucide-react";
import { api } from "../api";
import { resolveAction } from "../api/actionMap";
import { Card, Button, Input, EmptyState, LoadingBlock, TablePagination, QueryResponseFields } from "./Common";
import { formatDateTime, formatRelative } from "../format.js";
import { buildQueryResponseBody, documentFromFile, carriesDocuments } from "../queryResponse.js";
import SendCommunicationModal, { OUTBOUND_COMMUNICATIONS_ENABLED } from "./SendCommunicationModal";
import { useNavigate } from "react-router-dom";

const PRIORITY_CONFIG = {
  urgent: { badge: "badge-error",   label: "URGENT"  },
  asap:   { badge: "badge-error",   label: "ASAP"    },
  stat:   { badge: "badge-error",   label: "STAT"    },
  routine:{ badge: "badge-info",    label: "ROUTINE" },
};

const COMMS_PAGE_SIZE = 20;

const REASON_CONFIG = {
  tatquery:      { badge: "badge-warning", label: "TAT Dispute",      hint: "Time-sensitive - payer is disputing turnaround. Open the referenced claim and respond fast.", borderColor: "var(--warning)" },
  additionalinfo:{ badge: "badge-error",   label: "Additional Info",  hint: "The payer needs more documents before they can proceed with this claim. Submit the requested documents below to unblock it.", borderColor: "var(--error)" },
  grievance:     { badge: "badge-error",   label: "Grievance",        hint: "Needs a human owner. Resolve outside NHCX, then mark this task complete.", borderColor: "var(--error)" },
  policychange:  { badge: "badge-warning", label: "Policy Change",    hint: "Re-fetch policies for this patient before the next workflow action.", borderColor: "var(--warning)" },
  walletupdate:  { badge: "badge-info",    label: "Wallet Update",    hint: "Informational - refresh the case eligibility / benefit view.", borderColor: "var(--info)" },
};

const CATEGORY_LABELS = {
  alert: "Payer Alert",
  notification: "Notification",
  reminder: "Reminder",
  instruction: "Instruction",
};

const NON_DOCUMENT_KEYS = new Set(["claimnumber", "claimid", "include", "_include", "payload", "subject"]);

function commHeadline(comm) {
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

function commPreview(comm) {
  if (comm?.subject) return comm.subject;
  return comm?.payload?.find((p) => p.content_string)?.content_string || "";
}

function commHasAttachment(comm) {
  return !!comm?.payload?.some((p) => p.content_attachment);
}

function commTone(comm) {
  if (comm?.pending_tasks?.length > 0) return "action";
  if (!comm?.provider_read) return "unread";
  return "read";
}

function payerInitials(comm) {
  const words = String(comm?.payer_name || "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return null;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function parseDocumentsFromTaskInputs(taskInputs) {
  if (!taskInputs) return [];
  return Object.entries(taskInputs)
    .filter(([k]) => !NON_DOCUMENT_KEYS.has(String(k).toLowerCase()))
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
  const [responseAnswer, setResponseAnswer] = useState("");
  const [responseDoc, setResponseDoc] = useState(null);

  useEffect(() => {
    if (!open || !correlationId) return;
    setLoading(true);
    setDetail(null);
    setExecuteResult(null);
    setResponseAnswer("");
    setResponseDoc(null);
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
  const canRespond = carriesDocuments(reviewTask?.action?.code);
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
      const hint = taskAction.payload_hint ?? {};
      const body = carriesDocuments(taskAction.code)
        ? {
            ...hint,
            ...buildQueryResponseBody({
              claim_id: hint.claim_id ?? detail?.claim_id,
              cashless_case_id: hint.cashless_case_id ?? detail?.cashless_case_id,
              answer: responseAnswer,
              docs: responseDoc ? [documentFromFile(responseDoc)] : [],
            }),
          }
        : hint;
      const res = method === "GET"
        ? await api.rawGet(url, hint)
        : await api.rawPost(url, body);
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
                          ? <><CheckCircle2 size={11} /> Auto-acknowledged</>
                          : <><Circle size={11} /> Not acknowledged</>}
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

                  {(isAdditionalInfo || canRespond) && taskAction && (
                    <div style={{ padding: "var(--space-4)", background: "rgba(239,68,68,0.04)", border: "1px solid var(--error)", borderRadius: "10px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--error)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Required Action</div>
                      <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
                        Submit the documents listed above to the payer to unblock this claim. Once submitted, mark this communication as reviewed to close it from your queue.
                      </div>
                      {!executeResult && carriesDocuments(taskAction.code) && (
                        <QueryResponseFields
                          answer={responseAnswer}
                          onAnswerChange={setResponseAnswer}
                          document={responseDoc}
                          onDocumentChange={setResponseDoc}
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
                  disabled={completing || allFacilitiesMode || ((isAdditionalInfo || canRespond) && !executeResult?.success)}
                  onClick={handleMarkReviewed}
                  style={{ flex: 1, justifyContent: "center" }}
                  title={
                    allFacilitiesMode
                      ? "Select a facility in Settings to act on this task"
                      : (isAdditionalInfo || canRespond) && !executeResult?.success
                        ? "Submit the required documents first"
                        : undefined
                  }
                >
                  {completing ? "Completing…" : "Mark as Reviewed ✓"}
                </Button>
              )}
              {detail?.cashless_case_id && detail?.child_id && (
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
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("communications_viewMode") || "grid");
  const [sortBy, setSortBy] = useState("newest");
  const [quickFilter, setQuickFilter] = useState(null);

  useEffect(() => { localStorage.setItem("communications_viewMode", viewMode); }, [viewMode]);

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

  useEffect(() => { fetchComms({ limit: 200 }); }, []);

  const handleRead = (correlationId) => {
    setCommunications((prev) =>
      prev.map((c) => c.correlation_id === correlationId ? { ...c, provider_read: true } : c)
    );
  };

  const uniquePayers = [...new Set(communications.map((c) => c.payer_id).filter(Boolean))];
  const payerLabel = (code) => communications.find((c) => c.payer_id === code)?.payer_name || code;
  const unreadCount = communications.filter((c) => !c.provider_read).length;
  const actionNeededCount = communications.filter((c) => c.pending_tasks?.length > 0).length;

  const [commsPage, setCommsPage] = useState(0);
  const filteredComms = communications.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      c.topic_display?.toLowerCase().includes(q) ||
      c.payer_id?.toLowerCase().includes(q) ||
      c.payer_name?.toLowerCase().includes(q) ||
      c.claim_reference?.toLowerCase().includes(q) ||
      c.reason_display?.toLowerCase().includes(q) ||
      c.subject?.toLowerCase().includes(q);
    const matchPayer = !payerFilter || c.payer_id === payerFilter;
    const matchQuick =
      !quickFilter ||
      (quickFilter === "unread" ? !c.provider_read : c.pending_tasks?.length > 0);
    return matchSearch && matchPayer && matchQuick;
  }).sort((a, b) => {
    if (sortBy === "priority") {
      const pA = a.priority === "urgent" || a.priority === "stat" ? 2 : a.priority === "asap" ? 1 : 0;
      const pB = b.priority === "urgent" || b.priority === "stat" ? 2 : b.priority === "asap" ? 1 : 0;
      if (pA !== pB) return pB - pA;
    }
    const tA = Date.parse(a.sent_at) || 0;
    const tB = Date.parse(b.sent_at) || 0;
    return sortBy === "oldest" ? tA - tB : tB - tA;
  });

  const commsPageCount = Math.max(1, Math.ceil(filteredComms.length / COMMS_PAGE_SIZE));
  const safeCommsPage = Math.min(commsPage, commsPageCount - 1);
  const pagedComms = filteredComms.slice(safeCommsPage * COMMS_PAGE_SIZE, (safeCommsPage + 1) * COMMS_PAGE_SIZE);

  return (
    <div className="communications-screen">
      {loadError && (
        <div className="inline-error-banner">
          <AlertCircle size={16} />
          Could not load communications. Showing the last known results, if any.
        </div>
      )}

      <div className="cm-toolbar">
        <div className="cm-toolbar-search">
          <Input icon={Search} placeholder="Search topic, payer, claim, subject…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        {uniquePayers.length > 0 && (
          <select className="input-modern cm-toolbar-select" value={payerFilter} onChange={(e) => setPayerFilter(e.target.value)}>
            <option value="">All Payers</option>
            {uniquePayers.map((p) => <option key={p} value={p}>{payerLabel(p)}</option>)}
          </select>
        )}
        <select
          className="input-modern cm-toolbar-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="priority">Priority First</option>
        </select>
        <div className="cm-viewtoggle" role="group" aria-label="View mode">
          <button
            type="button"
            title="Grid View"
            aria-pressed={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            title="Table View"
            aria-pressed={viewMode === "table"}
            onClick={() => setViewMode("table")}
          >
            <List size={16} />
          </button>
        </div>
        {OUTBOUND_COMMUNICATIONS_ENABLED && (
          <Button variant="outline" size="small" icon={Send} onClick={() => setShowSendModal(true)}>
            Message Payer
          </Button>
        )}
      </div>

      <div className="cm-resultbar">
        <span className="cm-resultbar-count">
          {filteredComms.length}
          <span> {filteredComms.length === 1 ? "message" : "messages"}</span>
          {filteredComms.length !== communications.length && <em> of {communications.length}</em>}
        </span>
        <div className="cm-resultbar-chips">
          {unreadCount > 0 && (
            <button
              type="button"
              className={`cm-count${quickFilter === "unread" ? " is-on" : ""}`}
              style={{ "--cm-count-tone": "var(--info)" }}
              aria-pressed={quickFilter === "unread"}
              title={quickFilter === "unread" ? "Show all messages" : "Show only unread messages"}
              onClick={() => setQuickFilter((f) => (f === "unread" ? null : "unread"))}
            >
              {unreadCount} unread
            </button>
          )}
          {actionNeededCount > 0 && (
            <button
              type="button"
              className={`cm-count${quickFilter === "action" ? " is-on" : ""}`}
              style={{ "--cm-count-tone": "var(--error)" }}
              aria-pressed={quickFilter === "action"}
              title={quickFilter === "action" ? "Show all messages" : "Show only messages with an open task"}
              onClick={() => setQuickFilter((f) => (f === "action" ? null : "action"))}
            >
              {actionNeededCount} need action
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingBlock text="Loading communications…" />
      ) : filteredComms.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No Communications"
          description="No payer messages match your filters."
        />
      ) : viewMode === "grid" ? (
        <div className="cm-well">
          <motion.div className="cm-grid" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {pagedComms.map((comm) => {
              const reasonCfg = REASON_CONFIG[comm.reason_code] ?? {};
              const hasAction = comm.pending_tasks?.length > 0;
              const isUnread = !comm.provider_read;
              const preview = commPreview(comm);
              return (
                <motion.article
                  key={comm.correlation_id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="cm-card"
                  data-tone={commTone(comm)}
                >
                  <div className="cm-card-top">
                    <span className="cm-avatar" aria-hidden="true">
                      {payerInitials(comm) ?? <MessageSquare size={17} />}
                      {isUnread && <span className="cm-avatar-dot" />}
                    </span>
                    <div className="cm-card-headline">
                      <h3 className="cm-title">{commHeadline(comm)}</h3>
                      <div className="cm-meta">
                        <span className="cm-meta-strong">{comm.payer_name || comm.payer_id}</span>
                        {comm.facility_name && <span>{comm.facility_name}</span>}
                      </div>
                    </div>
                    {comm.claim_reference && <code className="cm-ref">{comm.claim_reference}</code>}
                  </div>

                  <div className="cm-tags">
                    {comm.priority && priorityBadge(comm.priority)}
                    {comm.reason_code && <span className={`badge-modern ${reasonCfg.badge || "badge-info"}`}>{reasonCfg.label || comm.reason_display || comm.reason_code}</span>}
                    {hasAction && <span className="cm-flag"><AlertTriangle size={11} /> Action Required</span>}
                    {commHasAttachment(comm) && <span className="cm-chip"><Paperclip size={11} /> Attachment</span>}
                  </div>

                  {preview ? (
                    <p className="cm-subject">{preview}</p>
                  ) : (
                    <p className="cm-subject is-empty">No message body was sent with this notification.</p>
                  )}

                  {hasAction && (
                    <div className="cm-tasks">
                      <strong>{comm.pending_tasks.length} open task{comm.pending_tasks.length > 1 ? "s" : ""}</strong>
                      <span>{comm.pending_tasks.map((t) => t.title).join(", ")}</span>
                    </div>
                  )}

                  <div className="cm-card-foot">
                    <div className="cm-meta">
                      <span title={formatDateTime(comm.sent_at)}>
                        <Clock size={11} /> {formatRelative(comm.sent_at)}
                      </span>
                      {isUnread && <span className="cm-state is-unread"><Circle size={11} /> Unread</span>}
                    </div>
                    <Button variant={hasAction ? "primary" : "outline"} size="small" onClick={() => setSelectedCorrelationId(comm.correlation_id)}>
                      {hasAction ? "Review & Act" : "View"}
                    </Button>
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
          <TablePagination
            page={safeCommsPage}
            pageSize={COMMS_PAGE_SIZE}
            total={filteredComms.length}
            onPageChange={setCommsPage}
            label="messages"
          />
        </div>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-responsive-wrapper">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Payer</th>
                  <th>Claim Reference</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedComms.map((comm) => {
                  const hasAction = comm.pending_tasks?.length > 0;
                  const isUnread = !comm.provider_read;
                  const preview = commPreview(comm);
                  return (
                    <tr key={comm.correlation_id} className="cm-row" data-tone={commTone(comm)}>
                      <td>
                        <div className="cm-row-title">{commHeadline(comm)}</div>
                        {preview && <div className="cm-row-preview">{preview}</div>}
                        {hasAction && <div className="cm-flag"><AlertTriangle size={10} /> Action Required</div>}
                      </td>
                      <td>
                        <div className="cm-row-payer">{comm.payer_name || comm.payer_id}</div>
                        {comm.payer_name && comm.payer_id && <div className="cm-row-sub">{comm.payer_id}</div>}
                      </td>
                      <td>{comm.claim_reference ? <code className="cm-ref">{comm.claim_reference}</code> : "—"}</td>
                      <td title={formatDateTime(comm.sent_at)} style={{ whiteSpace: "nowrap" }}>
                        {formatDateTime(comm.sent_at)}
                      </td>
                      <td>
                        {isUnread
                          ? <span className="cm-state is-unread"><Circle size={11} /> Unread</span>
                          : <span className="cm-state"><CheckCircle2 size={11} /> Read</span>}
                      </td>
                      <td>
                        <Button variant={hasAction ? "primary" : "outline"} size="small" onClick={() => setSelectedCorrelationId(comm.correlation_id)}>
                          {hasAction ? "Review & Act" : "View"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <TablePagination
              page={safeCommsPage}
              pageSize={COMMS_PAGE_SIZE}
              total={filteredComms.length}
              onPageChange={setCommsPage}
              label="messages"
            />
          </div>
        </Card>
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
