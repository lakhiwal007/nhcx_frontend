import { useState } from "react";
import { Drawer } from "../../ui/Overlay";
import { QueryResponseFields } from "../../ui/Common";
import { documentFromFile } from "../../../domain/queryResponse";
import { useSend } from "../../../hooks/util/useSend";
import PayerWords from "../step/PayerWords";

const messageText = (comm) =>
  (comm?.payload || [])
    .map((p) => p?.content_string || p?.contentString || p?.text)
    .filter(Boolean)
    .join("\n") || comm?.subject || comm?.headline || "";

export default function AnswerPayerQuery({
  open,
  onClose,
  title = "Answer the payer's question",
  question = {},
  send,
  onSent,
  sendLabel = "Send answer",
  successMessage = "Answer sent to the payer",
  intro,
  answerLabel = "Your answer",
}) {
  const [answer, setAnswer] = useState("");
  const [files, setFiles] = useState([]);
  const { run, busy, error, reset } = useSend(() => send({ answer: answer.trim(), docs: files.map(documentFromFile) }), {
    success: successMessage,
    onDone: (res) => {
      setAnswer("");
      setFiles([]);
      onSent?.(res);
      onClose?.();
    },
  });

  const close = () => {
    reset();
    onClose?.();
  };

  const notes = question.notes || [];
  const requested = question.requestedDocuments || [];
  const comms = (question.communications || []).map(messageText).filter(Boolean);
  const description = question.description || null;
  const hasQuestion = notes.length > 0 || requested.length > 0 || comms.length > 0 || !!description;

  return (
    <Drawer
      open={open}
      onClose={busy ? undefined : close}
      title={title}
      width={600}
      footer={
        <div className="cv-drawer-actions">
          <button type="button" className="cv-btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="cv-btn is-primary" onClick={run} disabled={busy || !answer.trim()}>
            {busy ? "Sending…" : sendLabel}
          </button>
        </div>
      }
    >
      {intro && <p className="cv-drawer-intro">{intro}</p>}
      <section className="cv-ask">
        <h4 className="cv-sub">The payer asked</h4>
        {hasQuestion ? (
          <>
            <PayerWords notes={[...notes, ...comms]} empty="" />
            {description && <p className="cv-ask-text">{description}</p>}
            {requested.length > 0 && (
              <ul className="cv-ask-docs">
                {requested.map((doc, i) => (
                  <li key={i}>{typeof doc === "string" ? doc : doc.name || doc.display || doc.code}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="cv-card-meta">The payer's question did not come with any text. Check the Work Queue task or call the payer desk.</p>
        )}
      </section>
      <QueryResponseFields label={answerLabel} answer={answer} onAnswerChange={setAnswer} documents={files} onDocumentsChange={setFiles} />
      {error && (
        <div className="cv-notice is-bad cv-drawer-note" role="alert">
          <div className="cv-notice-body">{error}</div>
        </div>
      )}
    </Drawer>
  );
}
