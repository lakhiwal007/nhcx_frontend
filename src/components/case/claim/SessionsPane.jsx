import { DocumentChecklist } from "../../ui/Common";
import Dropdown from "../../ui/Dropdown";
import { formatDate, formatTime } from "../../../lib/format";

const METHOD_WORD = { FACE_AUTH: "face", FINGERPRINT: "fingerprint", IRIS: "iris" };

export default function SessionsPane({ cycle, docs, documents, readOnly, reportsRequired }) {
  const free = docs.filter((d) => d.kind === "health_record" && !d.session && !d.url);
  const options = free.map((d) => ({ value: d.record_id, label: d.event_date ? `${d.name}, visit on ${d.event_date}` : d.name }));

  const release = (number) => {
    const held = docs.findIndex((d) => d.session === number && !d.url);
    if (held >= 0) documents.attach(held, { session: undefined, error: null });
  };
  const attachFile = (number, slot, uploaded) => {
    release(number);
    documents.attachAsk({ code: slot.code, display: slot.name }, { ...uploaded, session: number, optional: !reportsRequired, custom: true });
  };
  const attachRecord = (number, recordId) => {
    release(number);
    const index = docs.findIndex((d) => String(d.record_id) === String(recordId));
    documents.attach(index, { session: number });
    documents.attachRecord(index);
  };
  const remove = (doc) => {
    const index = docs.indexOf(doc);
    if (doc.record_id) documents.attach(index, { session: undefined, attachment: undefined, url: undefined, error: null });
    else documents.remove(index);
  };

  return (
    <section className="cv-card" aria-label="Sessions">
      <div className="cv-card-head">
        <h2 className="cv-card-title">Sessions</h2>
        <span className="cv-card-meta">
          {cycle.name} <span className="cv-mono">{cycle.code}</span>. {cycle.max_sessions ? `The plan allows ${cycle.max_sessions} sessions. ` : ""}The payer pays only the sessions recorded here.
        </span>
      </div>
      <div className="cv-card-body">
        {cycle.sessions.length === 0 && <div className="cv-card-meta">No sessions yet.</div>}
        {cycle.sessions.map((session) => {
          const tied = docs.filter((d) => d.session === session.number);
          const report = tied.find((d) => d.url);
          const slot = { code: `SESSION-${session.number}`, name: `Session ${session.number} report`, optional: !reportsRequired, custom: true };
          const rows = report ? [report] : [...tied, slot];
          return (
            <div key={session.number} className="cyc-session">
              <div>
                <div className="cv-row-title">Session {session.number}</div>
                <div className="cv-row-sub">
                  {formatDate(session.started_at)}, {formatTime(session.started_at)} to {formatTime(session.ended_at)}. Verified by {METHOD_WORD[session.auth_method] || "biometrics"}.
                </div>
              </div>
              <DocumentChecklist
                documents={rows}
                onUpload={(doc, uploaded) => attachFile(session.number, doc, uploaded)}
                onRemoveDocument={report ? () => remove(report) : undefined}
                onFetchRecord={(i) => documents.attachRecord(docs.indexOf(rows[i]))}
                onDetachRecord={() => remove(report)}
                readOnly={readOnly}
                hideSummary
              />
              {!report && !readOnly && options.length > 0 && (
                <div className="cyc-record">
                  <Dropdown compact ariaLabel={`Hospital record for session ${session.number}`} value="" options={options} placeholder="Or use a hospital record" onChange={(id) => attachRecord(session.number, id)} />
                </div>
              )}
            </div>
          );
        })}
        {cycle.sessions.length > 0 && <div className="cv-card-meta cv-sub-note-top">{reportsRequired ? "Attach a report for each session." : "Attach reports now or before the final claim."}</div>}
      </div>
    </section>
  );
}
