import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, FileText, Paperclip } from "lucide-react";
import { api, markHandled } from "../../api";
import { useReadOnly } from "../../lib/readOnly";
import { useSend } from "../../hooks/util/useSend";
import { resolveAction } from "../../api/actionMap";
import { QueryResponseFields, LoadingBlock } from "../ui/Common";
import { Drawer } from "../ui/Overlay";
import ConfirmModal from "../ui/ConfirmModal";
import PayerName from "../ui/PayerName";
import TechnicalDetails from "../case/step/TechnicalDetails";
import { formatDateTime, humanize, priorityLabel, safeHref } from "../../lib/format.js";
import { buildActionBody, documentFromFile, carriesDocuments } from "../../domain/queryResponse.js";
import { REASONS, commHeadline, commPreview, parseDocumentsFromTaskInputs, reasonLabel, isUrgent, sameMoment } from "../../domain/communications";


export default function CommunicationDetailDrawer({ correlationId, open, onClose, onRead, onChanged, allFacilitiesMode = false, showOpenCase = true }) {
  const navigate = useNavigate();
  const readOnly = useReadOnly() || allFacilitiesMode;
  const [state, setState] = useState({ key: null, detail: null, error: null, attempt: 0 });
  const [answer, setAnswer] = useState("");
  const [docs, setDocs] = useState([]);
  const [replied, setReplied] = useState(null);
  const [confirmReviewed, setConfirmReviewed] = useState(false);

  const loadKey = open && correlationId ? `${correlationId}|${state.attempt}` : null;
  useEffect(() => {
    if (!loadKey) return undefined;
    const id = loadKey.split("|")[0];
    let live = true;
    api
      .getCommunicationStatus(id)
      .then((res) => {
        if (!live) return;
        setState((prev) => ({ ...prev, key: loadKey, detail: res, error: null }));
        if (!res.provider_read && !readOnly) {
          api
            .markCommunicationRead(id)
            .then(() => onRead?.(id))
            .catch(() => {});
        }
      })
      .catch((err) => {
        markHandled(err);
        if (live) setState((prev) => ({ ...prev, key: loadKey, detail: null, error: err?.message || "The message could not be read." }));
      });
    return () => {
      live = false;
    };
  }, [loadKey, readOnly, onRead]);

  const loading = !!loadKey && state.key !== loadKey;
  const detail = state.key === loadKey ? state.detail : null;
  const error = state.key === loadKey ? state.error : null;
  const reload = () => setState((prev) => ({ ...prev, attempt: prev.attempt + 1 }));

  const reviewTask = detail?.pending_tasks?.find((t) => t.task_type === "review_communication");
  const taskId = reviewTask?.id ?? reviewTask?.task_id;
  const taskAction = reviewTask?.action;
  const actionable = !!taskAction && taskAction.code !== "review_communication";
  const inbound = detail?.direction !== "outbound";
  const answered = !!replied || (!reviewTask && !!detail?.completed_tasks?.some((t) => t.task_type === "review_communication"));
  const isQuery = !detail?.kind || detail.kind === "query";
  const canReply = inbound && isQuery && !answered && !actionable && !readOnly;
  const requiredDocs = reviewTask?.required_documents?.length ? reviewTask.required_documents : parseDocumentsFromTaskInputs(detail?.task_inputs);
  const reason = REASONS[detail?.reason_code];

  const reply = useSend(
    async () => {
      const res = await api.respondToCommunication(correlationId, {
        message: answer.trim() || undefined,
        documents: docs.map((d) => ({ title: d.title, content_type: d.contentType, data: d.data })),
      });
      setReplied(res);
      setAnswer("");
      setDocs([]);
      onChanged?.();
      return res;
    },
    { success: "Reply sent to the payer" },
  );

  const act = useSend(
    async () => {
      const { method, url } = resolveAction(taskAction);
      const hint = taskAction.payload_hint ?? {};
      const body = carriesDocuments(taskAction.code)
        ? { ...hint, ...buildActionBody(taskAction.code, { claim_id: hint.claim_id ?? detail?.claim_id, cashless_case_id: hint.cashless_case_id ?? detail?.cashless_case_id, answer, docs: docs.map(documentFromFile) }) }
        : hint;
      const res = method === "GET" ? await api.rawGet(url, hint) : await api.rawPost(url, body);
      if (res?.status === "failed") throw new Error(res?.message || "The payer did not accept it.");
      setReplied(res);
      setAnswer("");
      setDocs([]);
      onChanged?.();
      return res;
    },
    { success: "Sent to the payer" },
  );

  const complete = useSend(
    async () => {
      const res = await api.completeTask(taskId, { note: "Reviewed from Communications", metadata: replied?.correlation_id ? { submitted_correlation_id: replied.correlation_id } : {} });
      onChanged?.();
      onClose();
      return res;
    },
    { success: "Marked as reviewed" },
  );

  const ack = useSend(
    async () => {
      const res = await api.acknowledgeCommunication(correlationId);
      setState((prev) => ({ ...prev, detail: prev.detail ? { ...prev.detail, acknowledged: !!res?.acknowledged, acknowledged_at: res?.acknowledged_at ?? prev.detail.acknowledged_at, ack_error: res?.acknowledged ? null : res?.ack_error || res?.message || prev.detail.ack_error } : prev.detail }));
      if (!res?.acknowledged) throw new Error(res?.ack_error || res?.message || "The payer did not accept the acknowledgement.");
      return res;
    },
    { success: "Receipt acknowledged to the payer" },
  );

  const openCase = () => {
    if (detail?.cashless_case_id && detail?.child_id) {
      navigate(`/case/${detail.child_id}/?case=${detail.cashless_case_id}`, { state: { cashless_case_id: detail.cashless_case_id, claim_id: detail.claim_id ?? null, from: "/communications" } });
    }
  };
  const markReviewed = () => {
    if (canReply && !replied) setConfirmReviewed(true);
    else complete.run();
  };

  const status = !detail
    ? null
    : !inbound
      ? { tone: "info", title: "Sent to the payer", text: "The payer's answer appears in this list when it arrives." }
      : actionable && !replied
        ? { tone: "warn", title: "The payer needs documents", text: "Send what it lists below. The case waits until you do." }
        : canReply
          ? { tone: "warn", title: "The payer is waiting for your reply", text: "Read the message, then reply below with what it asks for." }
          : answered
            ? { tone: "ok", title: "Answered", text: "Your reply has been sent. The payer's next answer appears in the case." }
            : detail.kind === "notification"
              ? { tone: "info", title: "For your information", text: "An update from the payer, acknowledged automatically. No reply is needed." }
              : { tone: "info", title: "For your information", text: "A note from the payer. No reply is needed." };

  const primary = !detail || readOnly
    ? null
    : canReply
      ? { label: reply.busy ? "Sending…" : "Send reply", disabled: reply.busy || (!answer.trim() && docs.length === 0), onClick: reply.run }
      : actionable && !replied
        ? { label: act.busy ? "Sending…" : taskAction.label || "Send the documents", disabled: act.busy || (carriesDocuments(taskAction.code) && docs.length === 0 && !answer.trim()), onClick: act.run }
        : taskId
          ? { label: complete.busy ? "Marking…" : "Mark reviewed", disabled: complete.busy, onClick: markReviewed }
          : null;

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={600}
        stack
        title={detail ? commHeadline(detail) : "Payer message"}
        titleExtra={
          detail && (
            <>
              {reasonLabel(detail) && <span className={`cv-chip is-${reason?.tone || "todo"}`}>{reasonLabel(detail)}</span>}
              {detail.priority && <span className={`cv-chip is-${isUrgent(detail) ? "bad" : "todo"}`}>{priorityLabel(detail.priority)}</span>}
            </>
          )
        }
        footer={
          (primary || (showOpenCase && detail?.cashless_case_id && detail?.child_id)) && (
            <div className="cv-drawer-actions">
              {showOpenCase && detail?.cashless_case_id && detail?.child_id && (
                <button type="button" className="cv-btn" onClick={openCase}>
                  <ExternalLink size={14} aria-hidden="true" /> Open case
                </button>
              )}
              {primary && (
                <button type="button" className="cv-btn is-primary" disabled={primary.disabled} onClick={primary.onClick}>
                  {primary.label}
                </button>
              )}
            </div>
          )
        }
      >
        {loading && <LoadingBlock compact text="Reading the message…" />}
        {error && !loading && (
          <div className="cv-notice is-bad" role="alert">
            <div className="cv-notice-body">The message could not be opened: {error}</div>
            <div className="cv-notice-actions">
              <button type="button" className="cv-btn" onClick={reload}>
                Retry
              </button>
            </div>
          </div>
        )}
        {detail && (
          <div className="cm-detail">
            {status && (
              <div className={`cv-notice is-${status.tone}`}>
                <div className="cv-notice-body">
                  <strong>{status.title}.</strong> {status.text}
                  {reason?.hint ? ` ${reason.hint}` : ""}
                </div>
              </div>
            )}

            <div className="cm-facts">
              <div className="cv-kv"><span>Payer</span><span><PayerName id={detail.payer_id} name={detail.payer_name} /></span></div>
              {detail.claim_reference && <div className="cv-kv"><span>About</span><span className="cv-mono">{detail.claim_reference}</span></div>}
              {detail.subject && <div className="cv-kv"><span>Subject</span><span>{detail.subject}</span></div>}
              <div className="cv-kv"><span>Received</span><span>{formatDateTime(detail.received_at || detail.sent_at)}</span></div>
              {detail.received_at && !sameMoment(detail.sent_at, detail.received_at) && <div className="cv-kv"><span>Sent by payer</span><span>{formatDateTime(detail.sent_at)}</span></div>}
              {detail.task_requester && <div className="cv-kv"><span>Requested by</span><span>{detail.task_requester}</span></div>}
              {detail.acknowledged ? (
                <div className="cv-kv"><span>Receipt</span><span>Acknowledged to the payer{detail.acknowledged_at ? ` ${formatDateTime(detail.acknowledged_at)}` : ""}</span></div>
              ) : detail.ack_error ? (
                <div className="cv-kv">
                  <span>Receipt</span>
                  <span className="is-bad">
                    Not acknowledged: {detail.ack_error}
                    {inbound && !readOnly && (
                      <>
                        {" "}
                        <button type="button" className="cv-link" disabled={ack.busy} onClick={ack.run}>
                          {ack.busy ? "Acknowledging…" : "Acknowledge again"}
                        </button>
                      </>
                    )}
                  </span>
                </div>
              ) : null}
            </div>

            {detail.payload?.length > 0 && (
              <section className="cm-section">
                <h4 className="cv-sub">What the payer wrote</h4>
                {detail.payload.map((p, i) => (
                  <div key={i} className="cm-bubble">
                    {p.content_string && <p>{p.content_string}</p>}
                    {safeHref(p.content_attachment) && (
                      <a className="cv-link cm-bubble-link" href={safeHref(p.content_attachment)} target="_blank" rel="noreferrer">
                        <Paperclip size={14} aria-hidden="true" /> View attachment
                      </a>
                    )}
                    {p.content_reference && <div className="cv-card-meta">Reference {p.content_reference}</div>}
                  </div>
                ))}
              </section>
            )}
            {detail.payload?.length === 0 && commPreview(detail) === "" && <p className="cv-card-meta">The payer sent no text with this message.</p>}

            {requiredDocs.length > 0 && (
              <section className="cm-section">
                <h4 className="cv-sub">Documents the payer asks for</h4>
                <ul className="cm-docs">
                  {requiredDocs.map((doc, i) => (
                    <li key={i}>
                      <FileText size={14} aria-hidden="true" />
                      <span>{doc.name || doc.display || doc.code}</span>
                      {doc.code && <span className="cv-mono cv-card-meta">{doc.code}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(canReply || (actionable && !replied)) && (
              <section className="cm-section">
                <h4 className="cv-sub">{actionable ? "Send the documents" : "Reply to the payer"}</h4>
                <QueryResponseFields label={actionable ? "Note to the payer (optional)" : "Your reply"} placeholder={actionable ? "Anything the payer should know about these documents" : "Answer the payer, and attach what it asks for"} answer={answer} onAnswerChange={setAnswer} documents={docs} onDocumentsChange={setDocs} />
                {(reply.error || act.error) && (
                  <div className="cv-notice is-bad" role="alert">
                    <div className="cv-notice-body">{reply.error || act.error}</div>
                  </div>
                )}
              </section>
            )}

            {replied && (
              <div className="cv-notice is-ok">
                <div className="cv-notice-body">
                  Sent to the payer.{replied.message ? ` ${replied.message}` : ""}
                  {taskId ? " Mark this message reviewed to close it from your queue." : ""}
                </div>
              </div>
            )}
            {complete.error && (
              <div className="cv-notice is-bad" role="alert">
                <div className="cv-notice-body">{complete.error}</div>
              </div>
            )}

            {detail.completed_tasks?.length > 0 && (
              <section className="cm-section">
                <h4 className="cv-sub">Done on this message</h4>
                <ul className="cm-done">
                  {detail.completed_tasks.map((t, i) => (
                    <li key={i}>{t.title || humanize(t.task_type)}</li>
                  ))}
                </ul>
              </section>
            )}

            <TechnicalDetails ids={[{ label: "Correlation id", value: detail.correlation_id }, { label: "Acknowledgement id", value: detail.ack_correlation_id }, { label: "Message status", value: detail.comm_status }, { label: "Reason code", value: detail.reason_code }, { label: "Task created", value: detail.authored_on ? formatDateTime(detail.authored_on) : null }, { label: "Sent id", value: replied?.correlation_id }]} />
          </div>
        )}
      </Drawer>

      <ConfirmModal
        open={confirmReviewed}
        title="Mark reviewed without replying?"
        subtitle="The payer asked a question on this message and has not been answered. Marking it reviewed closes the task on your side only."
        confirmLabel="Mark reviewed anyway"
        cancelLabel="Go back"
        busy={complete.busy}
        onCancel={() => setConfirmReviewed(false)}
        onConfirm={() => {
          setConfirmReviewed(false);
          complete.run();
        }}
      />
    </>
  );
}
