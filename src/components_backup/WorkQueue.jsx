import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, Clock, CheckCircle2, FileText, CreditCard,
  MessageSquare, Send, X, RefreshCw, ChevronRight
} from 'lucide-react';
import { api } from '../api';
import { Card, Button, StatusBadge, PageHeader } from './Common';

const priorityConfig = {
  urgent: { color: 'var(--error)', bg: 'rgba(239,68,68,0.08)', border: '3px solid var(--error)', label: 'URGENT' },
  high: { color: 'var(--warning)', bg: 'rgba(245,158,11,0.08)', border: '3px solid var(--warning)', label: 'HIGH' },
  normal: { color: 'var(--primary)', bg: 'transparent', border: '1px solid var(--border-color)', label: 'NORMAL' }
};

const workflowIcons = {
  preauth: MessageSquare,
  claim: FileText,
  payment: CreditCard,
  communication: AlertCircle,
  reprocess: RefreshCw,
  default: Clock
};

const getAgeLabel = (createdAt) => {
  const diff = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days >= 1) return { label: `${days}d ${hours % 24}h`, overdue: days >= 1, waiting: false };
  if (hours >= 2) return { label: `${hours}h`, overdue: false, waiting: true };
  return { label: `${hours}h`, overdue: false, waiting: false };
};

