import { Check, Lock } from "lucide-react";

// The Case Stepper — a sticky vertical lifecycle rail. A header summarises
// progress; each stage is a row (circle + label + note) with the viewed stage
// raised as a tile; branch nodes (Enhancement, Reprocess) sit indented with a
// dashed ring. Stages and their clickability are computed by buildStages();
// this component only presents them.
export default function CaseStepper({ stages, onNavigate }) {
  const core = stages.filter((s) => !s.branch);
  // Count what the rail shows as ticked, so the header never disagrees with
  // the circles below it (buildStages ticks stages passed on the way to the
  // one being viewed, not only those with their own completion signal).
  const isTicked = (s) => s.state === "done" || s.done;
  const doneCount = core.filter(isTicked).length;
  // The first stage still to do. When it isn't the stage being viewed it
  // gets a "Next" marker, since the two can differ.
  const next = core.find((s) => !isTicked(s)) || null;
  // While the next stage is already open, its description is on screen, so
  // the card looks one step further ahead instead.
  const viewingNext = next?.state === "active";
  const upcoming = viewingNext ? core[core.indexOf(next) + 1] || null : next;

  return (
    <nav className="cx-rail" aria-label="Case lifecycle">
      <div className="cx-rail-head">
        <div className="cx-rail-title">Case lifecycle</div>
        <div className="cx-rail-progress-text">
          {doneCount} of {core.length} complete
        </div>
        <div className="cx-rail-progress" aria-hidden="true">
          {core.map((s) => (
            <span key={s.id} className={isTicked(s) ? "is-done" : s === next ? "is-next" : ""} />
          ))}
        </div>
      </div>

      <ol className="cx-rail-track">
        {stages.map((s, i) => {
          const isNext = s === next && s.state !== "active";
          const ariaLabel = s.branch
            ? `${s.label}${s.note ? ` - ${s.note}` : ""}`
            : `Stage ${s.num}: ${s.label}${s.note ? ` - ${s.note}` : ""}`;
          const tooltip = s.clickable
            ? s.hint
            : `${s.hint ? `${s.hint} ` : ""}${isNext ? "Opens from the current stage once it is done." : "Unlocks once the earlier stages are done."}`;
          // The connector drawn inside step i runs down to step i+1's circle,
          // so its fill reflects whether progress has reached i+1.
          const following = stages[i + 1];
          const filled = following && (following.state === "done" || following.state === "active" || following.done);
          return (
            <li
              key={s.id}
              className={`cx-vstep is-${s.state}${s.branch ? " is-branch" : ""}${isNext ? " is-next" : ""}`}
            >
              {following && (
                <span
                  className={`cx-vstep-connector${filled ? " is-filled" : ""}${following.branch || s.branch ? " is-dashed" : ""}`}
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                className="cx-vstep-btn"
                disabled={!s.clickable}
                onClick={() => s.clickable && onNavigate(s.path)}
                aria-current={s.state === "active" ? "step" : undefined}
                aria-label={ariaLabel}
                title={tooltip}
              >
                <span className="cx-vstep-circle" aria-hidden="true">
                  {/* A completed stage keeps its checkmark while you are viewing it.
                      Without this, opening a done stage from the rail turns its tick
                      back into a bare number while later stages stay ticked, which
                      reads as the case having regressed. */}
                  {s.state === "done" || s.done ? (
                    <Check size={13} strokeWidth={3} />
                  ) : s.branch ? (
                    "+"
                  ) : (
                    s.num
                  )}
                </span>
                <span className="cx-vstep-body">
                  <span className="cx-vstep-label-row">
                    <span className="cx-vstep-label">{s.label}</span>
                    <StageTag stage={s} isNext={isNext} />
                  </span>
                  {s.note && (
                    <span className={`cx-vstep-note${s.tone ? ` tone-${s.tone}` : ""}`} title={s.note}>
                      {s.note}
                    </span>
                  )}
                </span>
                {!s.clickable && !isNext && <Lock size={12} className="cx-vstep-lock" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ol>

      {(upcoming || !next) && (
        <div className={`cx-rail-next${next ? "" : " is-complete"}`}>
          {upcoming ? (
            <>
              <div className="cx-rail-next-eyebrow">{viewingNext ? "After this" : "Up next"}</div>
              <div className="cx-rail-next-label">{upcoming.label}</div>
              {upcoming.hint && <p className="cx-rail-next-hint">{upcoming.hint}</p>}
            </>
          ) : (
            <>
              <div className="cx-rail-next-eyebrow">All stages complete</div>
              <p className="cx-rail-next-hint">This case has been settled and closed.</p>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

// One short tag beside the stage name, in priority order: something needs the
// user, the payer is working on it, the case's next stage, or an optional branch.
function StageTag({ stage, isNext }) {
  if (stage.tone === "urgent" && !stage.done) return <span className="cx-vstep-tag is-urgent">Action</span>;
  if (stage.live) {
    return (
      <span className="cx-vstep-tag is-live">
        <span className="cx-live-dot" aria-hidden="true" />
        Live
      </span>
    );
  }
  if (isNext) return <span className="cx-vstep-tag is-next">Next</span>;
  if (stage.branch && !stage.done) return <span className="cx-vstep-tag is-optional">Optional</span>;
  return null;
}
