import { useEffect, useRef, useState } from "react";
import { api } from "../../../api";
import FormEditor from "./PayerForms";
import { ViewFile } from "../../ui/Common";
import { liveAsks } from "./askStatus";
import { readFileAsAttachment } from "../../../lib/files";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SOURCE = { ruling: "payer's rule", plan: "plan, every case", package: "plan, for the package", consent: "PMJAY, in place of biometrics" };

const isDone = (row) => row.status === "attached" || row.status === "answered";
const rank = (row) => (isDone(row) ? 2 : row.blocking ? 0 : 1);
const GROUPS = [
  { rank: 0, title: "Required" },
  { rank: 1, title: "Optional" },
  { rank: 2, title: "Done" },
];

function badge(row) {
  if (isDone(row)) return [row.kind === "document" ? "Attached" : "Answered", "is-ok"];
  if (row.status === "partial") return [`${row.answered_required} of ${row.required}`, row.blocking ? "is-bad" : "is-todo"];
  return row.blocking ? ["Required", "is-bad"] : ["Optional", "is-todo"];
}

function detail(row) {
  const parts = [row.kind === "document" ? "Document" : "Form"];
  if (row.code && row.kind === "document") parts.push([row.category, row.code].filter(Boolean).join(" · "));
  parts.push(SOURCE[row.source] || row.source);
  if (row.for_code) parts.push(`for ${row.for_code}`);
  if (row.kind === "form" && row.required) parts.push(`${row.required} required ${row.required === 1 ? "question" : "questions"}`);
  if (row.file_name) parts.push(row.file_name);
  return parts.join(" · ");
}

export default function PayerAsks({ caseId, stage, asks, documents, readOnly, onAttach, onFormsChange, reloadKey, title = "What the payer needs" }) {
  const [forms, setForms] = useState({ key: null, rows: [], readOnly: false, error: null });
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const pendingRef = useRef(null);
  const key = `${caseId}|${stage}`;

  useEffect(() => {
    if (!caseId) return;
    let live = true;
    api
      .getPayerForms(caseId, stage)
      .then((res) => live && setForms({ key, rows: res?.forms || [], readOnly: !!res?.read_only, error: null }))
      .catch((err) => live && setForms({ key, rows: [], readOnly: false, error: err?.message || "Could not load the payer's forms." }));
    return () => {
      live = false;
    };
  }, [caseId, stage, key, reloadKey]);

  const rows = liveAsks(asks, documents, forms.key === key ? forms.rows : []);
  useEffect(() => {
    onFormsChange?.(forms.key === key ? forms.rows : []);
  }, [forms, key, onFormsChange]);

  const locked = readOnly || forms.readOnly;
  const openForm = forms.rows.find((f) => f.url === open) || null;
  const blocking = rows.filter((r) => r.blocking).length;
  const open_ = rows.filter((r) => r.status !== "attached" && r.status !== "answered").length;

  const pick = (row) => {
    setError(null);
    pendingRef.current = row;
    fileRef.current?.click();
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    const row = pendingRef.current;
    e.target.value = "";
    if (!file || !row) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`${file.name} is over 2 MB; the payer takes 2 MB a document at most.`);
      return;
    }
    try {
      onAttach(row, await readFileAsAttachment(file, { maxBytes: 0, fallbackType: "application/pdf" }));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="cv-card" aria-label={title}>
      <input type="file" ref={fileRef} accept="application/pdf,image/jpeg,image/png" style={{ display: "none" }} onChange={onFile} />
      <div className="cv-card-head">
        <h2 className="cv-card-title">{title}</h2>
        {rows.length > 0 && <span className="cv-card-meta">{blocking ? `${blocking} needed before you can send` : open_ ? `${open_} open` : "All in"}</span>}
      </div>
      <details className="cv-howto">
        <summary>How this works</summary>
        <div className="cv-card-intro">From the payer's rules and the plan. Required rows block sending.</div>
      </details>
      {error && <div className="cv-card-body"><div className="cv-notice is-bad"><div className="cv-notice-body">{error}</div></div></div>}
      {forms.error && <div className="cv-card-body"><div className="cv-notice is-warn"><div className="cv-notice-body">{forms.error} Reload the page to try again.</div></div></div>}
      {rows.length === 0 && <div className="cv-card-body cv-card-meta">The payer needs nothing extra now.</div>}
      {GROUPS.map((group) => {
        const members = rows.filter((row) => rank(row) === group.rank);
        if (!members.length) return null;
        return (
          <div key={group.rank} className={`cv-ask-group is-${group.title.toLowerCase()}`}>
            <div className="cv-ask-group-title">
              {group.title} · {members.length}
            </div>
            {members.map((row) => {
        const [label, tone] = badge(row);
        const done = isDone(row);
        return (
          <div key={`${row.kind}-${row.form_url || row.code}`} className="cv-row">
            <span className={`cv-chip cv-row-badge ${tone}`}>{label}</span>
            <div className="cv-row-body">
              <div className="cv-row-title">{row.display}</div>
              <div className="cv-row-sub">
                {detail(row)}
                {row.blocking && row.reason ? <span className="cv-ask-why"> · {row.reason}</span> : null}
              </div>
            </div>
            {row.kind === "document" ? (
              <>
                <ViewFile file={row.file} name={row.file_name || row.display} />
                <button type="button" className="cv-btn" disabled={locked} onClick={() => pick(row)}>
                  {done ? "Replace" : "Attach"}
                </button>
              </>
            ) : (
              <button type="button" className="cv-btn" disabled={!forms.rows.some((f) => f.url === row.form_url)} onClick={() => setOpen(row.form_url)}>
                {locked ? "View" : done ? "Edit" : "Fill"}
              </button>
            )}
          </div>
        );
            })}
          </div>
        );
      })}
      {openForm && (
        <FormEditor
          key={openForm.url}
          caseId={caseId}
          stage={stage}
          form={openForm}
          readOnly={locked}
          lockedBy={readOnly ? "account" : "claim"}
          onClose={() => setOpen(null)}
          onSaved={(saved) => {
            setForms((prev) => ({ ...prev, rows: prev.rows.map((f) => (f.url === saved.url ? saved : f)) }));
            setOpen(null);
          }}
        />
      )}
    </section>
  );
}
