import { useState } from "react";
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
} from "lucide-react";
import { Card, Button, StatusBadge } from "./Common";

const PatientModal = ({ patient, onClose, onStartWorkflow }) => {
  const [expandedVisit, setExpandedVisit] = useState(0);
  const [expandedInvoice, setExpandedInvoice] = useState(null);

  if (!patient) return null;

  const lc = patient.latest_claim;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 28, stiffness: 350 }}
        className="patient-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="patient-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="patient-avatar-lg">
              {patient.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 800,
                  marginBottom: "4px",
                }}
              >
                {patient.name}
              </h2>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <span
                  className="badge-modern badge-info"
                  style={{ fontSize: "11px" }}
                >
                  #{patient.child_id}
                </span>
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    textTransform: "capitalize",
                  }}
                >
                  {patient.gender}
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  DOB: {patient.dob}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <Button
              variant="primary"
              icon={PlayCircle}
              onClick={() => {
                onClose();
                onStartWorkflow(patient);
              }}
            >
              Start Workflow
            </Button>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: "8px",
              }}
            >
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="patient-modal-body">
          {/* ── Quick Info ── */}
          <div className="pm-section-grid">
            {[
              { icon: User, label: "Full Name", value: patient.name },
              { icon: Phone, label: "Mobile", value: patient.mobile || "—" },
              {
                icon: Calendar,
                label: "Date of Birth",
                value: patient.dob || "—",
              },
              {
                icon: Users,
                label: "Gender",
                value: patient.gender,
                capitalize: true,
              },
              {
                icon: Building2,
                label: "Cashless Cases",
                value: patient.cashless_cases_count,
              },
              {
                icon: Calendar,
                label: "Registered",
                value: patient.created_at
                  ? new Date(patient.created_at).toLocaleDateString("en-IN", {
                      dateStyle: "medium",
                    })
                  : "—",
              },
            ].map(({ icon: Icon, label, value, capitalize }) => (
              <div key={label} className="pm-info-chip">
                <div className="pm-info-icon">
                  <Icon size={15} />
                </div>
                <div>
                  <div className="pm-info-label">{label}</div>
                  <div
                    className="pm-info-value"
                    style={capitalize ? { textTransform: "capitalize" } : {}}
                  >
                    {value}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Latest Claim / Case ── */}
          {lc && (
            <div className="pm-section">
              <div className="pm-section-title">
                <CreditCard size={15} /> Latest Cashless Case
              </div>
              <div className="pm-card">
                <div className="pm-row-grid">
                  <div>
                    <span className="pm-field-label">Case ID</span>
                    <span className="pm-field-val">#{lc.cashless_case_id}</span>
                  </div>
                  <div>
                    <span className="pm-field-label">Claim ID</span>
                    <span className="pm-field-val">#{lc.claim_id}</span>
                  </div>
                  <div>
                    <span className="pm-field-label">Status</span>
                    <StatusBadge status={lc.status} />
                  </div>
                  <div>
                    <span className="pm-field-label">Preauth Status</span>
                    <StatusBadge status={lc.preauth_status || "N/A"} />
                  </div>
                  <div>
                    <span className="pm-field-label">Payer</span>
                    <span className="pm-field-val">{lc.payer_code}</span>
                  </div>
                  <div>
                    <span className="pm-field-label">Policy</span>
                    <span
                      className="pm-field-val"
                      style={{ fontFamily: "monospace", fontSize: "12px" }}
                    >
                      {lc.policy_number}
                    </span>
                  </div>
                  <div>
                    <span className="pm-field-label">Current Step</span>
                    <span
                      className="pm-field-val"
                      style={{ color: "var(--primary)" }}
                    >
                      {lc.current_step?.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div>
                    <span className="pm-field-label">Created</span>
                    <span className="pm-field-val">
                      {new Date(lc.created_at).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Visits ── */}
          {patient.visits?.length > 0 && (
            <div className="pm-section">
              <div className="pm-section-title">
                <Stethoscope size={15} /> Visits & Admissions
              </div>
              {patient.visits.map((visit, vi) => (
                <div key={vi} className="pm-visit-block">
                  {/* Visit header — clickable to expand */}
                  <div
                    className="pm-visit-header"
                    onClick={() =>
                      setExpandedVisit(expandedVisit === vi ? null : vi)
                    }
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <span
                        className="badge-modern badge-info"
                        style={{ fontSize: "11px", textTransform: "uppercase" }}
                      >
                        {visit.visit_type}
                      </span>
                      <strong style={{ fontSize: "14px" }}>
                        {visit.admission_no || `Visit ${vi + 1}`}
                      </strong>
                      <StatusBadge status={visit.status} />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        color: "var(--text-muted)",
                        fontSize: "12px",
                      }}
                    >
                      <span>
                        {visit.started_at
                          ? new Date(visit.started_at).toLocaleDateString(
                              "en-IN",
                              { dateStyle: "medium" },
                            )
                          : "—"}
                      </span>
                      {expandedVisit === vi ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedVisit === vi && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pm-visit-body"
                      >
                        {/* Visit meta */}
                        <div
                          className="pm-row-grid"
                          style={{ marginBottom: "16px" }}
                        >
                          <div>
                            <span className="pm-field-label">Diagnosis</span>
                            <span className="pm-field-val">
                              {visit.diagnosis || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="pm-field-label">Reason</span>
                            <span className="pm-field-val">
                              {visit.reason || "—"}
                            </span>
                          </div>
                          {visit.primary_doctor && (
                            <div style={{ gridColumn: "span 2" }}>
                              <span className="pm-field-label">
                                Primary Doctor
                              </span>
                              <span className="pm-field-val">
                                {visit.primary_doctor.name} ·{" "}
                                {visit.primary_doctor.specialization}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Invoices */}
                        {visit.invoices?.length > 0 && (
                          <div style={{ marginBottom: "16px" }}>
                            <div className="pm-sub-title">
                              <Receipt size={13} /> Invoices
                            </div>
                            {visit.invoices.map((inv, ii) => (
                              <div key={ii} className="pm-invoice-block">
                                <div
                                  className="pm-invoice-header"
                                  onClick={() =>
                                    setExpandedInvoice(
                                      expandedInvoice === `${vi}-${ii}`
                                        ? null
                                        : `${vi}-${ii}`,
                                    )
                                  }
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "12px",
                                      alignItems: "center",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontWeight: 700,
                                        fontSize: "13px",
                                      }}
                                    >
                                      {inv.invoice_no}
                                    </span>
                                    <StatusBadge status={inv.billing_status} />
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        color: "var(--text-muted)",
                                      }}
                                    >
                                      {inv.invoice_date}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "16px",
                                      alignItems: "center",
                                    }}
                                  >
                                    <div style={{ textAlign: "right" }}>
                                      <div
                                        style={{
                                          fontSize: "10px",
                                          color: "var(--text-muted)",
                                        }}
                                      >
                                        Billed
                                      </div>
                                      <div
                                        style={{
                                          fontWeight: 700,
                                          fontSize: "14px",
                                        }}
                                      >
                                        ₹{inv.amount_billed?.toLocaleString()}
                                      </div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                      <div
                                        style={{
                                          fontSize: "10px",
                                          color: "var(--success)",
                                        }}
                                      >
                                        Final
                                      </div>
                                      <div
                                        style={{
                                          fontWeight: 800,
                                          fontSize: "15px",
                                          color: "var(--success)",
                                        }}
                                      >
                                        ₹{inv.final_amount?.toLocaleString()}
                                      </div>
                                    </div>
                                    {expandedInvoice === `${vi}-${ii}` ? (
                                      <ChevronDown size={14} />
                                    ) : (
                                      <ChevronRight size={14} />
                                    )}
                                  </div>
                                </div>

                                <AnimatePresence>
                                  {expandedInvoice === `${vi}-${ii}` && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      exit={{ opacity: 0, height: 0 }}
                                    >
                                      {/* Invoice summary strip */}
                                      <div className="pm-inv-summary">
                                        <div>
                                          <span className="pm-field-label">
                                            Discount
                                          </span>
                                          <span
                                            className="pm-field-val"
                                            style={{ color: "var(--warning)" }}
                                          >
                                            -₹
                                            {inv.final_discount?.toLocaleString()}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="pm-field-label">
                                            Type
                                          </span>
                                          <span className="pm-field-val">
                                            {inv.invoice_type?.toUpperCase()}
                                          </span>
                                        </div>
                                      </div>
                                      {/* Line items */}
                                      {inv.line_items?.length > 0 && (
                                        <table
                                          style={{
                                            width: "100%",
                                            borderCollapse: "collapse",
                                            fontSize: "12px",
                                          }}
                                        >
                                          <thead>
                                            <tr
                                              style={{
                                                borderBottom:
                                                  "1px solid var(--border-color)",
                                              }}
                                            >
                                              {[
                                                "Code",
                                                "Item",
                                                "Category",
                                                "Qty",
                                                "Unit Price",
                                                "Net Amount",
                                              ].map((h) => (
                                                <th
                                                  key={h}
                                                  style={{
                                                    padding: "6px 10px",
                                                    textAlign: "left",
                                                    color: "var(--text-muted)",
                                                    fontWeight: 600,
                                                    fontSize: "11px",
                                                    textTransform: "uppercase",
                                                  }}
                                                >
                                                  {h}
                                                </th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {inv.line_items.map((li, li_i) => (
                                              <tr
                                                key={li_i}
                                                style={{
                                                  borderBottom:
                                                    "1px solid var(--border-color)",
                                                }}
                                              >
                                                <td
                                                  style={{
                                                    padding: "8px 10px",
                                                  }}
                                                >
                                                  <code
                                                    style={{
                                                      background:
                                                        "var(--primary-light)",
                                                      color: "var(--primary)",
                                                      padding: "2px 6px",
                                                      borderRadius: "4px",
                                                      fontWeight: 700,
                                                    }}
                                                  >
                                                    {li.code}
                                                  </code>
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "8px 10px",
                                                    fontWeight: 600,
                                                  }}
                                                >
                                                  {li.name}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "8px 10px",
                                                    color: "var(--text-muted)",
                                                  }}
                                                >
                                                  {li.category}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "8px 10px",
                                                    textAlign: "center",
                                                  }}
                                                >
                                                  {li.quantity}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "8px 10px",
                                                  }}
                                                >
                                                  ₹
                                                  {li.unit_price?.toLocaleString()}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "8px 10px",
                                                    fontWeight: 700,
                                                    color: "var(--primary)",
                                                  }}
                                                >
                                                  ₹
                                                  {li.net_amount?.toLocaleString()}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Claims for this visit */}
                        {visit.claims?.length > 0 && (
                          <div>
                            <div className="pm-sub-title">
                              <BadgeIndianRupee size={13} /> Claims
                            </div>
                            {visit.claims.map((claim, ci) => (
                              <div
                                key={ci}
                                className="pm-row-grid pm-card"
                                style={{ marginBottom: "8px" }}
                              >
                                <div>
                                  <span className="pm-field-label">
                                    Claim ID
                                  </span>
                                  <span className="pm-field-val">
                                    #{claim.claim_id}
                                  </span>
                                </div>
                                <div>
                                  <span className="pm-field-label">
                                    Case ID
                                  </span>
                                  <span className="pm-field-val">
                                    #{claim.cashless_case_id}
                                  </span>
                                </div>
                                <div>
                                  <span className="pm-field-label">Status</span>
                                  <StatusBadge status={claim.status} />
                                </div>
                                <div>
                                  <span className="pm-field-label">
                                    Use Type
                                  </span>
                                  <span
                                    className="badge-modern badge-info"
                                    style={{ fontSize: "11px" }}
                                  >
                                    {claim.use_type}
                                  </span>
                                </div>
                                <div>
                                  <span className="pm-field-label">Payer</span>
                                  <span className="pm-field-val">
                                    {claim.payer_name || claim.payer_code}
                                  </span>
                                </div>
                                <div>
                                  <span className="pm-field-label">Policy</span>
                                  <span
                                    className="pm-field-val"
                                    style={{
                                      fontFamily: "monospace",
                                      fontSize: "11px",
                                    }}
                                  >
                                    {claim.policy_number}
                                  </span>
                                </div>
                                <div>
                                  <span className="pm-field-label">
                                    Total Billed
                                  </span>
                                  <strong
                                    style={{
                                      color: "var(--primary)",
                                      fontSize: "15px",
                                    }}
                                  >
                                    ₹{claim.total_billed?.toLocaleString()}
                                  </strong>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default PatientModal;
