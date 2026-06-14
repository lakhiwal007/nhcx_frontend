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
} from "lucide-react";
import { api } from "../api";
import { PageHeader, Button, Input } from "./Common";
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
  { value: "submit_final_claim", label: "Submit Final Claim" },
  { value: "respond_claim_query", label: "Respond Claim Query" },
  { value: "resubmit_claim", label: "Resubmit Claim" },
  { value: "submit_reprocess", label: "Submit Reprocess" },
  { value: "acknowledge_payment", label: "Acknowledge Payment" },
  { value: "review_payment_ack_failure", label: "Payment Ack Failure" },
  { value: "review_communication", label: "Review Communication" },
];

// Stable code → API path mapping. Never call task.action.endpoint directly —
// if a backend route is renamed, only this map needs updating, not every task row in the DB.
const ACTION_MAP = {
  respond_preauth_query:           "/cashless/preauth/query-response",
  resubmit_preauth:                "/cashless/preauth/resubmit",
  submit_preauth:                  "/cashless/preauth/submit",
  respond_claim_query:             "/cashless/claims/query-response",
  resubmit_claim:                  "/cashless/claims/resubmit",
  submit_discharge_claim:          "/cashless/claims/discharge",
  submit_final_claim:              "/cashless/claims/submit",
  submit_reprocess:                "/cashless/reprocess/submit",
  acknowledge_payment:             "/cashless/payment/acknowledge",
  review_communication:            "/cashless/communication/status",
  attach_eligibility_documents:    "/cashless/coverage_eligibility/check",
  fix_eligibility_error:           "/cashless/coverage_eligibility/check",
  review_insurance_plan_documents: "/cashless/insurance_plan/status",
};

const SCREEN_MAP = {
  review_insurance_plan_documents: (cid) => `/case/${cid}/prep`,
  attach_eligibility_documents: (cid) => `/case/${cid}/prep`,
  fix_eligibility_error: (cid) => `/case/${cid}/prep`,
  submit_preauth: (cid) => `/case/${cid}/review`,
  respond_preauth_query: (cid) => `/case/${cid}/status`,
  resubmit_preauth: (cid) => `/case/${cid}/status`,
  submit_discharge_claim: (cid) => `/case/${cid}/claim`,
  submit_final_claim: (cid) => `/case/${cid}/claim`,
  respond_claim_query: (cid) => `/case/${cid}/claim`,
  resubmit_claim: (cid) => `/case/${cid}/claim`,
  submit_reprocess: (cid) => `/case/${cid}/reprocess`,
  acknowledge_payment: (cid) => `/case/${cid}/payment`,
  review_payment_ack_failure: (cid) => `/case/${cid}/payment`,
  review_communication: () => `/communications`,
};

function ageLabel(createdAt) {
  if (!createdAt) return null;
  const hours = (Date.now() - Date.parse(createdAt)) / 3_600_000;
  if (hours >= OVERDUE_HOURS) return { text: "Overdue", color: "var(--error)" };
  if (hours >= WARN_HOURS)
    return { text: `Waiting ${Math.floor(hours)}h+`, color: "var(--warning)" };
  return null;
}

function SummaryStrip({ tasks }) {
  const urgent = tasks.filter((t) => t.priority === "urgent").length;
  const high = tasks.filter((t) => t.priority === "high").length;
  const normal = tasks.filter(
    (t) => t.priority !== "urgent" && t.priority !== "high",
  ).length;

  const byWorkflow = tasks.reduce((acc, t) => {
    acc[t.workflow] = (acc[t.workflow] || 0) + 1;
    return acc;
  }, {});

  if (tasks.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: "16px",
        alignItems: "center",
        padding: "12px 16px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "10px",
        marginBottom: "20px",
        flexWrap: "wrap",
        fontSize: "13px",
      }}
    >
      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        {urgent > 0 && (
          <span
            style={{
              fontWeight: 700,
              color: "var(--error)",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <AlertTriangle size={14} /> {urgent} Urgent
          </span>
        )}
        {high > 0 && (
          <span style={{ fontWeight: 700, color: "var(--warning)" }}>
            {high} High
          </span>
        )}
        {normal > 0 && (
          <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>
            {normal} Normal
          </span>
        )}
      </div>
      <div
        style={{
          width: "1px",
          height: "16px",
          background: "var(--border-color)",
        }}
      />
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {Object.entries(byWorkflow).map(([wf, count]) => (
          <span
            key={wf}
            style={{ color: "var(--text-muted)", fontSize: "12px" }}
          >
            <strong style={{ color: "var(--text-main)" }}>{count}</strong> {wf}
          </span>
        ))}
      </div>
    </div>
  );
}

