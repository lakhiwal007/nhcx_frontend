import { useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { api, markHandled } from "../api";
import { useSend } from "../hooks/useSend";
import { readFileAsAttachment, attachmentLimitText } from "../files";
import { Drawer } from "./Overlay";
import Dropdown from "./Dropdown";
import { SEND_REASONS, PRIORITIES } from "../communications";

export const OUTBOUND_COMMUNICATIONS_ENABLED = true;

const FREE_TEXT = "__other__";

export default function SendMessageDrawer({ open, onClose, defaultPayerId = "", defaultClaimReference = "", references = [], claimId, cashlessCaseId, onSent }) {
  const [payers, setPayers] = useState({ loaded: false, list: [] });
  const [payerId, setPayerId] = useState(defaultPayerId);
  const [reference, setReference] = useState(defaultClaimReference);
  const [referenceChoice, setReferenceChoice] = useState(defaultClaimReference || (references[0]?.value ?? FREE_TEXT));
  const [reasonCode, setReasonCode] = useState("grievance");
  const [priority, setPriority] = useState("routine");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [fileError, setFileError] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!open || payers.loaded) return undefined;
    let live = true;
    api
      .searchPayers({})
      .then((res) => live && setPayers({ loaded: true, list: (res?.payers || res || []).filter((p) => p?.code) }))
      .catch((err) => {
        markHandled(err);
        if (live) setPayers({ loaded: true, list: [] });
      });
    return () => {
      live = false;
    };
  }, [open, payers.loaded]);

  const refOptions = [...references.map((r) => ({ value: r.value, label: r.label ? `${r.label} · ${r.value}` : r.value })), { value: FREE_TEXT, label: "Another reference…" }];
  const effectiveReference = referenceChoice === FREE_TEXT || !references.length ? reference : referenceChoice;
  const payerOptions = payers.list.map((p) => ({ value: p.code, label: p.name ? `${p.name} · ${p.code}` : p.code }));
  const payerKnown = payerOptions.some((p) => p.value === payerId);

  const send = useSend(
    async () =>
      api.sendCommunication({
        payer_id: payerId.trim(),
        claim_reference: effectiveReference.trim(),
        reason_code: reasonCode,
        priority,
        ...(message.trim() && { message: message.trim() }),
        ...(attachments.length && { attachments: attachments.map((a) => ({ url: a.url, title: a.title, content_type: a.contentType })) }),
        ...(claimId && { claim_id: claimId }),
        ...(cashlessCaseId && { cashless_case_id: cashlessCaseId }),
      }),
    {
      success: "Message sent to the payer. Its reply lands in Communications.",
      onDone: (res) => {
        setMessage("");
        setAttachments([]);
        onSent?.(res);
        onClose();
      },
    },
  );

  const addFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(null);
    try {
      const uploaded = await readFileAsAttachment(file);
      setAttachments((prev) => [...prev, uploaded]);
    } catch (err) {
      setFileError(err?.message || `${file.name} could not be read.`);
    }
  };

  const canSend = !!payerId.trim() && !!effectiveReference.trim() && !!reasonCode && !send.busy;
  const close = () => {
    send.reset();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={send.busy ? undefined : close}
      title="Message the payer"
      subtitle="Goes to the payer over NHCX. Its reply arrives in Communications, not here."
      width={560}
      footer={
        <div className="cv-drawer-actions">
          <button type="button" className="cv-btn" onClick={close} disabled={send.busy}>
            Cancel
          </button>
          <button type="button" className="cv-btn is-primary" disabled={!canSend} onClick={send.run}>
            {send.busy ? "Sending…" : "Send to payer"}
          </button>
        </div>
      }
    >
      <div className="cm-form">
        <div className="cv-field-stack">
          <span className="cv-field-key">Payer</span>
          {payerOptions.length && (payerKnown || !payerId) ? (
            <Dropdown ariaLabel="Payer" value={payerId} options={payerOptions} placeholder="Choose a payer" onChange={setPayerId} />
          ) : (
            <input className="cv-ctl cv-ctl-fill" aria-label="Payer code" placeholder="Payer code, e.g. 1518@hcx" value={payerId} onChange={(e) => setPayerId(e.target.value)} />
          )}
        </div>
        <div className="cv-field-stack">
          <span className="cv-field-key">About</span>
          {references.length > 0 ? <Dropdown ariaLabel="Reference" value={referenceChoice} options={refOptions} onChange={setReferenceChoice} /> : null}
          {(referenceChoice === FREE_TEXT || !references.length) && <input className="cv-ctl cv-ctl-fill" aria-label="Reference" placeholder="Claim or pre-auth reference, e.g. PA-2026-00001" value={reference} onChange={(e) => setReference(e.target.value)} />}
        </div>
        <div className="cv-form-grid">
          <div className="cv-field-stack">
            <span className="cv-field-key">Reason</span>
            <Dropdown ariaLabel="Reason" value={reasonCode} options={SEND_REASONS} onChange={setReasonCode} />
          </div>
          <div className="cv-field-stack">
            <span className="cv-field-key">Priority</span>
            <Dropdown ariaLabel="Priority" value={priority} options={PRIORITIES} onChange={setPriority} />
          </div>
        </div>
        <label className="cv-field-stack">
          <span className="cv-field-key">Message</span>
          <textarea className="cv-ctl cv-textarea cv-ctl-fill" placeholder="What the payer should know or do" value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <div className="cv-field-stack">
          <span className="cv-field-key">Attachments (optional, up to {attachmentLimitText()} each)</span>
          <input type="file" ref={fileInput} onChange={addFile} className="sr-only" aria-label="Attach a file" />
          {attachments.length > 0 && (
            <ul className="cm-attachments">
              {attachments.map((a, i) => (
                <li key={`${a.title}-${i}`}>
                  <Paperclip size={13} aria-hidden="true" />
                  <span className="cm-attachment-name">{a.title}</span>
                  <button type="button" className="cv-icon-btn" aria-label={`Remove ${a.title}`} onClick={() => setAttachments((prev) => prev.filter((_, n) => n !== i))}>
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <button type="button" className="cv-btn" onClick={() => fileInput.current?.click()}>
              <Paperclip size={14} aria-hidden="true" /> Attach a file
            </button>
          </div>
          {fileError && (
            <div className="cv-notice is-bad" role="alert">
              <div className="cv-notice-body">{fileError}</div>
            </div>
          )}
        </div>
        {send.error && (
          <div className="cv-notice is-bad" role="alert">
            <div className="cv-notice-body">{send.error}</div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
