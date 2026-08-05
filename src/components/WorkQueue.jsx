import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Search,
  AlertTriangle,
  X,
  FileText,
  ChevronRight,
  RefreshCw,
  RotateCcw,
  AlertCircle,
  LayoutGrid,
  List,
  ArrowDownUp,
  Inbox,
  Copy,
  User
} from "lucide-react";
import { api } from "../api";
import { resolveAction } from "../api/actionMap";
import { taskScreen } from "../taskRoutes";
import { Button, Input, EmptyState, LoadingBlock } from "./Common";
import { formatRelative, formatRelativePhrase, formatDateTime } from "../format.js";
import { useNavigate } from "react-router-dom";

const POLL_INTERVAL_MS = 45_000;
const OVERDUE_HOURS = 24;
const WARN_HOURS = 2;

const WORKFLOW_OPTIONS = [
  { value: "", label: "All Workflows" },
  { value: "insurance_plan", label: "Insurance Plan" },
  { value: "coverage_eligibility", label: "Coverage Eligibility" },
  { value: "preauth", label: "Preauth" },
  { value: "claim", label: "Claim" },
  { value: "reprocess", label: "Reprocess" },
  { value: "payment", label: "Payment" },
  { value: "communication", label: "Communication" },
];

const TASK_TYPE_OPTIONS = [
  { value: "", label: "All Task Types" },
  { value: "review_insurance_plan_documents", label: "Review Insurance Plan" },
  { value: "attach_eligibility_documents", label: "Attach Eligibility Docs" },
  { value: "fix_eligibility_error", label: "Fix Eligibility Error" },
  { value: "submit_preauth", label: "Submit Preauth" },
  { value: "respond_preauth_query", label: "Respond Preauth Query" },
  { value: "resubmit_preauth", label: "Resubmit Preauth" },
  { value: "submit_discharge_claim", label: "Submit Discharge Claim" },
  { value: "resubmit_discharge_claim", label: "Resubmit Discharge Claim" },
  { value: "submit_final_claim", label: "Submit Final Claim" },
  { value: "respond_claim_query", label: "Respond Claim Query" },
  { value: "resubmit_claim", label: "Resubmit Claim" },
  { value: "submit_reprocess", label: "Submit Reprocess" },
  { value: "acknowledge_payment", label: "Acknowledge Payment" },
  { value: "review_payment_ack_failure", label: "Payment Ack Failure" },
  { value: "review_communication", label: "Review Communication" },
  { value: "review_callback_failure", label: "Callback Failure" },
  { value: "cancel_superseded_preauth", label: "Withdraw Preauth" },
];

// Doc requirements arrive either as a flat {name}/{display} shape, or as a raw
// FHIR extension: {url, values: [{url: "category", display}, {url: "code", display}]}.
function describeDocRequirement(d) {
  if (d.name) return { label: d.name, code: d.code };
  if (d.display) return { label: d.display, code: d.code };
  const values = d.values || [];
  const category = values.find((v) => v.url === "category");
  const code = values.find((v) => v.url === "code");
  if (category || code) {
    return {
      label: [category?.display, code?.display].filter(Boolean).join(" — "),
      code: category?.code,
    };
  }
  return { label: "Document requirement" };
}

function ageLabel(createdAt) {
  if (!createdAt) return null;
  const hours = (Date.now() - Date.parse(createdAt)) / 3_600_000;
  if (hours >= OVERDUE_HOURS) return { text: "Overdue", color: "var(--error)" };
  if (hours >= WARN_HOURS)
    return { text: `Waiting ${Math.floor(hours)}h+`, color: "var(--warning)" };
  return null;
}

function taskSubject(task) {
  const ref = task.cashless_case_id
    ? `Case ${task.cashless_case_id}`
    : task.claim_id
      ? `Claim ${task.claim_id}`
      : null;
  if (task.patient_name && ref) return `${task.patient_name} · ${ref}`;
  return task.patient_name || ref || null;
}

