import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import FormEditor from "./PayerForms";
import { liveAsks } from "./askStatus";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SOURCE = { ruling: "payer's ruling", plan: "plan, every case", package: "plan, for the package", consent: "PMJAY, in place of biometrics" };

function badge(row) {
  if (row.kind === "document") return row.status === "attached" ? ["Attached", "is-ok"] : [row.blocking ? "Missing" : "Not attached", row.blocking ? "is-bad" : "is-warn"];
  if (row.status === "answered") return ["Answered", "is-ok"];
  if (row.status === "partial") return [`${row.answered_required} of ${row.required}`, "is-bad"];
  return ["Not filled", row.blocking ? "is-bad" : "is-warn"];
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

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const match = /^data:(.*?);base64,(.*)$/.exec(reader.result || "");
      if (!match) return reject(new Error(`Could not read ${file.name}.`));
      const type = match[1] || file.type || "application/pdf";
      resolve({ url: reader.result, content_type: type, attachment: { contentType: type, data: match[2], title: file.name } });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });

export default function PayerAsks({ caseId, stage, asks, documents, readOnly, onAttach, onFormsChange, title = "What the payer asks for" }) {
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
  }, [caseId, stage, key]);

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
      onAttach(row, await readFile(file));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="cv-card" aria-label={title}>
      <input type="file" ref={fileRef} accept="application/pdf,image/jpeg,image/png" style={{ display: "none" }} onChange={onFile} />
      <div className="cv-card-head">
        <h2 className="cv-card-title">{title}</h2>
        {rows.length > 0 && (
          <span className={`cv-chip ${blocking ? "is-bad" : open_ ? "is-warn" : "is-ok"}`}>
            {blocking ? `${blocking} must be done` : open_ ? `${open_} open` : "All in"}
          </span>
        )}
      </div>
      <div className="cv-card-intro">From the payer's ruling first, then the plan. A row is ticked only by a file or answer filed against it; red rows stop the send.</div>
      {error && <div className="cv-card-body"><div className="cv-notice is-bad"><div className="cv-notice-body">{error}</div></div></div>}
      {forms.error && <div className="cv-card-body"><div className="cv-notice is-warn"><div className="cv-notice-body">{forms.error} Reload the page to try again.</div></div></div>}
      {rows.length === 0 && <div className="cv-card-body cv-card-meta">The payer asks for nothing extra at this stage.</div>}
      {rows.map((row) => {
        const [label, tone] = badge(row);
        const done = row.status === "attached" || row.status === "answered";
        return (
          <div key={`${row.kind}-${row.form_url || row.code}`} className="cv-row">
            <span className={`cv-chip cv-row-badge ${tone}`}>{label}</span>
            <div className="cv-row-body">
              <div className="cv-row-title">{row.display}</div>
              <div className="cv-row-sub">
                {detail(row)}
                {row.blocking && row.reason ? <span style={{ color: "var(--error)" }}> · stops the send: {row.reason}</span> : null}
              </div>
            </div>
            {row.kind === "document" ? (
              <button type="button" className={`cv-btn${done ? "" : " is-primary"}`} disabled={locked} onClick={() => pick(row)}>
                {done ? "Replace" : "Attach"}
              </button>
            ) : (
              <button type="button" className={`cv-btn${done || locked ? "" : " is-primary"}`} disabled={!forms.rows.some((f) => f.url === row.form_url)} onClick={() => setOpen(row.form_url)}>
                {locked ? "View" : done ? "Edit" : "Fill"}
              </button>
            )}
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
