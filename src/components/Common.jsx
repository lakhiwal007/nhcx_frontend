import { useState, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useReadOnly, READ_ONLY_TITLE } from "../readOnly";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  Info,
  FileText,
  CheckCircle2,
  Plus,
  Trash2,
  Paperclip,
  Lightbulb,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { glossary } from "../help/glossary.js";
import { useTips } from "../help/tips.js";
import { formatMoney, safeHref } from "../format.js";
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
  title,
  write = false,
  disabledReason,
}) => {
  const readOnly = useReadOnly();
  const blocked = write && readOnly;
  const off = disabled || blocked;
  const reason = blocked ? READ_ONLY_TITLE : off ? disabledReason : null;
  const sizeClasses = {
    small: "py-1 px-3 text-xs",
    medium: "",
    large: "py-3 px-6 text-lg",
  };

  const button = (
    <motion.button
      whileHover={!off ? { scale: 1.02 } : {}}
      whileTap={!off ? { scale: 0.98 } : {}}
      className={`btn-modern btn-${variant}-modern ${sizeClasses[size]} ${className}`}
      onClick={onClick}
      disabled={off}
      title={reason || title}
    >
      {Icon && <Icon size={size === "small" ? 14 : 18} />}
      {children}
    </motion.button>
  );
  if (!reason || blocked) return button;
  return (
    <span className="btn-reason-wrap" title={reason}>
      {button}
      <InfoTip text={reason} label="Why is this unavailable?" />
    </span>
  );
};

export const InfoTip = ({ term, title, text, more, label }) => {
  const entry = term ? glossary(term) : null;
  const heading = title ?? entry?.term;
  const body = text ?? entry?.short;
  const extra = more ?? entry?.more;
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const popId = useId();

  useEffect(() => {
    if (!pos) return undefined;
    const close = (e) => {
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type === "mousedown" && (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target))) return;
      setPos(null);
      if (e.type === "keydown") btnRef.current?.focus();
    };
    const dismiss = () => setPos(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [pos]);

  if (!body) return null;

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (pos) {
      setPos(null);
      return;
    }
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 32);
    const left = Math.min(Math.max(16, r.left + r.width / 2 - width / 2), window.innerWidth - width - 16);
    const below = r.bottom + 8;
    setPos({ left, width, top: below, flip: below + 160 > window.innerHeight && r.top > 200, anchorTop: r.top });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`info-tip-btn${pos ? " is-open" : ""}`}
        aria-label={label || (heading ? `What is ${heading}?` : "More information")}
        aria-expanded={!!pos}
        aria-controls={pos ? popId : undefined}
        onClick={toggle}
      >
        <Info size={13} />
      </button>
      {pos &&
        createPortal(
          <div
            ref={popRef}
            id={popId}
            role="tooltip"
            className="info-tip-pop"
            style={{
              left: pos.left,
              width: pos.width,
              ...(pos.flip ? { bottom: window.innerHeight - pos.anchorTop + 8 } : { top: pos.top }),
            }}
          >
            {heading && <div className="info-tip-title">{heading}</div>}
            <div>{body}</div>
            {extra && <div className="info-tip-more">{extra}</div>}
          </div>,
          document.body,
        )}
    </>
  );
};

export const Tip = ({ children, className = "" }) => {
  const { showTips } = useTips();
  if (!showTips || !children) return null;
  return (
    <p className={`help-tip ${className}`}>
      <Lightbulb size={13} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
};

const NEXT_STEP_ICONS = { info: Info, warn: AlertTriangle, bad: XCircle, ok: CheckCircle2 };

export const NextStep = ({ tone = "info", title, children, steps = [], actions, className = "" }) => {
  const Icon = NEXT_STEP_ICONS[tone] || Info;
  return (
    <div className={`next-step is-${tone} ${className}`} role={tone === "bad" ? "alert" : undefined}>
      <Icon size={16} className="next-step-icon" aria-hidden="true" />
      <div className="next-step-body">
        {title && <div className="next-step-title">{title}</div>}
        {children && <div className="next-step-text">{children}</div>}
        {steps.length > 0 && (
          <ol className="next-step-list">
            {steps.filter(Boolean).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        )}
        {actions && <div className="next-step-actions">{actions}</div>}
      </div>
    </div>
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

// ─── Reusable Flow Components (as per README) ─────────────────────────────

/**
 * Checklist of insurance-claim documents, each row colour-coded by state
 * (attached / required & missing / optional) with an upload action per row
 * and a summary banner when required documents are still missing. When
 * `onAddDocument` is supplied, the hospital can also attach documents that
 * aren't on the pre-populated required/optional list.
 * @category Domain
 */
// `hideSummary` drops the "N required documents still needed" banner for
// screens that already state the count elsewhere.
export const DocumentChecklist = ({ documents, onUpload, onAddDocument, onRenameDocument, onRemoveDocument, hideSummary = false }) => {
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
      {!hideSummary && missingRequired.length > 0 && (
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
          const viewHref = safeHref(doc.url);
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
                {attached && viewHref ? (
                  <a
                    href={viewHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="badge-modern badge-success"
                    style={{ fontSize: "10px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "var(--space-1)", whiteSpace: "nowrap" }}
                  >
                    <CheckCircle2 size={11} /> Attached
                  </a>
                ) : attached ? (
                  <span
                    className="badge-modern badge-success"
                    title="This document's link could not be opened safely."
                    style={{ fontSize: "10px", display: "inline-flex", alignItems: "center", gap: "var(--space-1)", whiteSpace: "nowrap" }}
                  >
                    <CheckCircle2 size={11} /> Attached
                  </span>
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
 * Footer pager for a client-side paginated table: "Showing X–Y of N" plus
 * Prev/Next buttons. `page` is zero-based. Renders nothing when `total` fits
 * on one page.
 * @category Navigation
 */
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

/**
 * Controlled form fields for answering a payer query: a response textarea
 * plus a supporting-documents file picker. Parent owns `answer` and
 * `documents` (each `{title, contentType, data}` with base64 `data`).
 * @category Forms
 */
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
