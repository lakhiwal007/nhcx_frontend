import { useCallback, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, markHandled } from "../../api";
import { TASK_FILTER_OPTIONS, taskHelp, taskNavState, taskOwnScreen, taskScreen, taskShort } from "../../domain/tasks";
import { Button, EmptyState, SkeletonTable, TablePagination, InfoTip, Tip } from "../ui/Common";
import PageActions from "../ui/PageActions";
import Dropdown from "../ui/Dropdown";
import ConfirmModal from "../ui/ConfirmModal";
import PayerName from "../ui/PayerName";
import TaskDrawer from "./TaskDrawer";
import { ageLabel, needsOwnAction, priorityBucket, taskKey, taskRef } from "./taskUtil";
import { usePoll } from "../../hooks/util/usePoll";
import { usePulse, useOnChange } from "../../lib/pulse";
import { useSend } from "../../hooks/util/useSend";
import { formatCaseRef, formatDateTime, formatRelative } from "../../lib/format.js";

const POLL_INTERVAL_MS = 45_000;
const IDLE_INTERVAL_MS = 24 * 3_600_000;
const PAGE_SIZE = 25;
const FETCH_LIMIT = 500;

const STATUS_OPTIONS = [
  { value: "pending", label: "Open" },
  { value: "completed", label: "Completed" },
];

const SORT_OPTIONS = [
  { value: "priority", label: "Most urgent first" },
  { value: "oldest", label: "Waiting longest first" },
  { value: "newest", label: "Newest first" },
];

const PRIORITY_CHIPS = [
  { key: "all", label: "All" },
  { key: "urgent", label: "Urgent" },
  { key: "high", label: "High" },
  { key: "normal", label: "Normal" },
];

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2 };

const createdAt = (t) => Date.parse(t.created_at) || 0;

const SORTERS = {
  priority: (a, b) => PRIORITY_RANK[priorityBucket(a)] - PRIORITY_RANK[priorityBucket(b)] || createdAt(a) - createdAt(b),
  oldest: (a, b) => createdAt(a) - createdAt(b),
  newest: (a, b) => createdAt(b) - createdAt(a),
};

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

