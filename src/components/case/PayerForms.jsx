import { useState, useEffect } from "react";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { Button, LoadingBlock } from "../Common";
import { Drawer } from "../Overlay";
import { Section } from "./CaseFile";

// The payer's forms one leg carries (NHA D12), answered here and sent with the
// pre-auth or claim as QuestionnaireResponses (F7).
const LEG_LABEL = { preauth: "pre-auth", claim: "claim" };
const NO_INPUT = ["group", "display"];
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const match = /^data:([^;]*);base64,(.*)$/.exec(String(reader.result));
      if (!match) return reject(new Error(`Could not read ${file.name}.`));
      resolve({ title: file.name, content_type: match[1] || file.type || "application/pdf", data: match[2] });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });

function Question({ item, value, file, disabled, onChange, onFile }) {
  const id = `pf-${item.linkId}`;
  if (NO_INPUT.includes(item.type)) {
    return <div className={item.type === "group" ? "ep-detail-title" : "ep-muted"}>{item.text}</div>;
  }
  const label = (
    <label htmlFor={id} className="ep-strong">
      {item.text || item.linkId}
      {item.required ? " *" : ""}
    </label>
  );
  let input;
  if (item.type === "attachment") {
    input = (
      <div>
        {file && <div className="ep-muted">Attached: {file.title}</div>}
        <input id={id} type="file" accept="application/pdf,image/jpeg,image/png" disabled={disabled} onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
    );
  } else if (item.type === "boolean") {
    input = (
      <select id={id} className="input-modern" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  } else if (item.options?.length) {
    input = (
      <select id={id} className="input-modern" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {item.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else {
    const type = { date: "date", dateTime: "datetime-local", time: "time", integer: "number", decimal: "number", quantity: "number" }[item.type];
    input =
      item.type === "text" ? (
        <textarea id={id} className="input-modern" rows={3} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input-modern" type={type || "text"} step={item.type === "integer" ? 1 : "any"} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      );
  }
  return (
    <div className="pf-question" style={{ paddingLeft: `${(item.depth || 0) * 16}px`, marginBottom: "var(--space-3)" }}>
      {label}
      {input}
      {item.initial && !value && item.type !== "attachment" && <div className="ep-muted">The payer's default: {item.initial}</div>}
    </div>
  );
}

function FormEditor({ caseId, stage, form, readOnly, lockedBy, onClose, onSaved }) {
  const [values, setValues] = useState(() => Object.fromEntries(form.items.map((it) => [it.linkId, it.answer ?? ""])));
  const [files, setFiles] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const pickFile = async (linkId, file) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`${file.name} is over 2 MB; the payer takes 2 MB a document at most.`);
      return;
    }
    try {
      const read = await readFile(file);
      setFiles((prev) => ({ ...prev, [linkId]: read }));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const answers = form.items
        .filter((it) => !NO_INPUT.includes(it.type))
        .map((it) => (it.type === "attachment" ? { link_id: it.linkId, attachment: files[it.linkId] } : { link_id: it.linkId, answer: values[it.linkId] ?? "" }))
        .filter((a) => a.attachment !== undefined || "answer" in a);
      const saved = await api.savePayerForm(caseId, { stage, form_url: form.url, answers });
      onSaved(saved);
    } catch (err) {
      setError(err.message || "Could not save the answers.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width={720}
      title={form.title || "Payer form"}
      subtitle={form.consent ? "The scheme's consent form for this leg" : `Answered for the ${LEG_LABEL[stage]}`}
      footer={
        !readOnly && (
          <Button write variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save answers"}
          </Button>
        )
      }
    >
      {readOnly && (
        <div className="ep-notice">
          {lockedBy === "account" ? "This account can view only." : "The claim has gone to the payer, so the pre-auth's forms are read only."}
        </div>
      )}
      {form.consent && (
        <div className="ep-notice">
          Upload the signed declaration. The other questions take the payer's default answer when left blank.
        </div>
      )}
      {error && <div className="ep-notice is-bad">{error}</div>}
      {form.items.map((it) => (
        <Question
          key={it.linkId}
          item={it}
          value={values[it.linkId] ?? ""}
          file={files[it.linkId] || it.file}
          disabled={readOnly}
          onChange={(v) => setValues((prev) => ({ ...prev, [it.linkId]: v }))}
          onFile={(f) => pickFile(it.linkId, f)}
        />
      ))}
    </Drawer>
  );
}

export default function PayerForms({ caseId, stage }) {
  const viewOnly = useReadOnly();
  const [state, setState] = useState({ key: null, data: null, error: null });
  const [open, setOpen] = useState(null);
  const key = `${caseId}|${stage}`;

  useEffect(() => {
    if (!caseId) return;
    let live = true;
    api
      .getPayerForms(caseId, stage)
      .then((res) => live && setState({ key, data: res, error: null }))
      .catch((err) => live && setState({ key, data: null, error: err?.message || "Could not load the payer's forms." }));
    return () => {
      live = false;
    };
  }, [caseId, stage, key]);

  if (!caseId) return null;
  const loading = state.key !== key;
  const forms = state.data?.forms || [];
  const openForm = forms.find((f) => f.url === open) || null;
  const unanswered = forms.filter((f) => !f.answered).length;
  const readOnly = viewOnly || !!state.data?.read_only;

  const onSaved = (saved) => {
    setState((prev) => ({ ...prev, data: { ...prev.data, forms: (prev.data?.forms || []).map((f) => (f.url === saved.url ? saved : f)) } }));
    setOpen(null);
  };

  return (
    <Section
      id={`payer-forms-${stage}`}
      title="Payer forms"
      info="payer_forms"
      tip="Open each form and answer the questions. Answers are sent with the request; required forms left empty can get it refused."
      meta={forms.length ? `${forms.length - unanswered} of ${forms.length} answered · sent with the ${LEG_LABEL[stage]}` : null}
    >
      {loading ? (
        <LoadingBlock compact text="Loading the payer's forms…" />
      ) : state.error ? (
        <div className="ep-notice is-bad">
          {state.error} Reload the page to try again. You can still send the request; the payer may ask for the answers later.
        </div>
      ) : !forms.length ? (
        <div className="ep-muted ep-pad">The payer asks for no forms on the {LEG_LABEL[stage]}.</div>
      ) : (
        <ul className="pf-list">
          {forms.map((f) => (
            <li key={f.url} style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", marginBottom: "var(--space-2)" }}>
              <span className="ep-strong" style={{ flex: 1 }}>
                {f.title || f.url}
                {f.consent && <span className="ep-label"> Consent</span>}
                {f.kind === "stgquestionnaire" && <span className="ep-label"> STG</span>}
              </span>
              <span className="ep-muted">{f.answered ? `${f.answered} answered` : "Not answered"}</span>
              <Button variant="outline" onClick={() => setOpen(f.url)}>
                {readOnly ? "View" : f.answered ? "Edit" : "Fill"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {openForm && (
        <FormEditor key={openForm.url} caseId={caseId} stage={stage} form={openForm} readOnly={readOnly} lockedBy={viewOnly ? "account" : "claim"} onClose={() => setOpen(null)} onSaved={onSaved} />
      )}
    </Section>
  );
}
