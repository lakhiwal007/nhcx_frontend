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
  Inbox
} from "lucide-react";
import { api } from "../api";
import { resolveAction } from "../api/actionMap";
import { Button, Input, EmptyState, LoadingBlock } from "./Common";
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
        gap: "var(--space-4)",
        alignItems: "center",
        padding: "12px 16px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-md)",
        marginBottom: "var(--space-5)",
        flexWrap: "wrap",
        fontSize: "13px",
      }}
    >
      <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
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
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
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

function TaskDrawer({ task, open, onClose, onActionComplete, allFacilitiesMode, onNavigate }) {
  const [completing, setCompleting] = useState(false);

  const taskId = task?.id ?? task?.task_id;

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
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>
                      Claim ID:
                    </span>{" "}
                    {task.claim_id || "-"}
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Case ID:</span>{" "}
                    {task.cashless_case_id || "-"}
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Task ID:</span>{" "}
                    {taskId}
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Created:</span>{" "}
                    {task.created_at
                      ? new Date(task.created_at).toLocaleString()
                      : "-"}
                  </div>
                </div>
              </div>

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
              {task.action && (
                <Button
                  variant="primary"
                  disabled={allFacilitiesMode}
                  title={allFacilitiesMode ? "Select a facility in Settings to act on this task" : undefined}
                  onClick={handleNavigate}
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {task.action.label || "Review Case"} &rarr;
                </Button>
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
    const fn = SCREEN_MAP[task.task_type];
    const path = fn ? fn(cid) : `/case/${cid}/`;
    navigate(path, {
      state: {
        claim_id: task.claim_id,
        cashless_case_id: task.cashless_case_id,
        openAction:
          task.task_type === "resubmit_preauth" ? "resubmit_preauth" :
          task.task_type === "respond_preauth_query" ? "respond_preauth_query" :
          task.task_type === "resubmit_claim" ? "resubmit_claim" :
          task.task_type === "respond_claim_query" ? "respond_claim_query" :
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
        
        <div style={{ fontWeight: 700, fontSize: "14px", lineHeight: "1.3" }}>
          {task.title}
        </div>
        
        <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{task.created_at ? new Date(task.created_at).toLocaleDateString() : ""}</span>
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
      <div style={{ flex: 1, minWidth: "300px", maxWidth: "33%", background: "color-mix(in srgb, var(--bg-main) 60%, transparent)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", margin: 0, color: `var(--${color})`, fontSize: "14px", fontWeight: 700 }}>
          {color === "error" && <AlertTriangle size={16} />}
          {title} <span style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", color: "var(--text-main)", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", marginLeft: "auto" }}>{sectionTasks.length}</span>
        </h3>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", minHeight: "150px" }}>
          <AnimatePresence>
            {sectionTasks.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-color)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Inbox size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)" }}>No {title.toLowerCase()}</div>
                <div style={{ fontSize: "12px", marginTop: "var(--space-1)" }}>All caught up here.</div>
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
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          marginBottom: "var(--space-4)",
        }}
      >
        <Button
          variant="outline"
          size="small"
          icon={RefreshCw}
          onClick={fetchTasks}
        >
          Refresh
        </Button>
      </div>

      {loadError && (
        <div className="inline-error-banner">
          <AlertCircle size={16} />
          Could not refresh the task list. Showing the last known results, if any.
        </div>
      )}

      {statusFilter === "pending" && <SummaryStrip tasks={filteredTasks} />}

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
        
        <div style={{ display: "flex", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: "var(--space-1)", marginLeft: "auto", gap: "var(--space-1)" }}>
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
              <div style={{ display: "flex", gap: "var(--space-6)", overflowX: "auto", paddingBottom: "16px", alignItems: "flex-start" }}>
                <KanbanColumn title="Urgent" tasks={urgentTasks} color="error" />
                <KanbanColumn title="High Priority" tasks={highTasks} color="warning" />
                <KanbanColumn title="Normal Priority" tasks={normalTasks} color="primary" />
              </div>
            ) : (
              <>
                <TaskSection title="Urgent" tasks={urgentTasks} color="error" />
                <TaskSection title="High Priority" tasks={highTasks} color="warning" />
                <TaskSection title="Normal Priority" tasks={normalTasks} color="primary" />
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
