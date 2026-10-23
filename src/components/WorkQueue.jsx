import { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2,
  FileText,
  RefreshCw,
  RotateCcw,
  AlertCircle,
  Copy
} from "lucide-react";
import { api } from "../api";
import { taskScreen, taskNavState } from "../taskRoutes";
import { Button, EmptyState, SkeletonTable, TablePagination } from "./Common";
import PageActions from "./PageActions";
import Dropdown from "./Dropdown";
import { Drawer } from "./Overlay";
import { formatRelative, formatDateTime, formatCaseRef } from "../format.js";
import { useNavigate } from "react-router-dom";
import PayerName from "./PayerName";

const POLL_INTERVAL_MS = 45_000;
const OVERDUE_HOURS = 24;
const WARN_HOURS = 2;
const PAGE_SIZE = 25;
// The task list endpoint pages at 20 by default; ask for enough that the
// client-side priority counts, sort and pagination see the whole queue.
const FETCH_LIMIT = 500;

const STATUS_OPTIONS = [
  { value: "pending", label: "Open tasks" },
  { value: "completed", label: "Completed" },
];

const SORT_OPTIONS = [
  { value: "priority", label: "Sort: Priority" },
  { value: "oldest", label: "Sort: Waiting longest" },
  { value: "newest", label: "Sort: Newest" },
];

const PRIORITY_CHIPS = [
  { key: "all", label: "All", dot: "var(--text-muted)" },
  { key: "urgent", label: "Urgent", dot: "var(--error)" },
  { key: "high", label: "High", dot: "var(--warning)" },
  { key: "normal", label: "Normal", dot: "var(--border-hover)" },
];

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2 };

const createdAt = (t) => Date.parse(t.created_at) || 0;

const SORTERS = {
  // Most pressing first; within a priority, whoever has waited longest.
  priority: (a, b) =>
    PRIORITY_RANK[priorityBucket(a)] - PRIORITY_RANK[priorityBucket(b)] || createdAt(a) - createdAt(b),
  oldest: (a, b) => createdAt(a) - createdAt(b),
  newest: (a, b) => createdAt(b) - createdAt(a),
};

// "low" has no chip of its own; it sits with normal.
function priorityBucket(task) {
  return task.priority === "urgent" || task.priority === "high" ? task.priority : "normal";
}

const taskKey = (task) => String(task.id ?? task.task_id);

const TASK_TYPE_SHORT = {
  review_insurance_plan_documents: "Insurance plan",
  attach_eligibility_documents: "Eligibility docs",
  fix_eligibility_error: "Eligibility",
  submit_preauth: "Pre-auth",
  respond_preauth_query: "Pre-auth query",
  resubmit_preauth: "Pre-auth",
  resubmit_enhancement: "Enhancement",
  submit_discharge_claim: "Discharge claim",
  resubmit_discharge_claim: "Discharge claim",
  submit_final_claim: "Final claim",
  respond_claim_query: "Claim query",
  resubmit_claim: "Resubmit",
  submit_reprocess: "Reprocess",
  request_claim_release: "Balance",
  acknowledge_payment: "Payment",
  review_payment_ack_failure: "Payment",
  review_communication: "Message",
  review_callback_failure: "Payer response",
  cancel_superseded_preauth: "Withdraw",
};

const shortTaskType = (type) =>
  TASK_TYPE_SHORT[type] || (type ? type.replace(/_/g, " ") : "Task");

function searchHaystack(task) {
  return [
    task.title,
    task.description,
    taskKey(task),
    task.claim_id,
    task.cashless_case_id && formatCaseRef(task.cashless_case_id),
    task.cashless_case_id,
    task.patient_name,
    task.payer_name,
    task.facility_name,
  ]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" ")
    .toLowerCase();
}

