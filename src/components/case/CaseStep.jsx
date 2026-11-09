import { Children, cloneElement, isValidElement, useEffect, useRef } from "react";
import { MoreHorizontal } from "lucide-react";
import { useReadOnly, READ_ONLY_TITLE } from "../../readOnly";
import { LoadingBlock } from "../Common";
import CaseChecklist from "./CaseChecklist";
import StageBar from "./StageBar";

function ActionButton({ action, primary = false }) {
  const readOnly = useReadOnly();
  if (!action) return null;
  const { label, onClick, disabled = false, reason, busy = false, busyLabel, write = true, danger = false, icon: Icon } = action;
  const blocked = write && readOnly;
  const off = disabled || blocked || busy;
  const title = blocked ? READ_ONLY_TITLE : off && reason ? reason : undefined;
  const cls = ["cv-btn", primary && "is-primary", danger && "is-danger"].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} onClick={onClick} disabled={off} title={title} aria-disabled={off || undefined}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      {busy ? busyLabel || "Working…" : label}
    </button>
  );
}

function MoreMenu({ items }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const close = () => {
      el.open = false;
    };
    const onDown = (e) => {
      if (el.open && !el.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === "Escape" && el.open) close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const live = (items || []).filter(Boolean);
  if (!live.length) return null;
  return (
    <details className="cv-more" ref={ref}>
      <summary className="cv-btn" aria-label="More actions">
        <MoreHorizontal size={16} aria-hidden="true" />
      </summary>
      <div className="cv-more-menu">
        {live.map((item) => (
          <ActionButton
            key={item.label}
            action={{
              ...item,
              onClick: (e) => {
                if (ref.current) ref.current.open = false;
                item.onClick?.(e);
              },
            }}
          />
        ))}
      </div>
    </details>
  );
}

export function Verdict({ ctx, chip, chipTone = "todo", summary, notes = [], primary, secondary = [], more = [], children }) {
  const liveNotes = (notes || []).filter(Boolean);
  const liveSecondary = (secondary || []).filter(Boolean);
  return (
    <>
      <div className="cv-verdict-row">
        <StageBar ctx={ctx} />
        {chip && <span className={`cv-chip is-${chipTone}`}>{chip}</span>}
        {summary && <span className="cv-verdict-summary">{summary}</span>}
        {(primary || liveSecondary.length > 0 || more.length > 0) && (
          <div className="cv-verdict-actions">
            {liveSecondary.map((action) => (
              <ActionButton key={action.label} action={action} />
            ))}
            <ActionButton action={primary} primary />
            <MoreMenu items={more} />
          </div>
        )}
      </div>
      {liveNotes.map((note, i) => (
        <div key={i} className={`cv-verdict-note is-${note.tone || "info"}`}>
          {note.text}
          {note.action && (
            <>
              {" "}
              <button type="button" className="cv-link" onClick={note.action.onClick}>
                {note.action.label}
              </button>
            </>
          )}
        </div>
      ))}
      {children}
    </>
  );
}

export function Pane({ id, hidden = false, children }) {
  return (
    <div hidden={hidden} data-pane={id}>
      {children}
    </div>
  );
}

const paneIdsOf = (children) =>
  Children.toArray(children)
    .filter((child) => isValidElement(child) && child.props?.id != null)
    .map((child) => child.props.id);

export default function CaseStep({
  ctx,
  verdict,
  checklist = [],
  open,
  onOpen,
  checklistLabel = "Checklist",
  loading = false,
  loadingText = "Loading…",
  error = null,
  onRetry,
  paneRef,
  children,
}) {
  const rootRef = useRef(null);
  const barRef = useRef(null);

  useEffect(() => {
    const bar = barRef.current;
    const root = rootRef.current;
    if (!bar || !root || typeof ResizeObserver === "undefined") return undefined;
    const update = () => root.style.setProperty("--cv-verdict-h", `${bar.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    update();
    return () => observer.disconnect();
  }, []);

  const paneIds = paneIdsOf(children);
  const rowIds = checklist.flatMap((g) => g.rows.map((r) => r.id));
  const shown = paneIds.includes(open) ? open : rowIds.find((id) => paneIds.includes(id)) ?? paneIds[0] ?? null;

  return (
    <div className="cv-elig" ref={rootRef}>
      <div className="cv-notice cv-verdict" ref={barRef}>
        {verdict || <Verdict ctx={ctx} />}
      </div>
      {loading ? (
        <LoadingBlock compact text={loadingText} />
      ) : error ? (
        <div className="cv-notice is-bad" role="alert">
          <div className="cv-notice-body">{error}</div>
          {onRetry && (
            <div className="cv-notice-actions">
              <button type="button" className="cv-btn" onClick={onRetry}>
                Retry
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="cv-work">
          <CaseChecklist groups={checklist} open={shown} onOpen={onOpen} label={checklistLabel} />
          <div className="cv-work-pane" ref={paneRef}>
            {Children.map(children, (child) =>
              isValidElement(child) && child.props?.id != null ? cloneElement(child, { hidden: child.props.id !== shown }) : child,
            )}
          </div>
        </div>
      )}
    </div>
  );
}
