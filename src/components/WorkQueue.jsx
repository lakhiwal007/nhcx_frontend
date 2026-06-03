import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Search, Filter, AlertTriangle } from "lucide-react";
import { api } from "../api";
import { PageHeader, Card, TaskCard, Button, Input } from "./Common";
import { useNavigate } from "react-router-dom";

export default function WorkQueue() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await api.listTasks();
      setTasks(response?.tasks || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleTaskClick = (task) => {
    const type = task.task_type;
    const cid = task.child_id;

    switch (type) {
      case "review_insurance_plan_documents":
      case "attach_eligibility_documents":
      case "fix_eligibility_error":
        navigate(`/case/${cid}/prep`);
        break;
      case "submit_preauth":
        navigate(`/case/${cid}/review`);
        break;
      case "respond_preauth_query":
      case "resubmit_preauth":
        navigate(`/case/${cid}/status`);
        break;
      case "submit_discharge_claim":
        navigate(`/case/${cid}/claim`, { 
          state: { 
            tab: "discharge",
            claim_id: task.claim_id || task.action?.payload_hint?.claim_id
          } 
        });
        break;
      case "submit_final_claim":
        navigate(`/case/${cid}/claim`, { 
          state: { 
            tab: "final",
            claim_id: task.claim_id || task.action?.payload_hint?.claim_id
          } 
        });
        break;
      case "respond_claim_query":
      case "resubmit_claim":
        navigate(`/case/${cid}/claim`, { state: { tab: "decision" } });
        break;
      case "submit_reprocess":
        navigate(`/case/${cid}/reprocess`);
        break;
      case "acknowledge_payment":
      case "review_payment_ack_failure":
        navigate(`/case/${cid}/payment`);
        break;
      case "review_communication":
        navigate(`/communications`);
        break;
      default:
        // Fallback to older endpoint-based routing if task_type is missing/unknown
        if (task.action?.endpoint?.includes("preauth/query-response")) {
          navigate(`/case/${cid}/status`);
        } else if (task.action?.endpoint?.includes("claims/submit")) {
          navigate(`/case/${cid}/claim`);
        } else if (task.action?.endpoint?.includes("payment/acknowledge")) {
          navigate(`/case/${cid}/payment`);
        } else {
          navigate(`/case/${cid}/`);
        }
        break;
    }
  };

  const filteredTasks = tasks.filter(
    (t) =>
      t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.task_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const urgentTasks = filteredTasks.filter((t) => t.priority === "urgent");
  const highTasks = filteredTasks.filter((t) => t.priority === "high");
  const normalTasks = filteredTasks.filter((t) => t.priority === "normal");

  const TaskSection = ({ title, tasks, icon: Icon, color }) => {
    if (tasks.length === 0) return null;
    return (
      <div className="mb-8">
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", color: `var(--${color})`, fontSize: "16px", fontWeight: 700 }}>
          {Icon && <Icon size={20} />} {title} ({tasks.length})
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <AnimatePresence>
            {tasks.map((task) => (
              <motion.div
                key={task.task_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
              >
                <TaskCard task={task} onClick={() => handleTaskClick(task)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  return (
    <div className="work-queue-screen">
      <PageHeader
        title="Work Queue"
        subtitle="Manage pending tasks and required actions."
      />

      <div style={{ display: "flex", gap: "16px", marginBottom: "24px", maxWidth: "600px" }}>
        <div style={{ flex: 1 }}>
          <Input
            icon={Search}
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" icon={Filter}>Filter</Button>
      </div>

      {loading ? (
        <div className="flex-center py-20 flex-col">
          <div className="spinner mb-4" />
          <p className="text-muted">Loading pending tasks...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="empty-view py-20 text-center">
          <CheckCircle2 size={48} className="text-muted mb-4 mx-auto" style={{ opacity: 0.5, color: "var(--success)" }} />
          <h3>All Caught Up!</h3>
          <p className="text-muted mt-2">There are no pending tasks requiring your action.</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <TaskSection title="Urgent Tasks" tasks={urgentTasks} icon={AlertTriangle} color="error" />
          <TaskSection title="High Priority" tasks={highTasks} color="warning" />
          <TaskSection title="Normal Priority" tasks={normalTasks} color="primary" />
        </motion.div>
      )}
    </div>
  );
}
