import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, Minus, MoreHorizontal, XCircle } from "lucide-react";
import { useReadOnly, READ_ONLY_TITLE } from "../../../lib/readOnly";
import { LoadingBlock } from "../../ui/Common";
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

const MARKS = { ok: Check, warn: AlertTriangle, bad: AlertTriangle, refused: XCircle, wait: Clock, idle: Minus };

function TodoRow({ row, index, next, onOpen }) {
  const Mark = MARKS[row.tone] || Minus;
  return (
    <div className={`cv-todo-row${row.blocks ? " is-need" : ""}${next ? " is-next" : ""}`} style={{ "--i": index }}>
      <span className="cv-todo-ic" aria-hidden="true">
        <Mark size={16} />
      </span>
      <span className="cv-todo-name">
        {row.name}
        {next && <em className="cv-todo-tag">Next step</em>}
      </span>
      <span className="cv-todo-fact">{row.fact}</span>
      <button type="button" className={`cv-btn${next ? " is-primary" : ""}`} onClick={() => onOpen(row)}>
        {row.act || "Open"}
      </button>
    </div>
  );
}

const SEND_NEED = ["Needed before you can send", "The payer will not accept it without these."];
const STEP_NEED = ["Needed before you can go on", "This step cannot move ahead without these."];

function TodoList({ need, good, waiting, done, needLabel, onOpen }) {
  return (
    <div className="cv-todo">
      {need.length > 0 && (
        <>
          <div className="cv-todo-group is-need">
            <b>
              {needLabel[0]} <span>{need.length}</span>
            </b>
            <small>{needLabel[1]}</small>
          </div>
          {need.map((row, i) => (
            <TodoRow key={row.id} row={row} index={i} next={i === 0} onOpen={onOpen} />
          ))}
        </>
      )}
      {need.length === 0 && good.length === 0 && waiting.length === 0 && (
        <div className="cv-todo-none">
          <Check size={16} aria-hidden="true" /> Nothing left to do here.
        </div>
      )}
      {waiting.length > 0 && (
        <>
          <div className="cv-todo-group">
            <b>
              Waiting <span>{waiting.length}</span>
            </b>
            <small>Nothing for you to do yet. We keep checking.</small>
          </div>
          {waiting.map((row, i) => (
            <TodoRow key={row.id} row={row} index={need.length + i} onOpen={onOpen} />
          ))}
        </>
      )}
      {good.length > 0 && (
        <>
          <div className="cv-todo-group">
            <b>
              Good to check <span>{good.length}</span>
            </b>
            <small>These do not hold the step up, but they help the payer decide faster.</small>
          </div>
          {good.map((row, i) => (
            <TodoRow key={row.id} row={row} index={need.length + waiting.length + i} onOpen={onOpen} />
          ))}
        </>
      )}
      {done.length > 0 && (
        <>
          <div className="cv-todo-group">
            <b>
              Done <span>{done.length}</span>
            </b>
          </div>
          <div className="cv-todo-done">
            {done.map((row) => (
              <button key={row.id} type="button" onClick={() => onOpen(row)}>
                <Check size={13} aria-hidden="true" /> {row.name} · {row.fact}
              </button>
            ))}
          </div>
        </>
      )}
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
  tabs = true,
  sendStep = false,
  children,
}) {
  const [tab, setTab] = useState(null);
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

  const allRows = checklist.flatMap((g) => g.rows.map((r) => ({ ...r, tab: g.id })));
  const waiting = allRows.filter((r) => r.tone === "wait");
  const todo = allRows.filter((r) => r.tone === "bad" || r.tone === "warn" || r.tone === "refused");
  const need = todo.filter((r) => r.blocks || r.tone === "refused");
  const good = todo.filter((r) => !r.blocks && r.tone !== "refused");
  const done = allRows.filter((r) => r.tone === "ok");
  const hasTodoTab = todo.length + waiting.length + done.length > 0;
  const firstTab = (waiting[0] || allRows.find((r) => paneIds.includes(r.id)))?.tab ?? checklist[0]?.id;
  const picked = tab === "todo" && !hasTodoTab ? null : tab;
  const activeTab = picked ?? (todo.length ? "todo" : firstTab);
  const tabRows = allRows.filter((r) => r.tab === activeTab);
  const tabShown = activeTab === "todo" ? null : tabRows.some((r) => r.id === shown) ? shown : tabRows.find((r) => paneIds.includes(r.id))?.id ?? null;
  const openRow = (row) => {
    setTab(row.tab);
    onOpen(row.id);
  };

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
      ) : tabs && checklist.length > 0 ? (
        <div className="cv-tabwork">
          <div className="cv-tabbed">
            <div className="cv-tabsbar" role="tablist" aria-label={checklistLabel}>
              {hasTodoTab && (
                <button type="button" role="tab" className="cv-tab" aria-selected={activeTab === "todo"} onClick={() => setTab("todo")}>
                  To do {todo.length > 0 && <span className="cv-tab-count">{todo.length}</span>}
                </button>
              )}
              {checklist.map((g) => (
                <button key={g.id} type="button" role="tab" className="cv-tab" aria-selected={activeTab === g.id} onClick={() => setTab(g.id)}>
                  {g.title}
                  {g.rows.some((r) => r.tone === "bad" || r.tone === "warn" || r.tone === "refused") && <span className="cv-tab-dot" aria-label="has open items" />}
                </button>
              ))}
              {todo.length + done.length > 0 && (
                <span className="cv-tab-ring" title={`${done.length} of ${todo.length + done.length} done`}>
                  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
                    <circle cx="15" cy="15" r="12" className="cv-ring-track" />
                    <circle cx="15" cy="15" r="12" className="cv-ring-fill" transform="rotate(-90 15 15)" style={{ strokeDashoffset: 75.4 * (1 - done.length / (todo.length + done.length)) }} />
                  </svg>
                  {done.length} of {todo.length + done.length} done
                </span>
              )}
            </div>
            {activeTab === "todo" ? (
              <TodoList need={need} good={good} waiting={waiting} done={done} needLabel={sendStep ? SEND_NEED : STEP_NEED} onOpen={openRow} />
            ) : (
              tabRows.length > 1 && (
                <div className="cv-subnav">
                  {tabRows.map((row) => {
                    const Mark = MARKS[row.tone] || Minus;
                    return (
                      <button key={row.id} type="button" className={`cv-sub is-${row.tone}`} aria-current={tabShown === row.id ? "true" : undefined} onClick={() => onOpen(row.id)}>
                        <Mark size={14} aria-hidden="true" />
                        {row.name}
                        <small>{row.fact}</small>
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </div>
          <div className="cv-work-pane" ref={paneRef}>
            {Children.map(children, (child) =>
              isValidElement(child) && child.props?.id != null ? cloneElement(child, { hidden: child.props.id !== tabShown }) : child,
            )}
          </div>
        </div>
      ) : (
        <div className={`cv-work${checklist.length ? "" : " is-solo"}`}>
          {checklist.length > 0 && <CaseChecklist groups={checklist} open={shown} onOpen={onOpen} label={checklistLabel} />}
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