function TaskDrawer({ task, open, onClose, onActionComplete }) {
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [completing, setCompleting] = useState(false);

  const taskId = task?.id ?? task?.task_id;

  const handleExecute = async () => {
    if (!task?.action) return;
    setExecuting(true);
    setResult(null);
    try {
      // Resolve URL via ACTION_MAP using stable action.code; fall back to
      // action.endpoint only when the code is unknown (forwards-compatibility).
      const resolvedPath = task.action.code
        ? ACTION_MAP[task.action.code]
        : undefined;
      const url = resolvedPath ?? task.action.endpoint;
      const res = await api.rawPost(url, task.action.payload_hint ?? {});
      setResult({
        success: true,
        correlation_id: res?.correlation_id,
        message: res?.message,
      });
    } catch (err) {
      setResult({ success: false, message: err.message });
    } finally {
      setExecuting(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await api.completeTask(taskId, {
        note: "Actioned from Work Queue",
        metadata: { submitted_correlation_id: result?.correlation_id },
      });
      onActionComplete();
      onClose();
    } catch (_) {
    } finally {
      setCompleting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && task && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(4px)",
              zIndex: 90,
            }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            style={{
              position: "fixed",
              right: 0,
              top: 0,
              bottom: 0,
              width: "min(560px, 95vw)",
              background: "var(--bg-card)",
              borderLeft: "1px solid var(--border-color)",
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
                    gap: "8px",
                    alignItems: "center",
                    marginBottom: "4px",
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
                </div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>
                  {task.title}
                </h3>
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
                padding: "24px",
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

              {task.metadata?.payer_notes && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: "rgba(59,130,246,0.06)",
                    border: "1px solid var(--info)",
                    borderRadius: "10px",
                    fontSize: "13px",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: "var(--info)",
                      marginBottom: "4px",
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
                  {task.required_documents.map((doc, i) => (
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
                      <span style={{ fontWeight: 600 }}>
                        {doc.name || doc.display}
                      </span>
                      <code
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          marginLeft: "auto",
                        }}
                      >
                        {doc.code}
                      </code>
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  padding: "12px 16px",
                  background: "var(--bg-main)",
                  borderRadius: "10px",
                  border: "1px solid var(--border-color)",
                  fontSize: "12px",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: "8px",
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
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>
                      Claim ID:
                    </span>{" "}
                    {task.claim_id || "—"}
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Case ID:</span>{" "}
                    {task.cashless_case_id || "—"}
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Task ID:</span>{" "}
                    {taskId}
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Created:</span>{" "}
                    {task.created_at
                      ? new Date(task.created_at).toLocaleString()
                      : "—"}
                  </div>
                </div>
              </div>

              {result && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: result.success
                      ? "rgba(16,185,129,0.08)"
                      : "rgba(239,68,68,0.08)",
                    border: `1px solid ${result.success ? "var(--success)" : "var(--error)"}`,
                    borderRadius: "10px",
                    fontSize: "13px",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: result.success ? "var(--success)" : "var(--error)",
                      marginBottom: "4px",
                    }}
                  >
                    {result.success ? "Action Submitted" : "Action Failed"}
                  </div>
                  {result.correlation_id && (
                    <code style={{ fontSize: "11px" }}>
                      Correlation: {result.correlation_id}
                    </code>
                  )}
                  {result.message && (
                    <div style={{ color: "var(--text-muted)" }}>
                      {result.message}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                gap: "12px",
              }}
            >
              {!result && task.action && (
                <Button
                  variant="primary"
                  disabled={executing}
                  onClick={handleExecute}
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {executing ? "Executing…" : task.action.label}
                </Button>
              )}
              {result?.success && (
                <Button
                  variant="primary"
                  disabled={completing}
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

export default function WorkQueue() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [caseIdFilter, setCaseIdFilter] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [retrying, setRetrying] = useState({});
  const pollRef = useRef(null);

  const fetchTasks = useCallback(async () => {
    try {
      const params = { status: statusFilter };
      if (workflowFilter) params.workflow = workflowFilter;
      if (taskTypeFilter) params.task_type = taskTypeFilter;
      if (caseIdFilter) params.cashless_case_id = caseIdFilter;
      const response = await api.listTasks(params);
      setTasks(response?.tasks || []);
    } catch (e) {
      console.log("error", e);
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

  const navigateToCase = (task) => {
    const cid = task.child_id;
    const fn = SCREEN_MAP[task.task_type];
    const path = fn ? fn(cid) : cid ? `/case/${cid}/` : "/work-queue";
    navigate(path, {
      state: {
        claim_id: task.claim_id,
        tab: task.task_type?.includes("discharge")
          ? "discharge"
          : task.task_type?.includes("final")
            ? "final"
            : undefined,
      },
    });
  };

  const filteredTasks = tasks.filter((t) => {
    const q = searchQuery.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      String(t.id ?? t.task_id)
        .toLowerCase()
        .includes(q) ||
      String(t.claim_id ?? "").includes(q)
    );
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
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
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
        }}
        onClick={() => setSelectedTask(task)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              position: "relative",
              display: "flex",
              gap: "6px",
              alignItems: "center",
              marginBottom: "5px",
              flexWrap: "wrap",
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
            {age && (
              <span
                style={{ fontSize: "10px", fontWeight: 700, color: age.color }}
              >
                {age.text}
              </span>
            )}
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginLeft: "30px",
              }}
            >
              {task.created_at
                ? new Date(task.created_at).toLocaleDateString()
                : ""}
            </span>
          </div>
          <div
            style={{ fontWeight: 700, fontSize: "14px", marginBottom: "3px" }}
          >
            {task.title}
          </div>
          {task.description && (
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {task.description}
            </div>
          )}
          {task.required_documents?.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                color: "var(--text-muted)",
                marginTop: "5px",
              }}
            >
              <FileText size={11} />
              {task.required_documents.length} document
              {task.required_documents.length > 1 ? "s" : ""} required
            </div>
          )}
          {isAckTask && (
            <div
              style={{
                marginTop: "8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--error)",
                }}
              >
                Payment acknowledgement failed — retry required
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetryAck(task);
                }}
                disabled={!!retrying[taskId]}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 10px",
                  background: "var(--error)",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: retrying[taskId] ? 0.6 : 1,
                }}
              >
                <RotateCcw size={11} />
                {retrying[taskId] ? "Retrying…" : "Retry Ack"}
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <Button
            variant="outline"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              navigateToCase(task);
            }}
          >
            Open Case
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
            gap: "8px",
            marginBottom: "14px",
            color: `var(--${color})`,
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          {color === "error" && <AlertTriangle size={16} />}
          {title} ({sectionTasks.length})
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <AnimatePresence>
            {sectionTasks.map((task) => (
              <TaskRow key={task.id ?? task.task_id} task={task} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  return (
    <div className="work-queue-screen">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <PageHeader
          title="Work Queue"
          subtitle="Pending tasks and required actions from payer callbacks."
        />
        <Button
          variant="outline"
          size="small"
          icon={RefreshCw}
          onClick={fetchTasks}
        >
          Refresh
        </Button>
      </div>

      {statusFilter === "pending" && <SummaryStrip tasks={filteredTasks} />}

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "20px",
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
        <div style={{ display: "flex", gap: "8px" }}>
          {["pending", "completed"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: "8px 16px",
                borderRadius: "20px",
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
      </div>

      {loading ? (
        <div className="flex-center py-20 flex-col">
          <div className="spinner mb-4" />
          <p className="text-muted">Loading tasks…</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="empty-view py-20 text-center">
          <CheckCircle2
            size={48}
            style={{
              opacity: 0.4,
              color: "var(--success)",
              marginBottom: "16px",
            }}
          />
          <h3>All Caught Up!</h3>
          <p className="text-muted mt-2">
            No {statusFilter} tasks match your filters.
          </p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {statusFilter === "pending" ? (
            <>
              <TaskSection title="Urgent" tasks={urgentTasks} color="error" />
              <TaskSection
                title="High Priority"
                tasks={highTasks}
                color="warning"
              />
              <TaskSection
                title="Normal Priority"
                tasks={normalTasks}
                color="primary"
              />
            </>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
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
      />
    </div>
  );
}