const TaskCard = ({ task, onOpen }) => {
  const pCfg = priorityConfig[task.priority] || priorityConfig.normal;
  const age = getAgeLabel(task.created_at);
  const WorkflowIcon = workflowIcons[task.workflow] || workflowIcons.default;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="task-card"
      style={{ borderLeft: pCfg.border, background: pCfg.bg }}
      onClick={() => onOpen(task)}
    >
      <div className="task-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="priority-dot" style={{ background: pCfg.color, width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', fontWeight: 800, color: pCfg.color, letterSpacing: '0.5px' }}>{pCfg.label}</span>
          <span className="badge-modern badge-info" style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <WorkflowIcon size={10} />{task.workflow}
          </span>
          <span className="badge-modern" style={{ fontSize: '10px', background: 'var(--bg-card)', color: 'var(--text-muted)' }}>{task.task_type?.replace(/_/g, ' ')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {age.overdue && <span className="badge-modern badge-error" style={{ fontSize: '10px' }}>Overdue</span>}
          {age.waiting && <span className="badge-modern badge-warning" style={{ fontSize: '10px' }}>Waiting {age.label}</span>}
          {!age.overdue && !age.waiting && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{age.label} ago</span>}
          <ChevronRight size={16} color="var(--text-muted)" />
        </div>
      </div>

      <div className="task-card-body">
        <h4 className="task-title">{task.title}</h4>
        <p className="task-desc">{task.description}</p>
      </div>

      {task.required_documents?.length > 0 && (
        <div className="task-docs">
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Required: </span>
          {task.required_documents.map(d => (
            <span key={d.code} className="badge-modern" style={{ fontSize: '10px', background: 'rgba(239,68,68,0.1)', color: 'var(--error)' }}>
              {d.display}
            </span>
          ))}
        </div>
      )}

      <div className="task-footer">
        {task.claim_id && <span className="text-muted" style={{ fontSize: '11px' }}>Claim #{task.claim_id}</span>}
        <Button
          variant="primary"
          onClick={(e) => { e.stopPropagation(); onOpen(task); }}
          style={{ fontSize: '12px', padding: '6px 14px' }}
        >
          {task.action?.label || 'Act'}
        </Button>
      </div>
    </motion.div>
  );
};

const TaskDrawer = ({ task, open, onClose, onComplete }) => {
  const [note, setNote] = useState('');
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await api.completeTask(task.task_id, { note, metadata: {} });
      setDone(true);
      setTimeout(() => { onComplete(); onClose(); }, 1500);
    } catch (err) {
      console.error(err);
    } finally {
      setCompleting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="drawer-panel"
        onClick={e => e.stopPropagation()}
      >
        <div className="drawer-header">
          <h3>{task.title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          {done ? (
            <div className="text-center py-8">
              <CheckCircle2 size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
              <h4>Task Completed</h4>
            </div>
          ) : (
            <>
              <div className="drawer-meta mb-6">
                <div className="meta-row"><span className="meta-label">Workflow</span><span>{task.workflow}</span></div>
                <div className="meta-row"><span className="meta-label">Task Type</span><span>{task.task_type?.replace(/_/g, ' ')}</span></div>
                <div className="meta-row"><span className="meta-label">Claim ID</span><span>#{task.claim_id}</span></div>
                <div className="meta-row"><span className="meta-label">Priority</span><StatusBadge status={task.priority} /></div>
              </div>

              <p style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: 1.6, marginBottom: '20px' }}>{task.description}</p>

              {task.metadata?.payer_notes && (
                <div className="info-block-blue mb-4">
                  <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Payer Notes</div>
                  <p style={{ fontSize: '13px' }}>{task.metadata.payer_notes}</p>
                </div>
              )}

              {task.required_documents?.length > 0 && (
                <div className="mb-6">
                  <h5 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Required Documents</h5>
                  {task.required_documents.map(d => (
                    <div key={d.code} className="doc-row">
                      <FileText size={14} />
                      <span>{d.display}</span>
                      <span className="badge-modern badge-warning" style={{ fontSize: '10px', marginLeft: 'auto' }}>Missing</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mb-6">
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Completion Note</label>
                <textarea
                  className="input-modern"
                  rows={3}
                  placeholder="Add a note for audit trail..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <Button
                className="w-full"
                icon={completing ? RefreshCw : Send}
                disabled={completing}
                onClick={handleComplete}
              >
                {completing ? 'Completing...' : 'Mark Task Complete'}
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const WorkQueue = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listTasks({ status: statusFilter, workflow: workflowFilter || undefined, limit: 20 });
      setTasks(data.tasks || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, workflowFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const urgentCount = tasks.filter(t => t.priority === 'urgent').length;
  const highCount = tasks.filter(t => t.priority === 'high').length;
  const normalCount = tasks.filter(t => t.priority === 'normal').length;

  const openTask = (task) => { setSelectedTask(task); setDrawerOpen(true); };

  return (
    <div className="workqueue-screen">
      <PageHeader
        title="Work Queue"
        subtitle="Payer callbacks and pending actions requiring hospital response."
      />

      {/* Summary strip */}
      <div className="queue-summary-strip">
        <div className="qs-item qs-urgent"><AlertCircle size={16} /><span>{urgentCount} Urgent</span></div>
        <div className="qs-item qs-high"><AlertCircle size={16} /><span>{highCount} High</span></div>
        <div className="qs-item qs-normal"><Clock size={16} /><span>{normalCount} Normal</span></div>
        <div className="qs-divider" />
        <div className="qs-item"><span>{tasks.length} total tasks</span></div>
      </div>

      {/* Filters */}
      <div className="queue-filters">
        <div style={{ display: 'flex', gap: '8px' }}>
          {['pending', 'completed'].map(s => (
            <button
              key={s}
              className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <select
          className="input-modern"
          style={{ width: 'auto', padding: '8px 14px' }}
          value={workflowFilter}
          onChange={e => setWorkflowFilter(e.target.value)}
        >
          <option value="">All Workflows</option>
          {['preauth', 'claim', 'payment', 'reprocess', 'communication'].map(w => (
            <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>
          ))}
        </select>
        <Button variant="outline" icon={RefreshCw} onClick={fetchTasks}>Refresh</Button>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex-center py-16 flex-col">
          <div className="spinner mb-4" />
          <p className="text-muted">Loading tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
          <h3>No pending tasks</h3>
          <p className="text-muted">All caught up! Check back after new payer callbacks arrive.</p>
        </div>
      ) : (
        <div className="task-list">
          <AnimatePresence>
            {tasks.map(task => (
              <TaskCard key={task.task_id} task={task} onOpen={openTask} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {drawerOpen && selectedTask && (
          <TaskDrawer
            task={selectedTask}
            open={drawerOpen}
            onClose={() => { setDrawerOpen(false); setSelectedTask(null); }}
            onComplete={fetchTasks}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default WorkQueue;