const TASK_TYPE_OPTIONS = [
  { value: "", label: "All task types" },
  { value: "review_insurance_plan_documents", label: "Review Insurance Plan" },
  { value: "attach_eligibility_documents", label: "Attach Eligibility Docs" },
  { value: "fix_eligibility_error", label: "Fix Eligibility Error" },
  { value: "submit_preauth", label: "Submit Preauth" },
  { value: "respond_preauth_query", label: "Respond Preauth Query" },
  { value: "resubmit_preauth", label: "Resubmit Preauth" },
  { value: "resubmit_enhancement", label: "Resubmit Enhancement" },
  { value: "submit_discharge_claim", label: "Submit Discharge Claim" },
  { value: "resubmit_discharge_claim", label: "Resubmit Discharge Claim" },
  { value: "submit_final_claim", label: "Submit Final Claim" },
  { value: "respond_claim_query", label: "Respond Claim Query" },
  { value: "resubmit_claim", label: "Resubmit Claim" },
  { value: "submit_reprocess", label: "Submit Reprocess" },
  { value: "request_claim_release", label: "Ask for the Balance" },
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

// Tasks that answer or send something to the payer can't be closed in bulk:
// ticking them "done" would hide a query nobody answered.
const needsOwnAction = (task) => /^(respond_|submit_|resubmit_)/.test(task.task_type || "");

function taskSubject(task) {
  const ref = task.cashless_case_id
    ? formatCaseRef(task.cashless_case_id)
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

function TaskDrawer({ task, open, onClose, onActionComplete, allFacilitiesMode, onNavigate, onRetryAck, retryingAck }) {
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
    <Drawer
      open={open && !!task}
      onClose={onClose}
      width={560}
      title={task?.title}
      subtitle={task && [
        task.priority && `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`,
        task.task_type?.replace(/_/g, " "),
        taskSubject(task),
        task.facility_name,
      ].filter(Boolean).join(" · ")}
      footer={task && (
        <>
              {/* A failed callback is resolved by replaying it, not by opening the
                  case — so retry leads and the case link plays second. */}
              {isCallbackFailure ? (
                <>
                  <Button write
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
                  <Button write
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
                    title={allFacilitiesMode ? "This account can view only" : undefined}
                    onClick={handleNavigate}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    {task.action.label || "Review Case"} &rarr;
                  </Button>
                )
              )}
              {task.task_type === "acknowledge_payment" && (
                <Button write
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
        </>
      )}
    >
      {task && (
        <div className="wq-drawer-body">
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

              {(task.task_type === "acknowledge_payment" || task.task_type === "review_payment_ack_failure") &&
                task.action?.payload_hint?.payment_reference && (
                <div className="inline-error-banner" style={{ margin: 0, justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <AlertCircle size={16} />
                    Payment acknowledgement failed — retry required
                  </span>
                  <Button
                    variant="outline"
                    size="small"
                    icon={RotateCcw}
                    disabled={retryingAck || allFacilitiesMode}
                    title={allFacilitiesMode ? "This account can view only" : undefined}
                    onClick={() => onRetryAck(task)}
                  >
                    {retryingAck ? "Retrying…" : "Retry Ack"}
                  </Button>
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
                    <PayerName id={task.payer_id} name={task.payer_name} />
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
      )}
    </Drawer>
  );
}

export default function WorkQueue({ allFacilitiesMode = false }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("priority");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [retrying, setRetrying] = useState({});

  const pollRef = useRef(null);

  const fetchTasks = useCallback(async () => {
    try {
      const params = { status: statusFilter, limit: FETCH_LIMIT };
      if (taskTypeFilter) params.task_type = taskTypeFilter;
      const response = await api.listTasks(params);
      setTasks(response?.tasks || []);
      setLoadError(false);
    } catch (e) {
      console.log("error", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, taskTypeFilter]);

  useEffect(() => {
    setLoading(true);
    fetchTasks();
    clearInterval(pollRef.current);
    if (statusFilter === "pending") {
      pollRef.current = setInterval(fetchTasks, POLL_INTERVAL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [fetchTasks]);

  // Any filter change starts from the first page and drops the selection.
  const resetView = () => {
    setPage(0);
    setSelected({});
  };

  const handleRetryAck = async (task) => {
    const payRef = task.action?.payload_hint?.payment_reference;
    if (!payRef) return;
    setRetrying((p) => ({ ...p, [taskKey(task)]: true }));
    try {
      await api.acknowledgePayment({ payment_reference: payRef });
      await fetchTasks();
    } catch (_) {
    } finally {
      setRetrying((p) => ({ ...p, [taskKey(task)]: false }));
    }
  };

  const navigateToCase = async (task) => {
    let cid = task.child_id;
    if (!cid && task.cashless_case_id) {
      try {
        const cs = await api.getCashlessStatus(task.cashless_case_id);
        cid = cs.child_id;
      } catch (_) {}
    }
    if (!cid) return;
    const path = taskScreen(task.task_type, cid) || `/case/${cid}/`;
    navigate(path, { state: taskNavState(task) });
  };

  const handleMarkDone = async () => {
    const ids = tasks.filter((t) => selected[taskKey(t)] && !needsOwnAction(t)).map(taskKey);
    setBulkBusy(true);
    try {
      await Promise.allSettled(
        ids.map((id) => api.completeTask(id, { note: "Marked done from Work Queue" })),
      );
      setSelected({});
      await fetchTasks();
    } finally {
      setBulkBusy(false);
    }
  };

  // Priority chip counts follow the search, but not the priority filter itself.
  const q = searchQuery.trim().toLowerCase();
  const searched = tasks.filter((t) => !q || searchHaystack(t).includes(q));
  const chipCounts = { all: searched.length, urgent: 0, high: 0, normal: 0 };
  searched.forEach((t) => chipCounts[priorityBucket(t)]++);

  const visible = searched
    .filter((t) => priorityFilter === "all" || priorityBucket(t) === priorityFilter)
    .sort(SORTERS[sortBy]);

  const maxPage = Math.max(0, Math.ceil(visible.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const pageRows = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const selectable = statusFilter === "pending";
  const selCount = Object.keys(selected).length;
  const bulkRows = pageRows.filter((t) => !needsOwnAction(t));
  const allChecked = bulkRows.length > 0 && bulkRows.every((t) => selected[taskKey(t)]);
  const filtersActive = q || priorityFilter !== "all" || taskTypeFilter;

  const toggleOne = (task) =>
    setSelected((s) => {
      const next = { ...s };
      const key = taskKey(task);
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });

  const toggleAll = () =>
    setSelected((s) => {
      const next = { ...s };
      bulkRows.forEach((t) => {
        if (allChecked) delete next[taskKey(t)];
        else next[taskKey(t)] = true;
      });
      return next;
    });

  const clearFilters = () => {
    setSearchQuery("");
    setPriorityFilter("all");
    setTaskTypeFilter("");
    resetView();
  };

  return (
    <div className="wq-screen">
      <PageActions>
        <Button variant="outline" size="small" icon={RefreshCw} onClick={fetchTasks} title="Refresh tasks">
          Refresh
        </Button>
      </PageActions>

      {loadError && (
        <div className="inline-error-banner" style={{ margin: 0 }}>
          <AlertCircle size={16} />
          Could not refresh the task list. Showing the last known results, if any.
        </div>
      )}

      <div className="wq-panel">
        <div className="wq-toolbar">
          <input
            className="input-modern wq-search"
            placeholder="Search task, case, claim, patient, payer…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              resetView();
            }}
          />
          <div className="wq-chips">
            {PRIORITY_CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`wq-chip${priorityFilter === c.key ? " is-on" : ""}`}
                onClick={() => {
                  setPriorityFilter(c.key);
                  resetView();
                }}
              >
                <span className="wq-chip-dot" style={{ "--wq-dot": c.dot }} />
                {c.label}
                <span className="wq-chip-count">{chipCounts[c.key]}</span>
              </button>
            ))}
          </div>
          <div className="wq-toolbar-spacer" />
          <div style={{ width: "140px" }}>
            <Dropdown
              compact
              ariaLabel="Task status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(v) => {
                setStatusFilter(v);
                resetView();
              }}
            />
          </div>
          <div style={{ width: "200px" }}>
            <Dropdown
              compact
              ariaLabel="Task type"
              value={taskTypeFilter}
              options={TASK_TYPE_OPTIONS}
              onChange={(v) => {
                setTaskTypeFilter(v);
                resetView();
              }}
            />
          </div>
          <div style={{ width: "170px" }}>
            <Dropdown
              compact
              ariaLabel="Sort"
              value={sortBy}
              options={SORT_OPTIONS}
              onChange={(v) => {
                setSortBy(v);
                setPage(0);
              }}
            />
          </div>
        </div>

        {selectable && selCount > 0 && (
          <div className="wq-bulkbar">
            <strong>{selCount} selected</strong>
            <button
              type="button"
              className="wq-bulk-btn"
              disabled={bulkBusy || allFacilitiesMode}
              title={allFacilitiesMode ? "This account can view only" : undefined}
              onClick={handleMarkDone}
            >
              {bulkBusy ? "Marking done…" : "Mark done"}
            </button>
            <button type="button" className="wq-bulk-btn is-plain" onClick={() => setSelected({})}>
              Clear
            </button>
          </div>
        )}

        {loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            iconOpacity={0.4}
            iconColor="var(--success)"
            title={statusFilter === "pending" ? "All Caught Up!" : "No completed tasks"}
            description={`No ${statusFilter} tasks${taskTypeFilter ? " of this type" : ""}.`}
          />
        ) : visible.length === 0 ? (
          <div className="wq-empty">
            <div className="wq-empty-title">No tasks match these filters</div>
            {filtersActive && (
              <Button variant="outline" size="small" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="wq-table-scroll">
              <table className="wq-table">
                <thead>
                  <tr>
                    <th className="wq-check">
                      {selectable && (
                        <input
                          type="checkbox"
                          aria-label="Select all on this page"
                          checked={allChecked}
                          disabled={bulkRows.length === 0}
                          onChange={toggleAll}
                        />
                      )}
                    </th>
                    <th>Task</th>
                    <th>Case</th>
                    <th>Patient · Payer</th>
                    <th>Raised</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((task) => (
                    <TaskTableRow
                      key={taskKey(task)}
                      task={task}
                      selectable={selectable}
                      checked={!!selected[taskKey(task)]}
                      onToggle={() => toggleOne(task)}
                      onOpen={() => setSelectedTask(task)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="wq-pagination">
              <TablePagination
                page={currentPage}
                pageSize={PAGE_SIZE}
                total={visible.length}
                onPageChange={setPage}
                label="tasks"
              />
            </div>
          </>
        )}
      </div>

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
        onRetryAck={handleRetryAck}
        retryingAck={selectedTask ? !!retrying[taskKey(selectedTask)] : false}
      />
    </div>
  );
}

function TaskTableRow({ task, selectable, checked, onToggle, onOpen }) {
  const bucket = priorityBucket(task);
  const age = ageLabel(task.created_at);
  const title = task.title || task.description;
  const detail = task.title && task.description ? task.description : null;
  const canBulk = selectable && !needsOwnAction(task);
  const ref = task.cashless_case_id
    ? formatCaseRef(task.cashless_case_id)
    : task.claim_id
      ? `Claim ${task.claim_id}`
      : "—";
  const payerLine = (task.payer_name || task.payer_id || task.facility_name) && (
    <>
      {(task.payer_name || task.payer_id) && <PayerName id={task.payer_id} name={task.payer_name} />}
      {task.payer_name || task.payer_id ? (task.facility_name ? ` · ${task.facility_name}` : "") : task.facility_name}
    </>
  );

  return (
    <tr
      className={checked ? "is-selected" : undefined}
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <td
        className="wq-check"
        title={
          selectable && !canBulk
            ? "Answer this from the task itself; it can't be closed in bulk"
            : `${bucket[0].toUpperCase()}${bucket.slice(1)} priority`
        }
        onClick={(e) => {
          if (!canBulk) return;
          e.stopPropagation();
          onToggle();
        }}
      >
        {bucket !== "normal" && <span className={`wq-edge is-${bucket}`} />}
        {selectable && (
          <input type="checkbox" aria-label={`Select ${title}`} checked={checked} disabled={!canBulk} readOnly />
        )}
      </td>
      <td>
        <div className="wq-task">
          <span className="wq-type-tag">{shortTaskType(task.task_type)}</span>
          <span className="wq-task-main">
            <span className={`wq-task-text${bucket === "urgent" ? " is-urgent" : ""}`} title={title}>
              {bucket !== "normal" && <span className={`wq-prio is-${bucket}`}>{bucket === "urgent" ? "Urgent" : "High"}</span>}
              {title}
            </span>
            {detail && (
              <span className="wq-task-detail" title={detail}>
                {detail}
              </span>
            )}
          </span>
        </div>
      </td>
      <td className="wq-mono wq-ref">{ref}</td>
      <td style={{ whiteSpace: "nowrap" }}>
        <div>{task.patient_name || (task.child_id ? `#${task.child_id}` : "—")}</div>
        {payerLine && <div className="wq-sub">{payerLine}</div>}
      </td>
      <td
        className={`wq-mono wq-age${age ? (age.text === "Overdue" ? " is-overdue" : " is-waiting") : ""}`}
        title={task.created_at ? `Created ${formatDateTime(task.created_at)}` : undefined}
      >
        {task.created_at ? formatRelative(task.created_at) : "—"}
      </td>
    </tr>
  );
}