function CopyRef({ label, value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  return (
    <button
      type="button"
      title={`${label} — ${value}`}
      aria-label={`${label}: ${value}`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        background: "none", border: "none", padding: 0, cursor: "pointer",
        color: "var(--text-main)", font: "inherit",
      }}
    >
      <code style={{ fontSize: "11px" }}>{String(value).slice(0, 8)}…</code>
      {copied ? (
        <span style={{ fontSize: "10px", color: "var(--success)" }}>copied</span>
      ) : (
        <Copy size={11} color="var(--text-muted)" />
      )}
    </button>
  );
}

function DetailRow({ label, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div>
      <span style={{ color: "var(--text-muted)" }}>{label}:</span> {children}
    </div>
  );
}

function TaskDrawer({ task, open, onClose, onActionComplete, allFacilitiesMode, onNavigate }) {
  const [completing, setCompleting] = useState(false);
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState(null);

  const taskId = task?.id ?? task?.task_id;
  const isCallbackFailure = task?.task_type === "review_callback_failure";
  const isSupersededCancel = task?.task_type === "cancel_superseded_preauth";

  const handleRetry = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await api.reprocessCallback(task.correlation_id);
      if (res?.status === "reprocessed" || res?.status === "already_complete") {
        onActionComplete();
        onClose();
      } else {
        setActionError(res?.message || "The payer response still could not be read.");
      }
    } catch (e) {
      setActionError(e?.message || "Retry failed.");
    } finally {
      setRunning(false);
    }
  };

  const handleCancelPreauth = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await api.cancelPreauth({
        cashless_case_id: task.cashless_case_id,
        reason: "payer-changed",
        description: "Case moved to a different payer.",
      });
      if (res?.correlation_id || res?.status === "submitted") {
        await api.completeTask(taskId, { note: "Withdrawn with the previous payer" });
        onActionComplete();
        onClose();
      } else {
        setActionError(res?.message || "Could not withdraw the preauthorization.");
      }
    } catch (e) {
      setActionError(e?.message || "Withdrawal failed.");
    } finally {
      setRunning(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await api.completeTask(taskId, {
        note: "Actioned from Work Queue",
      });
      onActionComplete();
      onClose();
    } catch (_) {
    } finally {
      setCompleting(false);
    }
  };

  const handleNavigate = () => {
    onClose();
    onNavigate(task);
  };

  return (
    <AnimatePresence>
      {open && task && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-overlay"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 90,
            }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="glass-panel"
            style={{
              position: "fixed",
              right: 0,
              top: 0,
              bottom: 0,
              width: "min(560px, 95vw)",
              zIndex: 91,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "20px 24px",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-2)",
                    alignItems: "center",
                    marginBottom: "var(--space-1)",
                  }}
                >
                  <span
                    className={`badge-modern badge-${task.priority === "urgent" ? "error" : task.priority === "high" ? "warning" : "info"}`}
                    style={{ fontSize: "10px" }}
                  >
                    {task.priority?.toUpperCase()}
                  </span>
                  <span
                    className="badge-modern badge-info"
                    style={{ fontSize: "10px" }}
                  >
                    {task.workflow}
                  </span>
                  <span
                    className="badge-modern"
                    style={{
                      fontSize: "10px",
                      background: "var(--bg-main)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {task.task_type?.replace(/_/g, " ")}
                  </span>
                  {task.facility_name && (
                    <span
                      className="badge-modern"
                      style={{ fontSize: "10px", background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}
                    >
                      {task.facility_name}
                    </span>
                  )}
                </div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>
                  {task.title}
                </h3>
                {taskSubject(task) && (
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      marginTop: "3px", fontSize: "12px", color: "var(--text-muted)",
                    }}
                  >
                    <User size={12} />
                    {taskSubject(task)}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  display: "flex",
                }}
              >
                <X size={22} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "var(--space-6)",
                display: "flex",
                flexDirection: "column",
                gap: "18px",
              }}
            >
              {task.description && (
                <p
                  style={{
                    fontSize: "14px",
                    color: "var(--text-muted)",
                    margin: 0,
                  }}
                >
                  {task.description}
                </p>
              )}

              {actionError && (
                <div className="inline-error-banner" style={{ margin: 0 }}>
                  <AlertCircle size={16} />
                  {actionError}
                </div>
              )}

              {task.metadata?.payer_notes && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: "rgba(59,130,246,0.06)",
                    border: "1px solid var(--info)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "13px",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: "var(--info)",
                      marginBottom: "var(--space-1)",
                    }}
                  >
                    Payer Note
                  </div>
                  {task.metadata.payer_notes}
                </div>
              )}

              {task.required_documents?.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                      marginBottom: "10px",
                    }}
                  >
                    Required Documents ({task.required_documents.length})
                  </div>
                  {task.required_documents.map((doc, i) => {
                    const { label, code } = describeDocRequirement(doc);
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "8px 0",
                          borderBottom: "1px solid var(--border-color)",
                          fontSize: "13px",
                        }}
                      >
                        <FileText size={14} color="var(--text-muted)" />
                        <span style={{ fontWeight: 600 }}>{label}</span>
                        {code && (
                          <code
                            style={{
                              fontSize: "11px",
                              color: "var(--text-muted)",
                              marginLeft: "auto",
                            }}
                          >
                            {code}
                          </code>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                style={{
                  padding: "12px 16px",
                  background: "var(--bg-main)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-color)",
                  fontSize: "12px",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: "var(--space-2)",
                    textTransform: "uppercase",
                    letterSpacing: "0.4px",
                  }}
                >
                  Details
                </div>
                <div
                  className="grid-2-col"
                  style={{
                    gap: "6px",
                  }}
                >
                  <DetailRow label="Patient">
                    {task.patient_name || (task.child_id ? `#${task.child_id}` : "—")}
                  </DetailRow>
                  <DetailRow label="Payer">
                    {task.payer_name || task.payer_id || "—"}
                  </DetailRow>
                  <DetailRow label="Case ID">{task.cashless_case_id || "—"}</DetailRow>
                  <DetailRow label="Claim ID">{task.claim_id || "—"}</DetailRow>
                  <DetailRow label="Stage">{task.case_stage || "—"}</DetailRow>
                  <DetailRow label="Created">{formatDateTime(task.created_at)}</DetailRow>
                  <DetailRow label="Reference">
                    <CopyRef label="Copy correlation id" value={task.correlation_id} />
                  </DetailRow>
                  <DetailRow label="Task ID">{taskId}</DetailRow>
                </div>
              </div>

              {/* The raw exception is for whoever debugs this, not for the person
                  filing the claim — available, but not in their way. */}
              {(task.metadata?.error_message || task.metadata?.error_class) && (
                <details style={{ fontSize: "12px" }}>
                  <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontWeight: 600 }}>
                    Technical details
                  </summary>
                  <div
                    style={{
                      marginTop: "var(--space-2)", padding: "10px 12px",
                      background: "var(--bg-main)", borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-color)", display: "grid", gap: "4px",
                    }}
                  >
                    <DetailRow label="Error">{task.metadata.error_class}</DetailRow>
                    <DetailRow label="Message">
                      <code style={{ fontSize: "11px" }}>{task.metadata.error_message}</code>
                    </DetailRow>
                    <DetailRow label="Workflow ID">{task.metadata.workflow_id}</DetailRow>
                    <DetailRow label="Sender">{task.metadata.sender_code}</DetailRow>
                  </div>
                </details>
              )}

              {/* Task results (if any) used to be shown here, removed for navigation flow */}
            </div>

            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                gap: "var(--space-3)",
              }}
            >
              {/* A failed callback is resolved by replaying it, not by opening the
                  case — so retry leads and the case link plays second. */}
              {isCallbackFailure ? (
                <>
                  <Button
                    variant="primary"
                    disabled={running || allFacilitiesMode || task.metadata?.retryable === false}
                    title={
                      task.metadata?.retryable === false
                        ? "This failure predates payload capture, so it cannot be replayed. Confirm the outcome with the payer."
                        : undefined
                    }
                    onClick={handleRetry}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    {running ? "Retrying…" : "Retry payer response"}
                  </Button>
                  <Button variant="outline" disabled={allFacilitiesMode} onClick={handleNavigate}>
                    Review Case &rarr;
                  </Button>
                </>
              ) : isSupersededCancel ? (
                <>
                  <Button
                    variant="primary"
                    disabled={running || allFacilitiesMode}
                    onClick={handleCancelPreauth}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    {running ? "Withdrawing…" : "Withdraw with previous payer"}
                  </Button>
                  <Button variant="outline" disabled={allFacilitiesMode} onClick={handleNavigate}>
                    Review Case &rarr;
                  </Button>
                </>
              ) : (
                task.action && (
                  <Button
                    variant="primary"
                    disabled={allFacilitiesMode}
                    title={allFacilitiesMode ? "Select a facility in Settings to act on this task" : undefined}
                    onClick={handleNavigate}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    {task.action.label || "Review Case"} &rarr;
                  </Button>
                )
              )}
              {task.task_type === "acknowledge_payment" && (
                <Button
                  variant="outline"
                  disabled={completing || allFacilitiesMode}
                  onClick={handleComplete}
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {completing ? "Completing…" : "Mark as Complete ✓"}
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default function WorkQueue({ allFacilitiesMode = false }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [caseIdFilter, setCaseIdFilter] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [retrying, setRetrying] = useState({});
  const [navigating, setNavigating] = useState({});
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("wq_viewMode") || "board");
  const [sortBy, setSortBy] = useState("priority");
  
  useEffect(() => { localStorage.setItem("wq_viewMode", viewMode); }, [viewMode]);
  
  const pollRef = useRef(null);

  const fetchTasks = useCallback(async () => {
    try {
      const params = { status: statusFilter };
      if (workflowFilter) params.workflow = workflowFilter;
      if (taskTypeFilter) params.task_type = taskTypeFilter;
      if (caseIdFilter) params.cashless_case_id = caseIdFilter;
      const response = await api.listTasks(params);
      setTasks(response?.tasks || []);
      setLoadError(false);
    } catch (e) {
      console.log("error", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, workflowFilter, taskTypeFilter, caseIdFilter]);

  useEffect(() => {
    setLoading(true);
    fetchTasks();
    clearInterval(pollRef.current);
    if (statusFilter === "pending") {
      pollRef.current = setInterval(fetchTasks, POLL_INTERVAL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [fetchTasks]);

  const handleRetryAck = async (task) => {
    const payRef = task.action?.payload_hint?.payment_reference;
    if (!payRef) return;
    setRetrying((p) => ({ ...p, [task.id ?? task.task_id]: true }));
    try {
      await api.acknowledgePayment({ payment_reference: payRef });
      await fetchTasks();
    } catch (_) {
    } finally {
      setRetrying((p) => ({ ...p, [task.id ?? task.task_id]: false }));
    }
  };

  const navigateToCase = async (task) => {
    const taskId = task.id ?? task.task_id;
    let cid = task.child_id;
    if (!cid && task.cashless_case_id) {
      setNavigating((p) => ({ ...p, [taskId]: true }));
      try {
        const cs = await api.getCashlessStatus(task.cashless_case_id);
        cid = cs.child_id;
      } catch (_) {}
      setNavigating((p) => ({ ...p, [taskId]: false }));
    }
    if (!cid) return;
    const path = taskScreen(task.task_type, cid) || `/case/${cid}/`;
    navigate(path, {
      state: {
        claim_id: task.claim_id,
        cashless_case_id: task.cashless_case_id,
        openAction:
          task.task_type === "resubmit_preauth" ? "resubmit_preauth" :
          task.task_type === "respond_preauth_query" ? "respond_preauth_query" :
          task.task_type === "resubmit_claim" ? "resubmit_claim" :
          task.task_type === "respond_claim_query" ? "respond_claim_query" :
          task.task_type === "resubmit_discharge_claim" ? "resubmit_discharge_claim" :
          undefined,
        tab: task.task_type?.includes("discharge")
          ? "discharge"
          : task.task_type?.includes("final")
            ? "final"
            : undefined,
      },
    });
  };

  let filteredTasks = tasks.filter((t) => {
    const q = searchQuery.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      String(t.id ?? t.task_id)
        .toLowerCase()
        .includes(q) ||
      String(t.claim_id ?? "").includes(q)
    );
  });

  filteredTasks.sort((a, b) => {
    if (sortBy === "oldest") {
      return Date.parse(a.created_at) - Date.parse(b.created_at);
    } else if (sortBy === "newest") {
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    }
    return 0;
  });

  const urgentTasks = filteredTasks.filter((t) => t.priority === "urgent");
  const highTasks = filteredTasks.filter((t) => t.priority === "high");
  const normalTasks = filteredTasks.filter(
    (t) => t.priority !== "urgent" && t.priority !== "high",
  );

  const isPaymentAckTask = (t) =>
    t.task_type === "acknowledge_payment" ||
    t.task_type === "review_payment_ack_failure";

  const TaskRow = ({ task }) => {
    const age = ageLabel(task.created_at);
    const taskId = task.id ?? task.task_id;
    const isAckTask = isPaymentAckTask(task);

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        whileHover={{ y: -2, boxShadow: "0 12px 24px -8px rgba(0,0,0,0.15)" }}
        className="card-modern"
        style={{
          padding: "14px 18px",
          cursor: "pointer",
          borderLeft:
            task.priority === "urgent"
              ? "3px solid var(--error)"
              : task.priority === "high"
                ? "3px solid var(--warning)"
                : "3px solid var(--primary)",
          display: "flex",
          gap: "14px",
          alignItems: "center",
          transition: "box-shadow 0.2s ease",
        }}
        onClick={() => setSelectedTask(task)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              marginBottom: "5px",
            }}
          >
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <span
                className={`badge-modern badge-${task.priority === "urgent" ? "error" : task.priority === "high" ? "warning" : "info"}`}
                style={{ fontSize: "10px" }}
              >
                {task.priority?.toUpperCase()}
              </span>
              <span
                className="badge-modern badge-info"
                style={{ fontSize: "10px" }}
              >
                {task.workflow}
              </span>
              {task.facility_name && (
                <span
                  className="badge-modern"
                  style={{ fontSize: "10px", background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}
                >
                  {task.facility_name}
                </span>
              )}
              {age && (
                <span
                  style={{ fontSize: "10px", fontWeight: 700, color: age.color }}
                >
                  {age.text}
                </span>
              )}
            </div>
            <span
              title={task.created_at ? formatDateTime(task.created_at) : undefined}
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {task.created_at ? formatRelative(task.created_at) : ""}
            </span>
          </div>
          <div
            style={{ fontWeight: 700, fontSize: "14px", marginBottom: "3px" }}
          >
            {task.title}
          </div>
          {taskSubject(task) && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "3px" }}>
              <User size={11} />
              {taskSubject(task)}
              {task.payer_name && <span>· {task.payer_name}</span>}
            </div>
          )}
          {task.description && (
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {task.description}
            </div>
          )}
          {task.required_documents?.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "6px",
                marginTop: "var(--space-2)",
              }}
            >
              <FileText size={11} color="var(--text-muted)" />
              {task.required_documents.map((doc, idx) => {
                const docLabel = typeof doc === 'string' ? doc : (doc.display || doc.code || "Document");
                return (
                  <span
                    key={idx}
                    style={{
                      fontSize: "10px",
                      padding: "2px 6px",
                      background: "var(--bg-main)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "4px",
                      color: "var(--text-muted)",
                    }}
                  >
                    {docLabel}
                  </span>
                );
              })}
            </div>
          )}
          {isAckTask && (
            <div
              style={{
                marginTop: "var(--space-2)",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--error)",
                }}
              >
                Payment acknowledgement failed - retry required
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetryAck(task);
                }}
                disabled={!!retrying[taskId] || allFacilitiesMode}
                title={allFacilitiesMode ? "Select a facility in Settings to act on this task" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  padding: "3px 10px",
                  background: "var(--error)",
                  color: "white",
                  border: "none",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: (retrying[taskId] || allFacilitiesMode) ? 0.6 : 1,
                }}
              >
                <RotateCcw size={11} />
                {retrying[taskId] ? "Retrying…" : "Retry Ack"}
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
          <Button
            variant={task.action ? "primary" : "outline"}
            size="small"
            disabled={!!navigating[taskId]}
            onClick={(e) => {
              e.stopPropagation();
              navigateToCase(task);
            }}
          >
            {navigating[taskId] ? "Loading…" : (task.action?.label || "Open Case")}
          </Button>
          <ChevronRight size={20} color="var(--text-muted)" />
        </div>
      </motion.div>
    );
  };

  const TaskSection = ({ title, tasks: sectionTasks, color }) => {
    if (sectionTasks.length === 0) return null;
    return (
      <div className="mb-8">
        <h3
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            marginBottom: "14px",
            color: `var(--${color})`,
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          {color === "error" && <AlertTriangle size={16} />}
          {title} ({sectionTasks.length})
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <AnimatePresence>
            {sectionTasks.map((task) => (
              <TaskRow key={task.id ?? task.task_id} task={task} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  const KanbanCard = ({ task }) => {
    const age = ageLabel(task.created_at);
    const taskId = task.id ?? task.task_id;
    
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        whileHover={{ y: -4, boxShadow: "0 12px 24px -8px rgba(0,0,0,0.15)" }}
        onClick={() => setSelectedTask(task)}
        className="card-modern"
        style={{
          padding: "var(--space-4)",
          borderTop: task.priority === "urgent" ? "3px solid var(--error)" : task.priority === "high" ? "3px solid var(--warning)" : "3px solid var(--primary)",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          transition: "box-shadow 0.2s ease"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <span className={`badge-modern badge-${task.priority === "urgent" ? "error" : task.priority === "high" ? "warning" : "info"}`} style={{ fontSize: "10px" }}>
              {task.priority?.toUpperCase()}
            </span>
            <span className="badge-modern badge-info" style={{ fontSize: "10px" }}>
              {task.workflow}
            </span>
          </div>
          {age && <span style={{ fontSize: "10px", fontWeight: 700, color: age.color, background: "color-mix(in srgb, currentColor 10%, transparent)", padding: "2px 6px", borderRadius: "10px", flexShrink: 0 }}>{age.text}</span>}
        </div>
        
        {taskSubject(task) && (
          <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)" }}>
            <User size={11} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{taskSubject(task)}</span>
          </div>
        )}

        <div style={{ fontWeight: 700, fontSize: "14px", lineHeight: "1.3" }}>
          {task.title}
        </div>

        {task.payer_name && (
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{task.payer_name}</div>
        )}

        <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span title={task.created_at ? formatDateTime(task.created_at) : undefined}>
            {task.created_at ? `Raised ${formatRelativePhrase(task.created_at)}` : ""}
          </span>
          {task.facility_name && (
            <span style={{ color: "var(--accent)", fontWeight: 600, background: "color-mix(in srgb, var(--accent) 10%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>
              {task.facility_name}
            </span>
          )}
        </div>
        
        {task.required_documents?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-1)", marginTop: "var(--space-1)" }}>
            <FileText size={11} color="var(--text-muted)" />
            {task.required_documents.map((doc, idx) => {
              const docLabel = typeof doc === 'string' ? doc : (doc.display || doc.code || "Document");
              return (
                <span
                  key={idx}
                  style={{
                    fontSize: "10px",
                    padding: "2px 6px",
                    background: "var(--bg-main)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "4px",
                    color: "var(--text-muted)",
                  }}
                >
                  {docLabel}
                </span>
              );
            })}
          </div>
        )}
        
        <div style={{ marginTop: "6px" }}>
          <Button
            variant={task.action ? "primary" : "outline"}
            size="small"
            disabled={!!navigating[taskId]}
            onClick={(e) => {
              e.stopPropagation();
              navigateToCase(task);
            }}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {navigating[taskId] ? "Loading…" : (task.action?.label || "Open Case")}
          </Button>
        </div>
      </motion.div>
    );
  };

  const KanbanColumn = ({ title, tasks: sectionTasks, color }) => {
    return (
      <div className="wq-lane" style={{ "--wq-lane-accent": `var(--${color})` }}>
        <h3 className="wq-lane-head">
          <span className="wq-lane-rule" aria-hidden="true" />
          {title}
          <span className="wq-lane-count">{sectionTasks.length}</span>
        </h3>

        <div className="wq-lane-body">
          <AnimatePresence>
            {sectionTasks.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="wq-lane-empty">
                <Inbox size={26} />
                <div className="wq-lane-empty-title">Clear</div>
              </motion.div>
            ) : (
              sectionTasks.map((task) => (
                <KanbanCard key={task.id ?? task.task_id} task={task} />
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  return (
    <div className="work-queue-screen">
      {loadError && (
        <div className="inline-error-banner">
          <AlertCircle size={16} />
          Could not refresh the task list. Showing the last known results, if any.
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "var(--space-5)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 200px" }}>
          <Input
            icon={Search}
            placeholder="Search tasks, claim IDs…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {["pending", "completed"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-pill)",
                border: `1px solid ${statusFilter === s ? "var(--primary)" : "var(--border-color)"}`,
                background:
                  statusFilter === s ? "var(--primary)" : "transparent",
                color: statusFilter === s ? "white" : "var(--text-muted)",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "13px",
                textTransform: "capitalize",
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          className="input-modern"
          style={{ width: "auto", minWidth: "150px" }}
          value={workflowFilter}
          onChange={(e) => setWorkflowFilter(e.target.value)}
        >
          {WORKFLOW_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="input-modern"
          style={{ width: "auto", minWidth: "170px" }}
          value={taskTypeFilter}
          onChange={(e) => setTaskTypeFilter(e.target.value)}
        >
          {TASK_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className="input-modern"
          style={{ width: "130px" }}
          placeholder="Case ID…"
          value={caseIdFilter}
          onChange={(e) => setCaseIdFilter(e.target.value)}
        />
        
        <select
          className="input-modern"
          style={{ width: "auto", minWidth: "140px" }}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="priority">Sort by Priority</option>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>
        
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginLeft: "auto" }}>
          <Button variant="outline" size="small" icon={RefreshCw} onClick={fetchTasks}>
            Refresh
          </Button>
          <div style={{ display: "flex", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: "var(--space-1)", gap: "var(--space-1)" }}>
            <button
              title="Board View"
              onClick={() => setViewMode("board")}
              style={{ padding: "6px 12px", background: viewMode === "board" ? "var(--bg-main)" : "transparent", color: viewMode === "board" ? "var(--text-main)" : "var(--text-muted)", border: viewMode === "board" ? "1px solid var(--border-color)" : "1px solid transparent", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "flex", alignItems: "center", boxShadow: viewMode === "board" ? "0 1px 3px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s ease" }}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              title="List View"
              onClick={() => setViewMode("list")}
              style={{ padding: "6px 12px", background: viewMode === "list" ? "var(--bg-main)" : "transparent", color: viewMode === "list" ? "var(--text-main)" : "var(--text-muted)", border: viewMode === "list" ? "1px solid var(--border-color)" : "1px solid transparent", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "flex", alignItems: "center", boxShadow: viewMode === "list" ? "0 1px 3px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s ease" }}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingBlock text="Loading tasks…" />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          iconOpacity={0.4}
          iconColor="var(--success)"
          title="All Caught Up!"
          description={`No ${statusFilter} tasks match your filters.`}
        />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {statusFilter === "pending" ? (
            viewMode === "board" ? (
              <div className="wq-board">
                <KanbanColumn title="Urgent" tasks={urgentTasks} color="error" />
                <KanbanColumn title="High" tasks={highTasks} color="warning" />
                <KanbanColumn title="Normal" tasks={normalTasks} color="primary" />
              </div>
            ) : (
              <>
                <TaskSection title="Urgent" tasks={urgentTasks} color="error" />
                <TaskSection title="High" tasks={highTasks} color="warning" />
                <TaskSection title="Normal" tasks={normalTasks} color="primary" />
              </>
            )
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
            >
              {filteredTasks.map((task) => (
                <TaskRow key={task.id ?? task.task_id} task={task} />
              ))}
            </div>
          )}
        </motion.div>
      )}

      <TaskDrawer
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onActionComplete={() => {
          fetchTasks();
          setSelectedTask(null);
        }}
        allFacilitiesMode={allFacilitiesMode}
        onNavigate={navigateToCase}
      />
    </div>
  );
}