export default function WorkQueue({ allFacilitiesMode = false }) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const filterKey = `${statusFilter}|${taskTypeFilter}`;
  const [data, setData] = useState({ key: null, tasks: [] });
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("priority");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState({});
  const [selectedTask, setSelectedTask] = useState(null);
  const [pageError, setPageError] = useState(null);

  const fetchTasks = useCallback(
    async (signal) => {
      try {
        const params = { status: statusFilter, limit: FETCH_LIMIT };
        if (taskTypeFilter) params.task_type = taskTypeFilter;
        const response = await api.listTasks(params, signal);
        if (signal?.aborted) return;
        const list = response?.tasks || [];
        setData({ key: `${statusFilter}|${taskTypeFilter}`, tasks: list, total: response?.total_count ?? list.length });
        setLoadError(false);
      } catch (err) {
        if (err?.name === "AbortError") return;
        markHandled(err);
        const key = `${statusFilter}|${taskTypeFilter}`;
        setLoadError(true);
        setData((prev) => (prev.key === key ? prev : { key, tasks: [], total: 0 }));
      }
    },
    [statusFilter, taskTypeFilter],
  );

  const pulse = usePulse();
  const followsPulse = pulse.available === true;
  const { tick } = usePoll(fetchTasks, {
    active: filterKey,
    intervalMs: statusFilter === "pending" && !followsPulse ? POLL_INTERVAL_MS : IDLE_INTERVAL_MS,
  });
  useOnChange(followsPulse ? pulse.tasksStamp : undefined, () => tick());

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([tick(), pulse.refresh()]);
    setRefreshing(false);
  };

  const loading = data.key !== filterKey;
  const tasks = loading ? [] : data.tasks;

  const resetView = () => {
    setPage(0);
    setSelected({});
  };

  const retryAck = useSend(
    async (task) => {
      await api.acknowledgePayment({ payment_reference: task.action?.payload_hint?.payment_reference });
      await tick();
    },
    { success: "Payment confirmation sent again" },
  );

  const bulk = useSend(
    async (ids) => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          api.completeTask(id, { note: "Marked done from Work Queue" }).catch((err) => {
            markHandled(err);
            throw err;
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected");
      setSelected({});
      await tick();
      if (failed.length) {
        const reason = failed[0].reason?.message;
        throw new Error(`${failed.length} of ${ids.length} tasks could not be marked done${reason ? `: ${reason}` : "."}`);
      }
      return ids.length;
    },
    { confirm: true, success: (n) => `${n} ${n === 1 ? "task" : "tasks"} marked done` },
  );

  const navigateToCase = async (task) => {
    let cid = task.child_id;
    setPageError(null);
    const ownScreen = taskOwnScreen(task.task_type);
    if (ownScreen) {
      navigate(ownScreen, { state: taskNavState(task) });
      return;
    }
    if (!cid && task.cashless_case_id) {
      try {
        const cs = await api.getCashlessStatus(task.cashless_case_id);
        cid = cs.child_id;
      } catch (err) {
        markHandled(err);
        setPageError(err?.message || "The case could not be opened. Try again.");
      }
    }
    if (!cid) {
      setPageError((prev) => prev || "This task is not linked to a patient, so its case cannot be opened. Tell your IT team.");
      return;
    }
    const path = taskScreen(task.task_type, cid, task.workflow) || `/case/${cid}/`;
    navigate(path, { state: taskNavState(task) });
  };

  const q = searchQuery.trim().toLowerCase();
  const searched = tasks.filter((t) => !q || searchHaystack(t).includes(q));
  const chipCounts = { all: searched.length, urgent: 0, high: 0, normal: 0 };
  searched.forEach((t) => chipCounts[priorityBucket(t)]++);

  const visible = searched.filter((t) => priorityFilter === "all" || priorityBucket(t) === priorityFilter).sort(SORTERS[sortBy]);

  const maxPage = Math.max(0, Math.ceil(visible.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const pageRows = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const selectable = statusFilter === "pending";
  const liveKeys = new Set(tasks.map(taskKey));
  const selectedIds = Object.keys(selected).filter((id) => liveKeys.has(id));
  const cutOff = !loading && data.total > tasks.length;
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

  const closeDrawer = () => setSelectedTask(null);

  return (
    <div className="wq-screen">
      <PageActions>
        <Button variant="outline" size="small" icon={RefreshCw} onClick={refresh} disabled={refreshing} title="Refresh tasks">
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </PageActions>

      {loadError && (
        <div className="inline-error-banner" role="alert">
          <AlertCircle size={16} />
          The task list could not be refreshed. This is the last list that loaded. Press Refresh to try again.
        </div>
      )}

      {(pageError || bulk.error) && (
        <div className="inline-error-banner" role="alert">
          <AlertCircle size={16} />
          {pageError || bulk.error}
        </div>
      )}

      <Tip className="wq-page-tip">Everything waiting on the hospital, most urgent first. Click a task to see what to do, then open its case.</Tip>

      {cutOff && (
        <Tip className="wq-page-tip">
          Showing the newest {tasks.length} of {data.total} tasks. To see the older ones, choose a task type.
        </Tip>
      )}

      <div className="wq-panel">
        <div className="wq-toolbar">
          <div className="wq-seg" role="radiogroup" aria-label="Task status">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={statusFilter === o.value}
                className={`wq-seg-btn${statusFilter === o.value ? " is-on" : ""}`}
                onClick={() => {
                  setStatusFilter(o.value);
                  resetView();
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <input
            className="input-modern wq-search"
            aria-label="Search tasks"
            placeholder="Search task, case, claim, patient, payer…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              resetView();
            }}
          />
          <div className="wq-chips" role="group" aria-label="Priority">
            {PRIORITY_CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`wq-chip${priorityFilter === c.key ? " is-on" : ""}`}
                aria-pressed={priorityFilter === c.key}
                onClick={() => {
                  setPriorityFilter(c.key);
                  resetView();
                }}
              >
                <span className={`wq-chip-dot is-${c.key}`} aria-hidden="true" />
                {c.label}
                <span className="wq-chip-count">{chipCounts[c.key]}</span>
              </button>
            ))}
          </div>
          <div className="wq-toolbar-spacer" />
          <div className="wq-filter wq-filter-type">
            <Dropdown
              compact
              ariaLabel="Task type"
              value={taskTypeFilter}
              options={TASK_FILTER_OPTIONS}
              onChange={(v) => {
                setTaskTypeFilter(v);
                resetView();
              }}
            />
          </div>
          <div className="wq-filter wq-filter-sort">
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

        {selectable && selectedIds.length > 0 && (
          <div className="wq-bulkbar">
            <strong>{selectedIds.length} selected</strong>
            <Button
              write
              variant="outline"
              size="small"
              disabled={bulk.busy || allFacilitiesMode}
              disabledReason={allFacilitiesMode ? "This account can view but cannot change anything" : undefined}
              onClick={() => bulk.request(selectedIds)}
            >
              {bulk.busy ? "Marking done…" : "Mark done"}
            </Button>
            <Button variant="text" size="small" onClick={() => setSelected({})}>
              Clear
            </Button>
          </div>
        )}

        {loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : tasks.length === 0 && loadError ? (
          <EmptyState icon={AlertCircle} title="The task list could not be loaded" description="Press Refresh to try again." />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            iconOpacity={0.4}
            iconColor="var(--success)"
            title={statusFilter === "pending" ? "No open tasks" : "No completed tasks"}
            description={
              statusFilter === "pending"
                ? `Nothing is waiting on the hospital${taskTypeFilter ? " for this task type" : ""}. New tasks appear here when a payer answers or a case needs something from you.`
                : `No completed tasks${taskTypeFilter ? " of this type" : ""} yet.`
            }
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
              <TablePagination page={currentPage} pageSize={PAGE_SIZE} total={visible.length} onPageChange={setPage} label="tasks" />
            </div>
          </>
        )}
      </div>

      <TaskDrawer
        task={selectedTask}
        open={!!selectedTask}
        onClose={closeDrawer}
        onDone={() => {
          tick();
          closeDrawer();
        }}
        allFacilitiesMode={allFacilitiesMode}
        onNavigate={navigateToCase}
        retryAck={retryAck}
      />

      <ConfirmModal
        open={bulk.confirming}
        title={`Mark ${selectedIds.length} ${selectedIds.length === 1 ? "task" : "tasks"} done?`}
        subtitle="They are removed from the Work Queue. Nothing is sent to the payer, and tasks that need an answer stay open."
        confirmLabel="Mark done"
        busy={bulk.busy}
        onCancel={bulk.cancel}
        onConfirm={bulk.proceed}
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
  const ref = taskRef(task) || "—";
  const short = taskShort(task.task_type);
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
        title={selectable && !canBulk ? "Open this task to answer it. It cannot be marked done from the list." : `${bucket[0].toUpperCase()}${bucket.slice(1)} priority`}
        onClick={(e) => {
          if (!canBulk) return;
          e.stopPropagation();
          onToggle();
        }}
      >
        {selectable && (
          <input
            type="checkbox"
            aria-label={`Select ${title}`}
            checked={checked}
            disabled={!canBulk}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggle}
          />
        )}
      </td>
      <td>
        <div className="wq-task">
          <span className="wq-type-tag">
            {short}
            {taskHelp(task.task_type) && <InfoTip title={short} text={taskHelp(task.task_type)} />}
          </span>
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
      <td className="wq-nowrap">
        <div>{task.patient_name || (task.child_id ? `#${task.child_id}` : "—")}</div>
        {payerLine && <div className="wq-sub">{payerLine}</div>}
      </td>
      <td className="wq-num wq-age" title={task.created_at ? `Raised ${formatDateTime(task.created_at)}` : undefined}>
        <div>{task.created_at ? formatRelative(task.created_at) : "—"}</div>
        {age && <div className={`wq-sub wq-age-word is-${age.tone}`}>{age.text}</div>}
      </td>
    </tr>
  );
}
