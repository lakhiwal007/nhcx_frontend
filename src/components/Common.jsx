import { motion } from "framer-motion";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  Info,
  AlertTriangle,
  FileText,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

export const Card = ({ title, children, className = "", headerAction }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`card-modern ${className}`}
  >
    {title && (
      <div className="card-header-modern">
        <h3>{title}</h3>
        {headerAction}
      </div>
    )}
    <div className="card-body-modern">{children}</div>
  </motion.div>
);

export const Button = ({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  className = "",
  icon: Icon,
  size = "medium",
}) => {
  const sizeClasses = {
    small: "py-1 px-3 text-xs",
    medium: "",
    large: "py-3 px-6 text-lg",
  };

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      className={`btn-modern btn-${variant}-modern ${sizeClasses[size]} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {Icon && <Icon size={size === "small" ? 14 : 18} />}
      {children}
    </motion.button>
  );
};

export const StatusBadge = ({ status }) => {
  const getStatusConfig = (s) => {
    switch (s != null ? String(s).toLowerCase() : "") {
      case "complete":
      case "approved":
      case "active":
        return { class: "badge-success", icon: CheckCircle };
      case "pending":
      case "submitted":
      case "draft":
        return { class: "badge-warning", icon: Clock };
      case "failed":
      case "rejected":
      case "queried":
        return { class: "badge-error", icon: AlertCircle };
      case "partial":
      case "partially_approved":
        return { class: "badge-info", icon: Info };
      default:
        return { class: "badge-info", icon: Info };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <span className={`badge-modern ${config.class}`}>
      <Icon size={14} />
      {(status != null ? String(status) : "Unknown").replace(/_/g, " ")}
    </span>
  );
};

export const Input = ({
  label,
  value,
  onChange,
  onKeyDown,
  placeholder,
  type = "text",
  name,
  icon: Icon,
}) => (
  <div className="input-group-modern">
    {label && <label className="input-label-modern">{label}</label>}
    <div className="input-wrapper-modern" style={{ position: "relative" }}>
      {Icon && (
        <Icon
          size={18}
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "#64748b",
          }}
        />
      )}
      <input
        style={Icon ? { paddingLeft: "40px" } : {}}
        className="input-modern"
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
    </div>
  </div>
);

export const PageHeader = ({ title, subtitle, backAction }) => (
  <div className="page-header-modern">
    {backAction && (
      <Button variant="text" onClick={backAction} className="mb-2" size="small">
        ← Back
      </Button>
    )}
    <h1>{title}</h1>
    {subtitle && <p>{subtitle}</p>}
  </div>
);

// ─── Reusable Flow Components (as per README) ─────────────────────────────

export const MissingFieldsAlert = ({ fields, onResolve }) => {
  if (!fields?.length) return null;
  return (
    <div
      className="warning-banner mb-6"
      style={{
        background: "rgba(239,68,68,0.08)",
        borderColor: "var(--error)",
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", gap: "12px" }}>
        <AlertCircle
          size={18}
          color="var(--error)"
          style={{ flexShrink: 0, marginTop: "2px" }}
        />
        <div>
          <div
            style={{
              fontWeight: 700,
              marginBottom: "6px",
              color: "var(--error)",
            }}
          >
            Missing Required Patient Context
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {fields.map((f, i) => (
              <span
                key={i}
                className="badge-modern badge-error"
                style={{ fontSize: "11px" }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
      {onResolve && (
        <Button size="small" variant="primary" onClick={onResolve}>
          Resolve Now
        </Button>
      )}
    </div>
  );
};

export const DocumentChecklist = ({ documents, onUpload }) => {
  if (!documents?.length) return null;
  const missingRequired = documents.filter((d) => !d.optional && !d.url);
  return (
    <div>
      {missingRequired.length > 0 && (
        <div
          className="warning-banner mb-4"
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            background: "rgba(239,68,68,0.08)",
          }}
        >
          <AlertCircle size={16} color="var(--error)" style={{ flexShrink: 0 }} />
          <span
            style={{ color: "var(--error)", fontWeight: 600, fontSize: "13px" }}
          >
            {missingRequired.length} required document{missingRequired.length > 1 ? "s" : ""} still needed
          </span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {documents.map((doc, i) => {
          const attached = !!doc.url;
          const missing = !doc.optional && !attached;
          // The left rail colour encodes the row's state so blockers are
          // scannable: green = attached, red = required & missing, grey = optional.
          const accent = attached
            ? "var(--success)"
            : missing
              ? "var(--error)"
              : "var(--border-color)";
          const StatusIcon = attached ? CheckCircle2 : missing ? AlertCircle : FileText;
          return (
            <div
              key={i}
              className="doc-row"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "11px 14px",
                borderRadius: "10px",
                border: "1px solid var(--border-color)",
                borderLeft: `3px solid ${accent}`,
                background: "var(--bg-card)",
              }}
            >
              <StatusIcon size={17} color={accent} style={{ flexShrink: 0, marginTop: "1px" }} />

              {/* min-width:0 lets long names wrap instead of overflowing the card */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "13.5px", lineHeight: 1.35, overflowWrap: "anywhere" }}>
                  {doc.name || doc.code || "Document"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", marginTop: "3px", fontSize: "11.5px", color: "var(--text-muted)" }}>
                  {doc.code && (
                    <span style={{ fontFamily: "var(--cx-font-mono, ui-monospace, monospace)", overflowWrap: "anywhere" }}>
                      {doc.code}
                    </span>
                  )}
                  {doc.event_date && <span>{doc.event_date}</span>}
                  {doc.category && <span style={{ textTransform: "capitalize" }}>{doc.category}</span>}
                </div>
              </div>

              {/* fixed action zone — never shrinks, stays aligned to the first line */}
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "8px", marginTop: "1px" }}>
                {missing && (
                  <span style={{ fontSize: "10px", color: "var(--error)", fontWeight: 700, letterSpacing: "0.04em" }}>
                    REQUIRED
                  </span>
                )}
                {attached ? (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="badge-modern badge-success"
                    style={{ fontSize: "10px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}
                  >
                    <CheckCircle2 size={11} /> Attached
                  </a>
                ) : (
                  <Button
                    variant="outline"
                    size="small"
                    onClick={() => onUpload && onUpload(doc)}
                  >
                    {doc.optional ? "Attach" : "Upload"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const DecisionBanner = ({ decision, approvedAmount, message, outcome }) => {
  const isApproved = decision === "APPROVED";
  const isQueried = decision === "QUERIED";
  const isPartial = decision === "PARTIALLY_APPROVED";
  // Neutral state when the payer decision could not be classified. The raw FHIR
  // `outcome` is surfaced only here (per the contract) for support triage.
  const isUnknown = !decision || decision === "UNKNOWN";

  const bg = isApproved
    ? "rgba(16,185,129,0.1)"
    : isQueried
      ? "rgba(59,130,246,0.1)"
      : isUnknown
        ? "rgba(100,116,139,0.08)"
        : "rgba(245,158,11,0.1)";
  const border = isApproved
    ? "var(--success)"
    : isQueried
      ? "#3b82f6"
      : isUnknown
        ? "var(--border-color)"
        : "var(--warning)";
  const iconColor = isApproved
    ? "var(--success)"
    : isQueried
      ? "#3b82f6"
      : isUnknown
        ? "var(--text-muted)"
        : "var(--warning)";

  return (
    <div
      style={{
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: "14px",
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        marginBottom: "24px",
      }}
    >
      {isApproved ? (
        <CheckCircle2 size={36} color={iconColor} />
      ) : (
        <AlertTriangle size={36} color={iconColor} />
      )}
      <div>
        <div style={{ fontSize: "22px", fontWeight: 800 }}>
          {decision?.replace(/_/g, " ") || "Decision unavailable"}
        </div>
        {isUnknown && outcome && (
          <div style={{ fontSize: "13px", marginTop: "4px", color: "var(--text-muted)" }}>
            Payer outcome: <strong>{outcome}</strong>
          </div>
        )}
        {approvedAmount != null && (
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "14px",
              marginTop: "4px",
            }}
          >
            Approved Amount:{" "}
            <strong style={{ color: "var(--success)", fontSize: "16px" }}>
              ₹{approvedAmount.toLocaleString()}
            </strong>
          </div>
        )}
        {message && (
          <div
            style={{
              fontSize: "13px",
              marginTop: "6px",
              color: "var(--text-main)",
            }}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export const SkeletonTable = ({ rows = 5, cols = 5 }) => (
  <div className="table-responsive-wrapper">
    <table className="table-modern">
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} className="skeleton-row">
            {Array.from({ length: cols }).map((_, j) => (
              <td key={j}>
                <span
                  className="skeleton-line"
                  style={{
                    height: "13px",
                    width: j === cols - 1 ? "64px" : j === 0 ? "80px" : `${Math.max(45, 85 - j * 10)}%`,
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const AmountGrid = ({ totals }) => {
  if (!totals) return null;
  return (
    <div className="grid-1-to-4" style={{ gap: "16px", marginBottom: "24px" }}>
      {Object.entries(totals).map(([k, v]) => (
        <div
          key={k}
          style={{
            background: "var(--bg-main)",
            borderRadius: "10px",
            padding: "14px",
            textAlign: "center",
            border: "1px solid var(--border-color)",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              marginBottom: "6px",
              fontWeight: 700,
            }}
          >
            {k.replace(/_/g, " ")}
          </div>
          <div
            style={{
              fontWeight: 800,
              fontSize: "18px",
              color:
                k === "approved" || k === "eligible"
                  ? "var(--success)"
                  : "var(--primary)",
            }}
          >
            {v?.currency || "₹"}{" "}
            {v?.value?.toLocaleString() || v?.toLocaleString() || 0}
          </div>
        </div>
      ))}
    </div>
  );
};

export const TaskCard = ({ task, onClick }) => (
  <motion.div
    whileHover={{ y: -2 }}
    className="card-modern"
    style={{
      padding: "16px",
      cursor: "pointer",
      borderLeft:
        task.priority === "urgent"
          ? "4px solid var(--error)"
          : task.priority === "high"
            ? "4px solid var(--warning)"
            : "4px solid var(--primary)",
      display: "flex",
      gap: "16px",
      alignItems: "center",
    }}
    onClick={onClick}
  >
    <div style={{ flex: 1 }}>
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <span
          className={`badge-modern badge-${task.priority === "urgent" ? "error" : task.priority === "high" ? "warning" : "info"}`}
          style={{ fontSize: "10px" }}
        >
          {task.priority?.toUpperCase()}
        </span>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          {new Date(task.created_at).toLocaleString()}
        </span>
      </div>
      <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
        {task.task_type?.replace(/_/g, " ")}
      </h4>
      <div
        style={{
          fontSize: "13px",
          color: "var(--text-muted)",
          marginTop: "4px",
        }}
      >
        {task.description || `Action required for claim #${task.claim_id}`}
      </div>
    </div>
    <ChevronRight size={20} color="var(--text-muted)" />
  </motion.div>
);
