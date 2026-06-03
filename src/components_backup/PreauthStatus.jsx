import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Printer,
  Download,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Send,
  RotateCcw,
  X,
  MessageSquare,
  PlusCircle,
  Stethoscope,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import { Card, Button, StatusBadge, PageHeader } from "./Common";

// ─── Adjudication Table ───────────────────────────────────────────────────────
const AdjudicationTable = ({ items, totals }) => (
  <div className="table-container-modern">
    <table className="table-modern">
      <thead>
        <tr>
          <th>Item</th>
          <th>Submitted</th>
          <th>Eligible</th>
          <th>Benefit</th>
          <th>Copay</th>
        </tr>
      </thead>
      <tbody>
        {items?.map((item, i) => (
          <tr key={i}>
            <td>Item {item.sequence}</td>
            <td>
              {item.adjudication?.submitted
                ? `${item.adjudication.submitted.currency} ${item.adjudication.submitted.value?.toLocaleString()}`
                : "—"}
            </td>
            <td>
              {item.adjudication?.eligible
                ? `${item.adjudication.eligible.currency} ${item.adjudication.eligible.value?.toLocaleString()}`
                : "—"}
            </td>
            <td>
              <strong style={{ color: "var(--success)" }}>
                {item.adjudication?.benefit
                  ? `${item.adjudication.benefit.currency} ${item.adjudication.benefit.value?.toLocaleString()}`
                  : "—"}
              </strong>
            </td>
            <td>
              {item.adjudication?.copay
                ? `${item.adjudication.copay.currency} ${item.adjudication.copay.value?.toLocaleString()}`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {totals && (
      <div
        className="total-panel mt-2 grid-1-to-4"
        style={{
          background: "var(--primary-light)",
          borderRadius: "10px",
          padding: "16px",
          gap: "12px",
        }}
      >
        {[
          { label: "Total Submitted", val: totals.submitted },
          { label: "Total Eligible", val: totals.eligible },
          { label: "Total Benefit", val: totals.benefit, highlight: true },
          { label: "Total Copay", val: totals.copay },
        ].map(({ label, val, highlight }) => (
          <div key={label} className="text-center">
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginBottom: "4px",
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontWeight: 800,
                fontSize: "16px",
                color: highlight ? "var(--primary)" : "var(--text-main)",
              }}
            >
              {val ? `${val.currency} ${val.value?.toLocaleString()}` : "—"}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// ─── Action Drawer ────────────────────────────────────────────────────────────
const ActionDrawer = ({ title, subtitle, open, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="drawer-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h3 style={{ marginBottom: subtitle ? "4px" : 0 }}>{title}</h3>
            {subtitle && (
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </motion.div>
    </div>
  );
};

// ─── Enhancement Drawer Contents ──────────────────────────────────────────────
const EnhancementDrawer = ({
  claimId,
  preauthRef,
  policyNumber,
  onSuccess,
}) => {
  const [items, setItems] = useState([
    {
      service_code: "",
      service_name: "",
      category: "SE",
      quantity: 1,
      unit_price: "",
      net_amount: 0,
    },
  ]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const updateItem = (idx, field, value) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      updated[idx].net_amount =
        (parseFloat(updated[idx].quantity) || 0) *
        (parseFloat(updated[idx].unit_price) || 0);
    }
    setItems(updated);
  };

  const addItem = () =>
    setItems([
      ...items,
      {
        service_code: "",
        service_name: "",
        category: "SE",
        quantity: 1,
        unit_price: "",
        net_amount: 0,
      },
    ]);

  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const totalAmount = items.reduce((s, i) => s + (i.net_amount || 0), 0);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await api.submitPreauthEnhancement({
        claim_id: claimId,
        preauth_ref: preauthRef,
        policy_number: policyNumber,
        items: items.map((item, idx) => ({
          ...item,
          sequence: idx + 1,
          quantity: parseFloat(item.quantity) || 1,
          unit_price: parseFloat(item.unit_price) || 0,
        })),
        total_amount: totalAmount,
        note,
      });
      setResult(res);
      onSuccess && onSuccess(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="text-center py-8">
        <CheckCircle2
          size={48}
          color="var(--success)"
          style={{ margin: "0 auto 16px" }}
        />
        <h4 style={{ marginBottom: "8px" }}>Enhancement Submitted</h4>
        <p
          className="text-muted"
          style={{ fontSize: "13px", marginBottom: "4px" }}
        >
          Correlation ID:
        </p>
        <code style={{ fontSize: "12px", color: "var(--primary)" }}>
          {result.correlation_id}
        </code>
        <p
          className="text-muted"
          style={{ fontSize: "12px", marginTop: "16px", lineHeight: 1.5 }}
        >
          The payer will adjudicate the additional procedures. A new preauth
          status will be available once the decision is received.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Context */}
      <div className="drawer-meta mb-2">
        <div className="meta-row">
          <span className="meta-label">Claim ID</span>
          <span>#{claimId}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Preauth Ref</span>
          <strong style={{ color: "var(--success)" }}>{preauthRef}</strong>
        </div>
        <div className="meta-row">
          <span className="meta-label">Policy</span>
          <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
            {policyNumber}
          </span>
        </div>
      </div>

      {/* Info box */}
      <div className="info-block-blue mb-2">
        <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "4px" }}>
          What is an Enhancement?
        </div>
        <p
          style={{
            fontSize: "12px",
            lineHeight: 1.6,
            color: "var(--text-muted)",
          }}
        >
          Use this when the patient's clinical condition changes after initial
          preauth approval — e.g., an additional procedure is now required. The
          payer will adjudicate only the new items.
        </p>
      </div>

      {/* Additional items */}
      <div style={{ marginBottom: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <label style={{ fontSize: "13px", fontWeight: 700 }}>
            <Stethoscope
              size={14}
              style={{ display: "inline", marginRight: "6px" }}
            />
            Additional Procedures / Services
          </label>
          <Button
            variant="outline"
            icon={PlusCircle}
            onClick={addItem}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            Add Item
          </Button>
        </div>

        {items.map((item, idx) => (
          <div
            key={idx}
            style={{
              background: "var(--bg-main)",
              border: "1px solid var(--border-color)",
              borderRadius: "12px",
              padding: "14px",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                }}
              >
                ITEM {idx + 1}
              </span>
              {items.length > 1 && (
                <button
                  onClick={() => removeItem(idx)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--error)",
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="grid-1-to-2" style={{ gap: "10px" }}>
              <div>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Service Code
                </label>
                <input
                  className="input-modern"
                  placeholder="e.g. 47563"
                  value={item.service_code}
                  onChange={(e) =>
                    updateItem(idx, "service_code", e.target.value)
                  }
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Category
                </label>
                <select
                  className="input-modern"
                  value={item.category}
                  onChange={(e) => updateItem(idx, "category", e.target.value)}
                >
                  {["SE", "ROOM", "ICU", "OT", "MED", "DIAG", "CONS"].map(
                    (c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Service Name
                </label>
                <input
                  className="input-modern"
                  placeholder="e.g. Open cholecystectomy"
                  value={item.service_name}
                  onChange={(e) =>
                    updateItem(idx, "service_name", e.target.value)
                  }
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Quantity
                </label>
                <input
                  className="input-modern"
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Unit Price (₹)
                </label>
                <input
                  className="input-modern"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={item.unit_price}
                  onChange={(e) =>
                    updateItem(idx, "unit_price", e.target.value)
                  }
                />
              </div>
            </div>
            {item.net_amount > 0 && (
              <div
                style={{
                  marginTop: "8px",
                  textAlign: "right",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "var(--primary)",
                }}
              >
                Net: ₹{item.net_amount.toLocaleString()}
              </div>
            )}
          </div>
        ))}

        {/* Total */}
        {totalAmount > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "12px",
              padding: "10px 14px",
              background: "var(--primary-light)",
              borderRadius: "10px",
              marginTop: "8px",
            }}
          >
            <span
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              Additional Total
            </span>
            <span
              style={{
                fontSize: "20px",
                fontWeight: 800,
                color: "var(--primary)",
              }}
            >
              ₹{totalAmount.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Clinical justification */}
      <div style={{ marginBottom: "20px" }}>
        <label
          style={{
            fontSize: "13px",
            fontWeight: 600,
            display: "block",
            marginBottom: "6px",
          }}
        >
          Clinical Justification
        </label>
        <textarea
          className="input-modern"
          rows={3}
          placeholder="Describe why the additional procedure is required..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%", resize: "vertical" }}
        />
      </div>

      <Button
        className="w-full"
        icon={loading ? RefreshCw : Send}
        disabled={
          loading || !items.some((i) => i.service_code && i.service_name)
        }
        onClick={handleSubmit}
      >
        {loading ? "Submitting Enhancement..." : "Submit Preauth Enhancement"}
      </Button>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const PreauthStatus = ({
  correlationId,
  preauthData,
  patient,
  payer,
  policy,
  onDone,
  onNavigateClaims,
  onNavigateReprocess,
}) => {
  const [statusData, setStatusData] = useState(null);
  const [polling, setPolling] = useState(true);
  // drawer: 'query' | 'resubmit' | 'cancel' | 'enhancement'
  const [drawer, setDrawer] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionNote, setActionNote] = useState("");
  const [actionResult, setActionResult] = useState(null);

  useEffect(() => {
    let interval;
    if (correlationId && polling) {
      api
        .getPreauthStatus(correlationId)
        .then((res) => {
          setStatusData(res);
          if (
            res.status === "complete" ||
            res.status === "failed" ||
            res.status === "not_found"
          ) {
            setPolling(false);
          }
        })
        .catch(() => setPolling(false));

      interval = setInterval(async () => {
        try {
          const response = await api.getPreauthStatus(correlationId);
          setStatusData(response);
          if (
            response.status === "complete" ||
            response.status === "failed" ||
            response.status === "not_found"
          ) {
            setPolling(false);
          }
        } catch (error) {
          console.error("Status check error:", error);
          setPolling(false);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [correlationId, polling]);

  const closeDrawer = () => {
    setDrawer(null);
    setActionResult(null);
    setActionNote("");
  };

  const renderDecisionBanner = () => {
    if (!statusData) return null;
    const { decision, preauth_ref } = statusData;
    const bannerConfig = {
      APPROVED: {
        bg: "rgba(16,185,129,0.1)",
        border: "var(--success)",
        color: "var(--success)",
        icon: CheckCircle2,
        text: "Preauthorization Approved",
      },
      PARTIALLY_APPROVED: {
        bg: "rgba(245,158,11,0.1)",
        border: "var(--warning)",
        color: "var(--warning)",
        icon: AlertTriangle,
        text: "Partially Approved",
      },
      QUERIED: {
        bg: "rgba(59,130,246,0.1)",
        border: "#3b82f6",
        color: "#3b82f6",
        icon: HelpCircle,
        text: "Payer Query Received",
      },
      REJECTED: {
        bg: "rgba(239,68,68,0.1)",
        border: "var(--error)",
        color: "var(--error)",
        icon: XCircle,
        text: "Preauthorization Rejected",
      },
    };
    const cfg = bannerConfig[decision];
    if (!cfg) return null;
    const Icon = cfg.icon;
    return (
      <div
        style={{
          background: cfg.bg,
          border: `1.5px solid ${cfg.border}`,
          borderRadius: "14px",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <Icon size={32} color={cfg.color} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "20px", fontWeight: 800, color: cfg.color }}>
            {cfg.text}
          </div>
          {preauth_ref && (
            <div
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              Preauth Ref:{" "}
              <strong style={{ color: "var(--text-main)" }}>
                {preauth_ref}
              </strong>
            </div>
          )}
        </div>
        {preauth_ref && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "var(--primary-light)",
              padding: "8px 14px",
              borderRadius: "8px",
            }}
          >
            <ShieldCheck size={16} color="var(--primary)" />
            <span
              style={{
                fontWeight: 700,
                color: "var(--primary)",
                fontSize: "14px",
              }}
            >
              {preauth_ref}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderActionButtons = () => {
    if (!statusData) return null;
    const { decision } = statusData;
    return (
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {/* ── APPROVED ── */}
        {decision === "APPROVED" && (
          <>
            <Button icon={ArrowRight} onClick={onNavigateClaims}>
              Prepare Claim
            </Button>
            <Button
              variant="outline"
              icon={PlusCircle}
              onClick={() => setDrawer("enhancement")}
              style={{ borderColor: "var(--primary)", color: "var(--primary)" }}
            >
              Request Enhancement
            </Button>
          </>
        )}

        {/* ── PARTIALLY APPROVED ── */}
        {decision === "PARTIALLY_APPROVED" && (
          <>
            <Button icon={ArrowRight} onClick={onNavigateClaims}>
              Prepare Claim
            </Button>
            <Button
              variant="outline"
              icon={PlusCircle}
              onClick={() => setDrawer("enhancement")}
              style={{ borderColor: "var(--primary)", color: "var(--primary)" }}
            >
              Request Enhancement
            </Button>
            <Button
              variant="outline"
              icon={RotateCcw}
              onClick={onNavigateReprocess}
            >
              Reprocess / Appeal
            </Button>
          </>
        )}

        {/* ── QUERIED ── */}
        {decision === "QUERIED" && (
          <>
            <Button icon={MessageSquare} onClick={() => setDrawer("query")}>
              Respond to Query
            </Button>
            <Button
              variant="outline"
              icon={RotateCcw}
              onClick={() => setDrawer("resubmit")}
            >
              Resubmit Preauth
            </Button>
          </>
        )}

        {/* ── REJECTED ── */}
        {decision === "REJECTED" && (
          <>
            <Button
              variant="outline"
              icon={RotateCcw}
              onClick={() => setDrawer("resubmit")}
            >
              Resubmit Preauth
            </Button>
            <Button
              variant="outline"
              icon={RotateCcw}
              onClick={onNavigateReprocess}
            >
              Reprocess / Appeal
            </Button>
          </>
        )}

        {/* ── Cancel (APPROVED / PARTIALLY / QUERIED) ── */}
        {(decision === "APPROVED" ||
          decision === "PARTIALLY_APPROVED" ||
          decision === "QUERIED") && (
          <Button
            variant="outline"
            style={{ color: "var(--error)", borderColor: "var(--error)" }}
            icon={X}
            onClick={() => setDrawer("cancel")}
          >
            Cancel Preauth
          </Button>
        )}
      </div>
    );
  };

  // Generic drawer submit (query / resubmit / cancel)
  const handleGenericDrawerAction = async () => {
    setActionLoading(true);
    try {
      let result;
      if (drawer === "query") {
        result = await api.respondPreauthQuery({
          claim_id: preauthData?.claim_id || 101,
          supporting_documents: [],
        });
      } else if (drawer === "resubmit") {
        result = await api.resubmitPreauth({
          claim_id: preauthData?.claim_id || 101,
          policy_number: policy?.policy_number,
          note: actionNote,
        });
      } else if (drawer === "cancel") {
        result = await api.cancelPreauth({
          claim_id: preauthData?.claim_id || 101,
          preauth_ref: statusData?.preauth_ref,
          reason: "patientrequest",
          description: actionNote || "Cancelled via portal",
        });
      }
      setActionResult(result);
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const genericDrawerTitle =
    {
      query: "Respond to Payer Query",
      resubmit: "Resubmit Preauth",
      cancel: "Cancel Preauth",
    }[drawer] || "";

  const genericDrawerSubtitle =
    {
      query:
        "Submit additional information or documents requested by the payer.",
      resubmit:
        "Correct and resubmit the preauthorization with updated clinical details.",
      cancel: "Cancel this preauthorization request on the NHCX gateway.",
    }[drawer] || "";

  return (
    <div className="status-screen-modern">
      <PageHeader
        title="Pre-authorization Status"
        subtitle="Real-time adjudication results from the insurance payer."
      />

      {/* Case context strip */}
      {(patient || statusData) && (
        <div className="case-context-strip mb-6">
          {patient && (
            <div className="context-field">
              <span className="ctx-label">Patient</span>
              <span className="ctx-value">{patient.name}</span>
            </div>
          )}
          {payer && (
            <div className="context-field">
              <span className="ctx-label">Payer</span>
              <span className="ctx-value">{payer.name}</span>
            </div>
          )}
          {policy && (
            <div className="context-field">
              <span className="ctx-label">Policy</span>
              <span className="ctx-value">{policy.policy_number}</span>
            </div>
          )}
          {statusData?.preauth_ref && (
            <div className="context-field">
              <span className="ctx-label">Preauth Ref</span>
              <span className="ctx-value" style={{ color: "var(--success)" }}>
                {statusData.preauth_ref}
              </span>
            </div>
          )}
          <div className="context-field">
            <span className="ctx-label">Correlation ID</span>
            <span
              className="ctx-value"
              style={{ fontSize: "11px", opacity: 0.7 }}
            >
              {correlationId}
            </span>
          </div>
        </div>
      )}

      {polling && !statusData && (
        <div className="flex-center flex-col py-20">
          <div
            className="spinner mb-4"
            style={{ width: "48px", height: "48px" }}
          />
          <p className="text-muted">Waiting for payer decision...</p>
        </div>
      )}

      {statusData && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {renderDecisionBanner()}

          {/* Actions */}
          <Card title="Available Actions">
            {renderActionButtons()}
            {(!statusData.decision || polling) && (
              <div
                style={{ display: "flex", gap: "12px", alignItems: "center" }}
              >
                <Button
                  variant="outline"
                  icon={RefreshCw}
                  onClick={() => setPolling(true)}
                >
                  Refresh Status
                </Button>
                {polling && (
                  <span className="text-muted" style={{ fontSize: "13px" }}>
                    Polling every 5s...
                  </span>
                )}
              </div>
            )}
          </Card>

          {/* Adjudication */}
          {statusData.items?.length > 0 && (
            <Card title="Adjudication Details">
              <AdjudicationTable
                items={statusData.items}
                totals={statusData.totals}
              />
            </Card>
          )}

          {/* Payer Notes */}
          {statusData.process_notes?.length > 0 && (
            <Card title="Payer Notes">
              {statusData.process_notes.map((note, i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--bg-main)",
                    borderRadius: "10px",
                    padding: "14px 18px",
                    marginBottom: "10px",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      marginBottom: "4px",
                    }}
                  >
                    Note #{note.number} · {note.type}
                  </div>
                  <div style={{ fontSize: "14px", color: "var(--text-main)" }}>
                    {note.text}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Errors */}
          {statusData.errors?.length > 0 && (
            <Card title="Errors">
              {statusData.errors.map((err, i) => (
                <div key={i} className="warning-banner">
                  {typeof err === "string" ? err : JSON.stringify(err)}
                </div>
              ))}
            </Card>
          )}

          {/* Gateway status detail */}
          <Card>
            <div
              className="flex-between pb-4"
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              <span className="text-muted" style={{ fontSize: "13px" }}>
                Gateway Status
              </span>
              <StatusBadge status={statusData.status} />
            </div>
            <div className="flex-between pt-4">
              <span className="text-muted" style={{ fontSize: "13px" }}>
                Workflow
              </span>
              <span style={{ fontWeight: 600 }}>
                {statusData.workflow || "preauth"}
              </span>
            </div>
          </Card>

          {/* Print / Download for approved */}
          {statusData.decision === "APPROVED" && (
            <div
              style={{ display: "flex", gap: "12px", justifyContent: "center" }}
            >
              <Button variant="outline" icon={Printer}>
                Print Voucher
              </Button>
              <Button variant="outline" icon={Download}>
                Download Letter
              </Button>
            </div>
          )}

          <Button className="w-full" onClick={onDone} icon={ArrowRight}>
            Back to Dashboard
          </Button>
        </div>
      )}

      {/* ── Enhancement Drawer ── */}
      <ActionDrawer
        title="Request Preauth Enhancement"
        subtitle="Add additional procedures to the existing approved preauthorization."
        open={drawer === "enhancement"}
        onClose={closeDrawer}
      >
        <EnhancementDrawer
          claimId={preauthData?.claim_id || 101}
          preauthRef={statusData?.preauth_ref}
          policyNumber={policy?.policy_number || preauthData?.policy_number}
          onSuccess={() => {}}
        />
      </ActionDrawer>

      {/* ── Generic Drawers (query / resubmit / cancel) ── */}
      <ActionDrawer
        title={genericDrawerTitle}
        subtitle={genericDrawerSubtitle}
        open={!!drawer && drawer !== "enhancement"}
        onClose={closeDrawer}
      >
        {actionResult ? (
          <div className="text-center py-8">
            <CheckCircle2
              size={48}
              color="var(--success)"
              style={{ margin: "0 auto 16px" }}
            />
            <h4 style={{ marginBottom: "8px" }}>Submitted Successfully</h4>
            <p className="text-muted" style={{ fontSize: "13px" }}>
              Correlation ID: {actionResult.correlation_id}
            </p>
            <Button
              className="mt-6"
              onClick={() => {
                closeDrawer();
                setPolling(true);
              }}
            >
              Close & Refresh
            </Button>
          </div>
        ) : (
          <div>
            {drawer === "cancel" && (
              <div
                className="warning-banner mb-4"
                style={{ display: "flex", gap: "10px", alignItems: "center" }}
              >
                <AlertTriangle size={18} />
                <span>
                  Cancelling a preauth is irreversible for this workflow.
                </span>
              </div>
            )}
            <div className="mb-4">
              <label
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                {drawer === "query"
                  ? "Query Response"
                  : drawer === "resubmit"
                    ? "Correction / Changes Made"
                    : "Cancellation Reason"}
              </label>
              <textarea
                className="input-modern"
                rows={4}
                placeholder={
                  drawer === "query"
                    ? "Describe the clinical information or document links being provided..."
                    : drawer === "resubmit"
                      ? "Describe what was corrected in this resubmission..."
                      : "Reason for cancellation..."
                }
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>
            <Button
              className="w-full"
              icon={actionLoading ? RefreshCw : Send}
              disabled={actionLoading}
              onClick={handleGenericDrawerAction}
            >
              {actionLoading ? "Submitting..." : "Submit"}
            </Button>
          </div>
        )}
      </ActionDrawer>
    </div>
  );
};

export default PreauthStatus;
