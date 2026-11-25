import { useState, useRef, useEffect, useId, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useReadOnly, READ_ONLY_TITLE } from "../../lib/readOnly";
import { AlertCircle, Info, FileText, CheckCircle2, Plus, Trash2, Paperclip, Lightbulb, AlertTriangle, XCircle, Eye, Download, ExternalLink } from "lucide-react";
import { glossary } from "../../help/glossary.js";
import { useTips } from "../../help/tips.js";
import { humanize } from "../../lib/format.js";
import { readFileAsAttachment, MAX_ATTACHMENT_BYTES, attachmentLimitText, canViewAttachment, attachmentPreview, attachmentTitle, attachmentLink, openAttachment } from "../../lib/files";
import { Drawer } from "./Overlay";

function FilePreview({ file }) {
  const preview = useMemo(() => attachmentPreview(file), [file]);
  const frame = useRef(null);
  useEffect(() => {
    if (!preview.blob || !frame.current) return;
    const url = URL.createObjectURL(preview.blob);
    frame.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [preview]);
  if (preview.kind === "pdf") return <iframe ref={frame} className="fv-frame" title={preview.title} />;
  if (preview.kind === "image") return <img ref={frame} className="fv-image" alt={preview.title} />;
  if (preview.kind === "text") return <pre className="fv-text">{preview.text}</pre>;
  return <p className="fv-none">Can't preview. Download to open.</p>;
}

export const ViewFile = ({ file, load, name, className = "" }) => {
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  const held = canViewAttachment(file) ? file : fetched;
  if (!held && !load) return null;
  const title = name || attachmentTitle(held || file);
  const remote = held && !load ? attachmentLink(held) : null;
  const view = async () => {
    if (remote) return openAttachment(held);
    if (held) return setOpen(true);
    setBusy(true);
    setFailed(false);
    try {
      const got = await load();
      if (!canViewAttachment(got)) throw new Error("No file");
      setFetched(got);
      setOpen(true);
    } catch (err) {
      if (err) err.handled = true;
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={`cv-link doc-view ${className}`} aria-label={`View ${title}`} title={failed ? "The file could not be fetched. Try again." : undefined} disabled={busy} onClick={view}>
        <Eye size={13} aria-hidden="true" /> {busy ? "Opening…" : failed ? "Try again" : "View"}
      </button>
      {held && !remote &&
        createPortal(
          <div className="fv-layer" onClick={(e) => e.stopPropagation()}>
            <Drawer
              open={open}
              onClose={close}
              width={920}
              title={title}
              footer={
                <>
                  <Button variant="outline" size="small" icon={Download} onClick={() => openAttachment(held, { download: true })}>
                    Download
                  </Button>
                  <Button variant="outline" size="small" icon={ExternalLink} onClick={() => openAttachment(held)}>
                    Open in a new tab
                  </Button>
                </>
              }
            >
              <FilePreview file={held} />
            </Drawer>
          </div>,
          document.body,
        )}
    </>
  );
};

/**
 * Primary interactive control. Variants:
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
    <button
      type="button"
      className={`btn-modern btn-${variant}-modern ${sizeClasses[size]} ${className}`}
      onClick={onClick}
      disabled={off}
      title={reason || title}
    >
      {Icon && <Icon size={size === "small" ? 14 : 16} />}
      {children}
    </button>
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
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
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

export const DocumentChecklist = ({ documents, onUpload, onAddDocument, onRenameDocument, onRemoveDocument, onFetchRecord, onDetachRecord, hideSummary = false, readOnly = false }) => {
  const fileInputRef = useRef(null);
  const pendingDocRef = useRef(null);
  const [uploadError, setUploadError] = useState(null);

  if (!documents?.length && (!onAddDocument || readOnly)) return null;
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
    readFileAsAttachment(file)
      .then(({ url, content_type, attachment }) => onUpload?.(doc, { url, content_type, attachment }))
      .catch((err) => setUploadError(err?.message || `Could not read ${file.name}.`));
  };

  return (
    <div className="doc-list">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="sr-only" aria-label="Choose a file" />
      {uploadError && (
        <div className="cv-notice is-bad" role="alert">
          <div className="cv-notice-body">{uploadError}</div>
        </div>
      )}
      {!hideSummary && missingRequired.length > 0 && (
        <div className="cv-notice is-warn">
          <div className="cv-notice-body">
            {missingRequired.length} required document{missingRequired.length > 1 ? "s" : ""} still needed
          </div>
        </div>
      )}
      {(documents || []).map((doc, i) => {
        const attached = !!doc.url;
        const missing = !doc.optional && !attached;
        const StatusIcon = attached ? CheckCircle2 : missing ? AlertCircle : FileText;
        if (doc.kind === "health_record") {
          return (
            <div key={i} className={`doc-row${attached ? " is-attached" : ""}`}>
              <StatusIcon size={17} className="doc-icon" aria-hidden="true" />
              <div className="doc-main">
                <div className="doc-name">{doc.name}</div>
                <div className="doc-meta">
                  {doc.event_date && <span>Visit on {doc.event_date}</span>}
                  <span>Health record from the hospital system</span>
                </div>
                {doc.error && <div className="doc-meta" role="alert">{doc.error}</div>}
              </div>
              <div className="doc-actions">
                {attached ? (
                  <>
                    <span className="cv-chip is-ok doc-attached">
                      <CheckCircle2 size={11} aria-hidden="true" /> Attached
                    </span>
                    <ViewFile file={doc} name={doc.name} />
                    {onDetachRecord && !readOnly && (
                      <button type="button" className="cv-icon-btn doc-remove" aria-label={`Remove ${doc.name}`} onClick={() => onDetachRecord(i)}>
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    )}
                  </>
                ) : readOnly || !onFetchRecord ? null : (
                  <Button variant="outline" size="small" disabled={!!doc.fetching} onClick={() => onFetchRecord(i)}>
                    {doc.fetching ? "Fetching…" : doc.error ? "Try again" : "Attach"}
                  </Button>
                )}
              </div>
            </div>
          );
        }
        return (
          <div key={i} className={`doc-row${attached ? " is-attached" : missing ? " is-missing" : ""}`}>
            <StatusIcon size={17} className="doc-icon" aria-hidden="true" />
            <div className="doc-main">
              {doc.custom && onRenameDocument && !readOnly ? (
                <input className="cv-ctl cv-ctl-fill doc-name-input" placeholder="Document name" aria-label="Document name" value={doc.name || ""} onChange={(e) => onRenameDocument(i, e.target.value)} />
              ) : (
                <div className="doc-name">{doc.name || doc.code || "Document"}</div>
              )}
              <div className="doc-meta">
                {doc.code && !doc.custom && <span className="cv-mono">{doc.code}</span>}
                {doc.event_date && <span>{doc.event_date}</span>}
                {doc.category && <span>{humanize(doc.category)}</span>}
              </div>
            </div>
            <div className="doc-actions">
              {missing && <span className="doc-required">Required</span>}
              {attached ? (
                <>
                  <span className="cv-chip is-ok doc-attached">
                    <CheckCircle2 size={11} aria-hidden="true" /> Attached
                  </span>
                  <ViewFile file={doc} name={doc.attachment?.title || doc.name} />
                </>
              ) : readOnly ? null : (
                <Button variant="outline" size="small" onClick={() => handlePick(doc)}>
                  {doc.optional ? "Attach" : "Upload"}
                </Button>
              )}
              {doc.custom && onRemoveDocument && !readOnly && (
                <button type="button" className="cv-icon-btn doc-remove" aria-label={`Remove ${doc.name || "this document"}`} onClick={() => onRemoveDocument(i)}>
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        );
      })}
      {onAddDocument && !readOnly && (
        <button type="button" className="cv-link doc-add" onClick={onAddDocument}>
          <Plus size={13} aria-hidden="true" /> Add a document
        </button>
      )}
    </div>
  );
};

export const LoadingBlock = ({ text, compact = false }) => (
  <div className={compact ? "flex-center py-8" : "flex-center py-20 flex-col"} role="status">
    <div className={compact ? "spinner" : "spinner mb-4"} />
    {text && <p className="text-muted">{text}</p>}
  </div>
);

export const EmptyState = ({ icon: Icon, iconSize = 48, title, description, children }) => (
  <div className="empty-view">
    {Icon && <Icon size={iconSize} className="empty-view-icon" aria-hidden="true" />}
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {children}
  </div>
);

export const SkeletonTable = ({ rows = 5, cols = 5 }) => (
  <div className="table-responsive-wrapper" aria-hidden="true">
    <table className="table-modern">
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} className="skeleton-row">
            {Array.from({ length: cols }).map((_, j) => (
              <td key={j}>
                <span className={`skeleton-line skeleton-cell${j === 0 ? " is-first" : j === cols - 1 ? " is-last" : ""}`} style={{ "--skeleton-w": `${Math.max(45, 85 - j * 10)}%` }} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const TablePagination = ({ page, pageSize, total, onPageChange, label = "rows" }) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-info">
        Showing {from}–{to} of {total} {label}
      </span>
      <div className="pager-nav">
        <Button variant="outline" size="small" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span className="pager-page">
          Page {page + 1} of {pageCount}
        </span>
        <Button variant="outline" size="small" disabled={page >= pageCount - 1} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
};

export const QueryResponseFields = ({ answer, onAnswerChange, documents = [], onDocumentsChange, label = "Your answer", placeholder = "Answer the payer, and attach what it asks for" }) => {
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);
  const id = useId();

  const readFile = (file) => readFileAsAttachment(file).then(({ title, contentType, data }) => ({ title, contentType, data }));

  const handleFileChange = async (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = "";
    if (picked.length === 0) return;
    setError(null);
    const tooBig = picked.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig.length > 0) setError(`${tooBig.map((f) => f.name).join(", ")}: larger than ${attachmentLimitText()}. Attach smaller files.`);
    const usable = picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
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
    <div className="qr-fields">
      <div className="cv-field-stack">
        <label className="cv-field-key" htmlFor={`${id}-answer`}>
          {label}
        </label>
        <textarea id={`${id}-answer`} className="cv-ctl cv-textarea cv-ctl-fill" rows={4} placeholder={placeholder} value={answer} onChange={(e) => onAnswerChange(e.target.value)} />
      </div>
      <div className="cv-field-stack">
        <span className="cv-field-key">Supporting documents{documents.length > 0 ? ` (${documents.length})` : ""}</span>
        <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="sr-only" aria-label="Choose files" />
        <div>
          <Button variant="outline" size="small" icon={Paperclip} onClick={() => fileInputRef.current?.click()}>
            {documents.length > 0 ? "Add more files" : "Choose files"}
          </Button>
        </div>
        {documents.length > 0 && (
          <ul className="qr-files">
            {documents.map((d, i) => (
              <li key={`${d.title}-${i}`}>
                <Paperclip size={12} aria-hidden="true" />
                <span className="qr-file-name">{d.title}</span>
                <ViewFile file={d} />
                <button type="button" className="cv-icon-btn" onClick={() => removeAt(i)} aria-label={`Remove ${d.title}`}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <div className="cv-notice is-bad" role="alert">
            <div className="cv-notice-body">{error}</div>
          </div>
        )}
      </div>
    </div>
  );
};
