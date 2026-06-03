import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search,
  ArrowRight,
  Activity,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Users,
} from "lucide-react";
import { api } from "../api";
import { PageHeader, Card, StatusBadge, Button, Input } from "./Common";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsData, claimsData] = await Promise.all([
          api.getDashboardStats(),
          api.getDashboardClaims(),
        ]);
        setStats(statsData);
        setClaims(claimsData?.claims || []);
      } catch (error) {
        console.error("Dashboard fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredClaims = claims.filter(
    (c) =>
      c.patient_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id?.toString().includes(searchQuery),
  );

  return (
    <div className="dashboard-screen">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <PageHeader
          title="Cashless Cases"
          subtitle="Overview of all active and past claims"
        />
        <Button variant="primary" onClick={() => navigate("/registry")}>
          New Cashless Case
        </Button>
      </div>

      {loading ? (
        <div className="flex-center py-20 flex-col">
          <div className="spinner mb-4" />
          <p className="text-muted">Loading dashboard data...</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Metrics */}
          {stats && (
            <div
              className="dashboard-metrics-grid"
              style={{ marginBottom: "30px" }}
            >
              {[
                {
                  label: "Total Claims",
                  value: stats.claims?.total,
                  icon: FileText,
                  color: "var(--primary)",
                },
                {
                  label: "Preauth Pending",
                  value: stats.claims?.preauth_pending,
                  icon: Activity,
                  color: "var(--info)",
                },
                {
                  label: "Pending Adjudication",
                  value: stats.claims?.pending,
                  icon: Clock,
                  color: "var(--warning)",
                },
                {
                  label: "Partially Approved",
                  value: stats.claims?.partial,
                  icon: AlertTriangle,
                  color: "var(--warning)",
                },
                {
                  label: "Approved / Complete",
                  value: stats.claims?.complete,
                  icon: CheckCircle,
                  color: "var(--success)",
                },
                {
                  label: "Failed / Rejected",
                  value: stats.claims?.failed,
                  icon: XCircle,
                  color: "var(--error)",
                },
                {
                  label: "Children with Claims",
                  value: stats.children?.with_claims,
                  icon: Users,
                  color: "var(--accent)",
                },
              ].map((stat, i) => (
                <Card key={i}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "12px",
                        background: `${stat.color}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: stat.color,
                      }}
                    >
                      <stat.icon size={24} />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-muted)",
                          fontWeight: 600,
                        }}
                      >
                        {stat.label}
                      </div>
                      <div
                        style={{
                          fontSize: "20px",
                          fontWeight: 800,
                          color: "var(--text-main)",
                        }}
                      >
                        {stat.value || 0}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Claims Table */}
          <Card title="Recent Claims">
            <div
              style={{
                display: "flex",
                gap: "16px",
                marginBottom: "20px",
                maxWidth: "400px",
              }}
            >
              <Input
                icon={Search}
                placeholder="Search patient or claim ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="table-responsive-wrapper">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Claim ID</th>
                    <th>Patient</th>
                    <th>Use Type</th>
                    <th>Status</th>
                    <th>Decision</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClaims.map((claim) => (
                    <tr key={claim.id}>
                      <td style={{ fontWeight: 700 }}>#{claim.id}</td>
                      <td style={{ fontWeight: 600 }}>{claim.patient_name}</td>
                      <td>
                        <span
                          className="badge-modern badge-info"
                          style={{
                            fontSize: "10px",
                            textTransform: "capitalize",
                          }}
                        >
                          {claim.use_type}
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
                      <td
                        style={{ fontSize: "13px", color: "var(--text-muted)" }}
                      >
                        {new Date(claim.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <Button
                          variant="outline"
                          size="small"
                          icon={ArrowRight}
                          onClick={() => {
                            let route = `/case/${claim.child_id}/`;
                            if (claim.use_type === 'claim' && claim.payment_status === 'PAYMENT_SETTLED') {
                              route = `/case/${claim.child_id}/payment`;
                            } else if (claim.use_type === 'claim') {
                              route = `/case/${claim.child_id}/claim`;
                            } else if (claim.status === 'draft') {
                              route = `/case/${claim.child_id}/review`;
                            } else if (claim.status === 'pending' || claim.status === 'complete') {
                              route = `/case/${claim.child_id}/status`;
                            }
                            navigate(route);
                          }}
                        >
                          View Case
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredClaims.length === 0 && (
                    <tr>
                      <td colSpan="7" className="text-center py-8 text-muted">
                        No claims found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
