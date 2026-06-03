import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  CreditCard,
  Users,
  PlayCircle,
  X,
  User,
  Phone,
  Calendar,
  Stethoscope,
  Receipt,
  BadgeIndianRupee,
  Building2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Clock,
  AlertTriangle,
  CheckCircle,
  ShieldAlert,
} from "lucide-react";
import { api } from "../api";
import { listActiveWorkflows, routeLabel } from "../workflowStorage";
import { Card, Button, StatusBadge } from "./Common";

import PatientModal from "./PatientModal";

const Dashboard = ({ onSelectPatient, onResume }) => {
  const [stats, setStats] = useState(null);
  const [claims, setClaims] = useState([]);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [modalPatient, setModalPatient] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [activeWorkflows] = useState(() => listActiveWorkflows());
  const [dismissedBanner, setDismissedBanner] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  const fetchClaims = useCallback(async () => {
    try {
      const data = await api.getDashboardClaims({ limit: 20, offset: 0 });
      setClaims(data.claims || []);
    } catch (error) {
      console.error("Error fetching claims:", error);
    } finally {
      setClaimsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchClaims();
  }, [fetchStats, fetchClaims]);

  const openPatientModal = async (childId, patientName) => {
    setModalLoading(true);
    setModalPatient({ name: patientName, child_id: childId }); // show skeleton immediately
    try {
      const res = await api.searchChildren({
        child_id: childId,
        name: patientName,
      });
      const found = res.children?.find((c) => c.child_id === childId);
      setModalPatient(found || { name: patientName, child_id: childId });
    } catch (err) {
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

  const getClaimRowAction = (claim) => {
    if (!claim.status || claim.status === "draft") {
      const hasInProgress = activeWorkflows.some(wf => wf.patient?.child_id === claim.child_id);
      if (hasInProgress) {
        return { label: "Resume Workflow", variant: "secondary", action: "resume" };
      }
      return { label: "Start Workflow", variant: "primary", route: "payer" };
    }
    if (claim.claim_decision === "QUERIED")
      return { label: "Open Query Task", variant: "outline", route: "reprocess" };
    if (
      claim.claim_decision === "APPROVED" ||
      claim.claim_decision === "PARTIALLY_APPROVED"
    )
      return { label: "View Payment", variant: "outline", route: "payment" };
    if (claim.payment_status === "PAYMENT_SETTLED")
      return { label: "View UTR", variant: "outline", route: "payment" };
    if (claim.status === "pending")
      return { label: "View Status", variant: "outline", route: "status" };
    return { label: "View", variant: "outline", route: "payer" };
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07 } },
  };
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

  const statCards = stats
    ? [
        {
          label: "Total Claims",
          value: stats.claims.total,
          icon: FileText,
          colorClass: "stat-icon-primary",
        },
        {
          label: "Pending",
          value: stats.claims.pending,
          icon: Clock,
          colorClass: "stat-icon-warning",
        },
        {
          label: "Partial",
          value: stats.claims.partial,
          icon: AlertTriangle,
          colorClass: "stat-icon-info",
        },
        {
          label: "Complete",
          value: stats.claims.complete,
          icon: CheckCircle,
          colorClass: "stat-icon-success",
        },
        {
          label: "Failed",
          value: stats.claims.failed,
          icon: ShieldAlert,
          colorClass: "stat-icon-error",
        },
        {
          label: "Preauth Pending",
          value: stats.claims.preauth_pending,
          icon: CreditCard,
          colorClass: "stat-icon-warning",
        },
        {
          label: "Children with Claims",
          value: stats.children.with_claims,
          icon: Users,
          colorClass: "stat-icon-info",
        },
      ]
    : [];

  return (
    <div className="dashboard-modern">
      {/* Title */}
      <div className="page-header-modern">
        <h1>Cashless Claims Dashboard</h1>
        <p>
          Overview of all cashless cases. Click a patient name to view full
          details.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="stats-grid-modern"
        >
          {statCards.map((s) => (
            <motion.div
              key={s.label}
              variants={item}
              className="stat-card-modern"
            >
              <div className="stat-card-num">
                <div className={`stat-icon-wrapper ${s.colorClass}`}>
                  <s.icon size={22} />
                </div>
                <span className="stat-value-modern">{s.value}</span>
              </div>
              <span className="stat-label-modern">{s.label}</span>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Claims table */}
      <Card title="Cashless Claims">
        <div className="table-container-modern">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Claim ID</th>
                <th>Use Type</th>
                <th>Status</th>
                <th>Decision</th>
                <th>Approved Amt</th>
                <th>Payment</th>
                <th>UTR</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {claimsLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted">
                    Loading claims...
                  </td>
                </tr>
              ) : claims.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="text-center py-12">
                      <FileText
                        size={40}
                        className="text-muted mb-4 mx-auto"
                        style={{ opacity: 0.2 }}
                      />
                      <p className="text-muted">No cashless cases yet.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                claims.map((claim) => {
                  const rowAction = getClaimRowAction(claim);
                  return (
                    <motion.tr key={claim.id} layoutId={`claim-${claim.id}`}>
                      <td>
                        <button
                          onClick={() =>
                            openPatientModal(
                              claim.child_id,
                              claim.patient_name || claim.child_name,
                            )
                          }
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            fontWeight: 700,
                            color: "var(--primary)",
                            fontSize: "14px",
                            textDecoration: "underline",
                            textDecorationStyle: "dotted",
                            textUnderlineOffset: "3px",
                          }}
                        >
                          {claim.patient_name || claim.child_name}
                        </button>
                      </td>
                      <td>
                        <code
                          style={{
                            background: "var(--primary-light)",
                            color: "var(--primary)",
                            padding: "3px 7px",
                            borderRadius: "5px",
                            fontWeight: 700,
                          }}
                        >
                          #{claim.id}
                        </code>
                      </td>
                      <td>
                        <span
                          className="badge-modern badge-info"
                          style={{ fontSize: "11px" }}
                        >
                          {claim.use_type || "—"}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={claim.status} />
                      </td>
                      <td>
                        {claim.claim_decision ? (
                          <StatusBadge status={claim.claim_decision} />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {claim.approved_amount ? (
                          <strong>
                            ₹{claim.approved_amount.toLocaleString()}
                          </strong>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {claim.payment_status ? (
                          <StatusBadge status={claim.payment_status} />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {claim.latest_utr ? (
                          <code
                            style={{
                              fontSize: "11px",
                              color: "var(--success)",
                            }}
                          >
                            {claim.latest_utr}
                          </code>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <Button
                          variant={rowAction.variant}
                          icon={rowAction.action === 'resume' ? RotateCcw : undefined}
                          onClick={() => {
                            if (rowAction.action === "resume") {
                              onResume && onResume(claim.child_id);
                            } else {
                              onSelectPatient &&
                                onSelectPatient(
                                  {
                                    child_id: claim.child_id,
                                    name: claim.patient_name,
                                  },
                                  rowAction.route
                                );
                            }
                          }}
                        >
                          {rowAction.label}
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Patient detail modal */}
      <AnimatePresence>
        {modalPatient && (
          <PatientModal
            patient={modalLoading ? modalPatient : modalPatient}
            loading={modalLoading}
            onClose={() => setModalPatient(null)}
            onStartWorkflow={(p, route) => onSelectPatient && onSelectPatient(p, route)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
