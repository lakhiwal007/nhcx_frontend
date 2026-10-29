import { Check, Lock } from "lucide-react";

const ticked = (s) => s.state === "done" || s.done;

export default function CaseStepper({ stages, onNavigate }) {
  const core = stages.filter((s) => !s.branch);
  const branches = stages.filter((s) => s.branch);
  const next = core.find((s) => !ticked(s)) || null;

  return (
    <nav className="cv-chain" aria-label="Case lifecycle">
      <ol className="cv-chain-track">
        {core.map((s, i) => {
          const done = ticked(s);
          const active = s.state === "active";
          const isNext = s === next && !active;
          const left = i > 0 && (done || active || ticked(core[i - 1]));
          const right = i < core.length - 1 && (ticked(core[i + 1]) || core[i + 1].state === "active");
          const tone = s.tone === "urgent" && !done ? " is-urgent" : s.live && !done ? " is-live" : "";
          const title = s.clickable ? s.hint : `${s.hint ? `${s.hint} ` : ""}Unlocks once the earlier stages are done.`;
          return (
            <li key={s.id} className={`cv-step${done ? " is-done" : ""}${active ? " is-active" : ""}${isNext ? " is-next" : ""}${tone}`}>
              <button
                type="button"
                className="cv-step-btn"
                disabled={!s.clickable}
                onClick={() => s.clickable && onNavigate(s.path)}
                aria-current={active ? "step" : undefined}
                aria-label={`Stage ${s.num}: ${s.label}${s.note ? ` - ${s.note}` : ""}`}
                title={title}
              >
                <span className="cv-step-line">
                  <span className={`cv-step-seg${i === 0 ? " is-blank" : left ? " is-filled" : ""}`} />
                  <span className="cv-step-dot" aria-hidden="true">
                    {done ? <Check size={14} strokeWidth={3} /> : !s.clickable && !isNext ? <Lock size={12} /> : s.num}
                  </span>
                  <span className={`cv-step-seg${i === core.length - 1 ? " is-blank" : right ? " is-filled" : ""}`} />
                </span>
                <span className="cv-step-label">{s.label}</span>
                <span className="cv-step-note">{s.note || (isNext ? "Next" : " ")}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {branches.length > 0 && (
        <div className="cv-chain-branches">
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`cv-branch${b.state === "active" ? " is-active" : ""}${ticked(b) ? " is-done" : ""}`}
              disabled={!b.clickable}
              onClick={() => b.clickable && onNavigate(b.path)}
              title={b.hint}
            >
              {ticked(b) ? <Check size={12} strokeWidth={3} /> : "+"} {b.label}
              {b.note ? <span className="cv-branch-note">{b.note}</span> : null}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
