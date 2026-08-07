import { useState, useRef } from "react";
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
  Ban,
  Plus,
  Trash2,
  Paperclip,
} from "lucide-react";
import { formatMoney, formatDateTime, formatPhone, formatPercent, currencySymbol } from "../format.js";
import { MAX_ATTACHMENT_MB } from "../api/config.js";

export { formatMoney };

/**
 * Generic content container with an optional header and header action.
 * The base surface for every panel in the app (dashboards, forms, detail views).
 * @category Layout
 */
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

/**
 * Primary interactive control with tactile hover/press motion. Variants:
 * "primary" (filled, high emphasis), "outline" (bordered, medium emphasis),
 * "text" (no border, low emphasis). Optional leading icon and small/medium/large sizing.
 * @category Forms
 */
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

/**
 * Pill badge that maps a workflow status string (e.g. "complete", "pending",
 * "failed", "partial") to a semantic tone (success/warning/error/info) with a
 * matching icon. Unrecognized statuses fall back to the neutral info tone.
 * @category Feedback
 */
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

/**
 * Labeled text input with an optional leading icon. Renders a `<label>`
 * above the field when `label` is given; the icon (a lucide-react component)
 * sits inset on the left when provided.
 * @category Forms
 */
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

/**
 * Page-level title block with an optional subtitle and an optional
 * "Back" button rendered above the title when `backAction` is given.
 * @category Layout
 */
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

/**
 * Compact, selectable patient summary row for search/list results: avatar
 * (photo or initial fallback), name, ID/gender/age/mobile meta line, an
 * optional status area (`statusSlot`, e.g. a case status chip + payer), and
 * a cashless-case-count pill when the patient has prior cases.
 * @category Domain
 */
export const PatientCard = ({ patient, onClick, isSelected, age, statusSlot }) => {
  const [photoError, setPhotoError] = useState(false);
  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={`patient-card-modern${isSelected ? " selected" : ""}`}
    >
      <div className="patient-card-avatar">
        {patient.profile_photo && !photoError
          ? <img src={patient.profile_photo} alt="" onError={() => setPhotoError(true)} />
          : patient.name?.[0]?.toUpperCase()
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "3px", color: "var(--text-main)" }}>
          {patient.name}
        </div>
        <div className="patient-card-meta">
          <span className="mono-cell">#{patient.child_id}</span>
          <span style={{ textTransform: "capitalize" }}>{patient.gender}</span>
          {age != null && <span>{age} yrs</span>}
          {patient.mobile && <span className="mono-cell">{formatPhone(patient.mobile)}</span>}
        </div>
        {statusSlot && (
          <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {statusSlot}
          </div>
        )}
      </div>
      {patient.cashless_cases_count > 0 && (
        <div className="patient-card-count">
          {patient.cashless_cases_count} case{patient.cashless_cases_count !== 1 ? "s" : ""}
        </div>
      )}
    </motion.div>
  );
};

// ─── Reusable Flow Components (as per README) ─────────────────────────────

/**
 * Warning banner listing missing required patient-context fields as badges,
 * with an optional "Resolve Now" action. Renders nothing when `fields` is empty.
 * @category Feedback
 */
