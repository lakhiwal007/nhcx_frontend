import { InfoTip, Tip } from "../Common";

// Case-file building blocks shared by the case steps (Eligibility, Preauth):
// a neutral titled section and a grid of label/value fields. Styles are the
// `ep-*` rules in App.css.

export function Section({ id, title, meta, info, tip, children }) {
  return (
    <section className="ep-section" id={id}>
      <header className="ep-section-head">
        <h3 className="ep-section-title">
          {title}
          {info && (typeof info === "string" ? <InfoTip term={info} /> : <InfoTip {...info} />)}
        </h3>
        {meta && <div className="ep-section-meta">{meta}</div>}
      </header>
      {tip && <Tip className="ep-section-tip">{tip}</Tip>}
      {children}
    </section>
  );
}

// rows: [{ label, value, sub?, mono?, tone? }]; empty values are skipped.
// cols: 1 renders label beside value; 2/3 render a grid of label-over-value.
export function Fields({ rows, cols = 2 }) {
  const shown = rows.filter((r) => r && r.value != null && r.value !== "");
  if (!shown.length) return null;
  return (
    <dl className={`ep-fields cols-${cols}`}>
      {shown.map((r, i) => (
        <div key={`${r.label}-${i}`} className="ep-field">
          <dt>
            {r.label}
            {r.info && (typeof r.info === "string" ? <InfoTip term={r.info} /> : <InfoTip {...r.info} />)}
          </dt>
          <dd
            className={`${r.mono ? "ep-mono" : ""}${r.tone ? ` is-${r.tone}` : ""}`}
            title={typeof r.value === "string" ? r.value : undefined}
          >
            {r.value}
            {r.sub && <span className="ep-field-sub">{r.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
