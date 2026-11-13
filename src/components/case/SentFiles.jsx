import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api } from "../../api";
import { ViewFile } from "../Common";

export default function SentFiles({ caseId, stage }) {
  const [state, setState] = useState({ key: null, files: [] });
  const key = `${caseId}|${stage}`;

  useEffect(() => {
    if (!caseId) return;
    let live = true;
    api
      .getCaseFiles(caseId, stage)
      .then((res) => live && setState({ key, files: res?.files || [] }))
      .catch((err) => {
        if (err) err.handled = true;
        if (live) setState({ key, files: [] });
      });
    return () => {
      live = false;
    };
  }, [caseId, stage, key]);

  const files = state.key === key ? state.files : [];
  if (files.length === 0) return null;
  const leg = stage === "claim" ? "claim" : "pre-auth";

  return (
    <section className="cv-card" aria-label="Files sent to the payer">
      <div className="cv-card-head">
        <h2 className="cv-card-title">Files sent to the payer</h2>
        <span className="cv-card-meta">
          {files.length} {files.length === 1 ? "file" : "files"} went with the latest {leg}
        </span>
      </div>
      <div className="cv-card-body">
        <div className="doc-list">
          {files.map((file) => (
            <div key={file.sequence} className="doc-row is-attached">
              <CheckCircle2 size={17} className="doc-icon" aria-hidden="true" />
              <div className="doc-main">
                <div className="doc-name">{file.title}</div>
                {file.code && (
                  <div className="doc-meta">
                    <span className="cv-mono">{file.code}</span>
                  </div>
                )}
              </div>
              <div className="doc-actions">
                <span className="cv-chip is-ok doc-attached">
                  <CheckCircle2 size={11} aria-hidden="true" /> Sent
                </span>
                <ViewFile name={file.title} load={() => api.getCaseFile(caseId, { stage, sequence: file.sequence })} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