export const MissingFieldsAlert = ({ fields, onResolve }) => {
  if (!fields?.length) return null;
  return (
    <div
      className="warning-banner tone-error mb-6"
      style={{
        display: "flex",
        gap: "var(--space-3)",
        alignItems: "flex-start",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
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
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
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

/**
 * Checklist of insurance-claim documents, each row colour-coded by state
 * (attached / required & missing / optional) with an upload action per row
 * and a summary banner when required documents are still missing. When
 * `onAddDocument` is supplied, the hospital can also attach documents that
 * aren't on the pre-populated required/optional list.
 * @category Domain
 */
export const DocumentChecklist = ({ documents, onUpload, onAddDocument, onRenameDocument, onRemoveDocument }) => {
  const fileInputRef = useRef(null);
  const pendingDocRef = useRef(null);
  const [uploadError, setUploadError] = useState(null);

  if (!documents?.length && !onAddDocument) return null;
  const missingRequired = (documents || []).filter((d) => !d.optional && !d.url);

  const handlePick = (doc) => {
    setUploadError(null);
    pendingDocRef.current = doc;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    const doc = pendingDocRef.current;
    e.target.value = "";
    if (!file || !doc) return;
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      setUploadError(`${file.name} is larger than ${MAX_ATTACHMENT_MB}MB — please attach a smaller file.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const match = /^data:(.*?);base64,(.*)$/.exec(reader.result || "");
      if (!match) {
        setUploadError(`Could not read ${file.name}.`);
        return;
      }
      const [, contentType, data] = match;
      onUpload?.(doc, {
        url: reader.result,
        content_type: contentType || file.type || "application/octet-stream",
        attachment: {
          contentType: contentType || file.type || "application/octet-stream",
          data,
          title: file.name,
        },
      });
    };
    reader.onerror = () => setUploadError(`Could not read ${file.name}.`);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
      {uploadError && (
        <div
          className="warning-banner tone-error mb-4"
          style={{ display: "flex", gap: "10px", alignItems: "center" }}
        >
          <AlertCircle size={16} color="var(--error)" style={{ flexShrink: 0 }} />
          <span style={{ color: "var(--error)", fontWeight: 600, fontSize: "13px" }}>{uploadError}</span>
        </div>
      )}
      {missingRequired.length > 0 && (
        <div
          className="warning-banner tone-error mb-4"
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
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
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {(documents || []).map((doc, i) => {
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
                gap: "var(--space-3)",
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
                {doc.custom && onRenameDocument ? (
                  <input
                    className="input-modern"
                    style={{ fontSize: "13px", padding: "4px 8px", fontWeight: 600 }}
                    placeholder="Document name"
                    value={doc.name || ""}
                    onChange={(e) => onRenameDocument(i, e.target.value)}
                  />
                ) : (
                  <div style={{ fontWeight: 600, fontSize: "13.5px", lineHeight: 1.35, overflowWrap: "anywhere" }}>
                    {doc.name || doc.code || "Document"}
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", marginTop: "3px", fontSize: "11.5px", color: "var(--text-muted)" }}>
                  {doc.code && !doc.custom && (
                    <span style={{ fontFamily: "var(--cx-font-mono, ui-monospace, monospace)", overflowWrap: "anywhere" }}>
                      {doc.code}
                    </span>
                  )}
                  {doc.event_date && <span>{doc.event_date}</span>}
                  {doc.category && <span style={{ textTransform: "capitalize" }}>{doc.category}</span>}
                </div>
              </div>

              {/* fixed action zone — never shrinks, stays aligned to the first line */}
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "1px" }}>
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
                    style={{ fontSize: "10px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "var(--space-1)", whiteSpace: "nowrap" }}
                  >
                    <CheckCircle2 size={11} /> Attached
                  </a>
                ) : (
                  <Button
                    variant="outline"
                    size="small"
                    onClick={() => handlePick(doc)}
                  >
                    {doc.optional ? "Attach" : "Upload"}
                  </Button>
                )}
                {doc.custom && onRemoveDocument && (
                  <button
                    onClick={() => onRemoveDocument(i)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--error)", padding: "2px", display: "flex", flexShrink: 0, transition: "transform 0.15s ease" }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
                    onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {onAddDocument && (
        <button
          onClick={onAddDocument}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "12px", fontWeight: 700, padding: "6px", marginTop: "var(--space-2)" }}
        >
          <Plus size={13} /> Add Document
        </button>
      )}
    </div>
  );
};

/**
 * Large banner announcing a payer's decision (APPROVED / QUERIED /
 * PARTIALLY_APPROVED / REJECTED), tinted to match, with the approved amount
 * and an optional message. Falls back to a neutral tone plus the raw FHIR
 * `outcome` when the decision itself couldn't be classified.
 * @category Feedback
 */
export const DecisionBanner = ({ decision, approvedAmount, message, outcome, provenance }) => {
  const isApproved = decision === "APPROVED";
  const isQueried = decision === "QUERIED";
  // The preauth was voided after the payer acknowledged a cancellation request.
  const isCancelled = decision === "CANCELLED";
  // Neutral state when the payer decision could not be classified.
  const isUnknown = !decision || decision === "UNKNOWN";
  // The authoritative raw payer signal from the audit trail's decision event
  // (reason_codes / classified_by / inbound nhcx_workflow_id), when available.
  const rawOutcome = provenance?.raw_outcome ?? outcome;
  const reasonCodes = provenance?.reason_codes || [];
  // Guard against a mis-classified decision hiding behind a confident banner:
  // prefer the wrapper's own `ambiguous` flag from the decision event; fall
  // back to the heuristic (an approval whose raw FHIR outcome isn't a success
  // signal is suspect and must be verified, not shown as a clean approval).
  const ambiguous =
    provenance?.ambiguous ??
    (isApproved && outcome != null && !["complete", "partial"].includes(String(outcome).toLowerCase()));

  // An ambiguous approval is demoted from green to a warning tone.
  const tone = ambiguous
    ? "tone-warn"
    : isApproved
      ? "tone-approve"
      : isQueried
        ? "tone-query"
        : isUnknown || isCancelled
          ? "tone-neutral"
          : "tone-warn";
  const iconColor = ambiguous
    ? "var(--warning)"
    : isApproved
      ? "var(--success)"
      : isQueried
        ? "var(--info)"
        : isUnknown || isCancelled
          ? "var(--text-muted)"
          : "var(--warning)";

  return (
    <div className={`decision-banner ${tone}`}>
      {isApproved ? (
        <CheckCircle2 size={36} color={iconColor} />
      ) : isCancelled ? (
        <Ban size={36} color={iconColor} />
      ) : (
        <AlertTriangle size={36} color={iconColor} />
      )}
      <div>
        <div style={{ fontSize: "22px", fontWeight: 800 }}>
          {isCancelled ? "Cancelled — Preauth Void" : decision?.replace(/_/g, " ") || "Decision unavailable"}
        </div>
        {/* Always surface the raw payer outcome next to the classified verdict so
            a mis-classification is visible, not just in the UNKNOWN state. */}
        {outcome && (
          <div style={{ fontSize: "13px", marginTop: "var(--space-1)", color: "var(--text-muted)" }}>
            Payer outcome: <strong>{outcome}</strong>
          </div>
        )}
        {ambiguous && (
          <div style={{ fontSize: "13px", marginTop: "6px", color: "var(--warning)", fontWeight: 700 }}>
            Verify — the payer signal does not corroborate this approval.
          </div>
        )}
        {/* Decision provenance from the audit trail — the payer's own reason
            codes, which code path classified it, and the raw NHCX workflow id.
            Makes a mis-classification auditable at the banner, not just the log. */}
        {provenance && (reasonCodes.length > 0 || provenance.classified_by || provenance.nhcx_workflow_id != null) && (
          <div style={{ fontSize: "12px", marginTop: "6px", color: "var(--text-muted)", fontFamily: "monospace" }}>
            {reasonCodes.length > 0 && <>reason={reasonCodes.join(",")} · </>}
            {rawOutcome != null && <>outcome={rawOutcome} · </>}
            {provenance.classified_by && <>classified_by={provenance.classified_by}</>}
            {provenance.nhcx_workflow_id != null && <> · wf {provenance.nhcx_workflow_id}</>}
          </div>
        )}
        {approvedAmount != null && !isCancelled && (
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "14px",
              marginTop: "var(--space-1)",
            }}
          >
            Approved Amount:{" "}
            <strong style={{ color: "var(--success)", fontSize: "16px" }}>
              {formatMoney(approvedAmount)}
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

/**
 * Full-block loading indicator: spinner plus an optional status message.
 * `compact` drops the message layout for small inline uses (e.g. within a card).
 * @category Feedback
 */
export const LoadingBlock = ({ text, compact = false }) => (
  <div className={compact ? "flex-center py-8" : "flex-center py-20 flex-col"}>
    <div className={compact ? "spinner" : "spinner mb-4"} />
    {text && <p className="text-muted">{text}</p>}
  </div>
);

/**
 * Centered empty-state card: optional icon, title, description, and children
 * (e.g. a call-to-action Button).
 * @category Feedback
 */
export const EmptyState = ({
  icon: Icon,
  iconSize = 48,
  iconColor,
  iconOpacity = 0.3,
  title,
  description,
  children,
}) => (
  <div className="empty-view">
    {Icon && (
      <Icon size={iconSize} style={{ opacity: iconOpacity, color: iconColor, marginBottom: "var(--space-4)" }} />
    )}
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {children}
  </div>
);

/**
 * Loading placeholder shaped like a data table, with staggered shimmer rows.
 * Use while a table's real rows are still being fetched.
 * @category Feedback
 */
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

/**
 * Grid of labeled currency totals (e.g. billed / approved / eligible amounts
 * from a claim adjudication). Each entry's key becomes the label; approved
 * and eligible amounts are tinted green.
 * @category Domain
 */
const PERCENT_TOTALS = ["elig_percent", "eligpercent"];

const amountValue = (v) => (v && typeof v === "object" ? v.value : v);

const formatTotal = (k, v) => {
  const raw = amountValue(v);
  if (PERCENT_TOTALS.includes(k)) return formatPercent(raw);
  return formatMoney(raw, { currency: currencySymbol(v && typeof v === "object" ? v.currency : null) });
};

export const AmountGrid = ({ totals }) => {
  if (!totals) return null;
  return (
    <div className="grid-1-to-4" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
      {Object.entries(totals).map(([k, v]) => (
        <div key={k} className="amount-grid-cell">
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
              // Only the payable BENEFIT/approved figure is green. `eligible` is a
              // pre-share figure (>= benefit) and must not read as the amount the
              // payer will pay — tint it neutral so it isn't mistaken for approved.
              color:
                amountValue(v) === null || amountValue(v) === undefined
                  ? "var(--text-muted)"
                  : k === "approved" || k === "benefit"
                    ? "var(--success)"
                    : k === "copay" || k === "deductible"
                      ? "var(--error)"
                      : "var(--primary)",
            }}
          >
            {formatTotal(k, v)}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Clickable Work Queue task summary: priority-colored left border, priority
 * badge, timestamp, task type, and description.
 * @category Domain
 */
export const TaskCard = ({ task, onClick }) => (
  <motion.div
    whileHover={{ y: -2 }}
    className="card-modern task-card-modern"
    style={{
      "--task-accent":
        task.priority === "urgent"
          ? "var(--error)"
          : task.priority === "high"
            ? "var(--warning)"
            : "var(--primary)",
    }}
    onClick={onClick}
  >
    <div style={{ flex: 1 }}>
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          alignItems: "center",
          marginBottom: "var(--space-2)",
        }}
      >
        <span
          className={`badge-modern badge-${task.priority === "urgent" ? "error" : task.priority === "high" ? "warning" : "info"}`}
          style={{ fontSize: "10px" }}
        >
          {task.priority?.toUpperCase()}
        </span>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          {formatDateTime(task.created_at)}
        </span>
      </div>
      <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
        {task.task_type?.replace(/_/g, " ")}
      </h4>
      <div
        style={{
          fontSize: "13px",
          color: "var(--text-muted)",
          marginTop: "var(--space-1)",
        }}
      >
        {task.description || `Action required for claim #${task.claim_id}`}
      </div>
    </div>
    <ChevronRight size={20} color="var(--text-muted)" />
  </motion.div>
);

export const TablePagination = ({ page, pageSize, total, onPageChange, label = "rows" }) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        flexWrap: "wrap",
        paddingTop: "var(--space-4)",
        marginTop: "var(--space-2)",
        borderTop: "1px solid var(--border-color)",
      }}
    >
      <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>
        Showing {from}–{to} of {total} {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <Button variant="outline" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          ‹ Prev
        </Button>
        <span style={{ fontSize: "12px", color: "var(--text-muted)", minWidth: "84px", textAlign: "center" }}>
          Page {page + 1} of {pageCount}
        </span>
        <Button variant="outline" disabled={page >= pageCount - 1} onClick={() => onPageChange(page + 1)}>
          Next ›
        </Button>
      </div>
    </div>
  );
};

// A payer asks for several documents at once ("Documents Requested (N)"), so
// this collects a list. `documents` is always an array; the caller decides
// whether the endpoint it posts to takes one or many.
export const QueryResponseFields = ({
  answer,
  onAnswerChange,
  documents = [],
  onDocumentsChange,
  label = "Your Response",
  placeholder = "Describe the clinical justification for the requested service…",
}) => {
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);

  const readFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const match = /^data:(.*?);base64,(.*)$/.exec(reader.result || "");
        if (!match) return reject(new Error(file.name));
        resolve({
          title: file.name,
          contentType: match[1] || file.type || "application/octet-stream",
          data: match[2],
        });
      };
      reader.onerror = () => reject(new Error(file.name));
      reader.readAsDataURL(file);
    });

  const handleFileChange = async (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = "";
    if (picked.length === 0) return;
    setError(null);

    const tooBig = picked.filter((f) => f.size > MAX_ATTACHMENT_MB * 1024 * 1024);
    if (tooBig.length > 0) {
      setError(`${tooBig.map((f) => f.name).join(", ")} — larger than ${MAX_ATTACHMENT_MB}MB, please attach smaller files.`);
    }

    const usable = picked.filter((f) => f.size <= MAX_ATTACHMENT_MB * 1024 * 1024);
    if (usable.length === 0) return;

    try {
      const read = await Promise.all(usable.map(readFile));
      onDocumentsChange([...documents, ...read]);
    } catch (err) {
      setError(`Could not read ${err.message}.`);
    }
  };

  const removeAt = (idx) => {
    setError(null);
    onDocumentsChange(documents.filter((_, i) => i !== idx));
  };

  return (
    <>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>{label}</label>
        <textarea
          className="input-modern"
          rows={4}
          placeholder={placeholder}
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
        />
      </div>
      <div style={{ marginBottom: "var(--space-5)" }}>
        <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
          Supporting Documents{documents.length > 0 ? ` (${documents.length})` : ""}
        </label>
        <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="outline" icon={Paperclip} onClick={() => fileInputRef.current?.click()}>
            {documents.length > 0 ? "Add more files" : "Choose files"}
          </Button>
        </div>
        {documents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px" }}>
            {documents.map((d, i) => (
              <div key={`${d.title}-${i}`} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", padding: "5px 9px", background: "var(--bg-main)", border: "1px solid var(--border-color)", borderRadius: "6px" }}>
                <Paperclip size={12} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                <button
                  onClick={() => removeAt(i)}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
                  title={`Remove ${d.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--error)", fontWeight: 600 }}>{error}</div>
        )}
      </div>
    </>
  );
};
