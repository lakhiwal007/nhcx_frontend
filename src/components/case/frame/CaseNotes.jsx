import { useState, useEffect } from "react";
import { Pin, PinOff, Trash2, StickyNote } from "lucide-react";
import { api, markHandled } from "../../../api";
import { useReadOnly } from "../../../lib/readOnly";
import { useSend } from "../../../hooks/util/useSend";
import { Drawer } from "../../ui/Overlay";
import { LoadingBlock } from "../../ui/Common";
import ConfirmModal from "../../ui/ConfirmModal";
import Dropdown from "../../ui/Dropdown";
import { formatDateTime, formatRelative } from "../../../lib/format.js";

const NOTE_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "payer_call", label: "Call with the payer" },
  { value: "follow_up", label: "Follow-up" },
  { value: "billing", label: "Billing" },
  { value: "clinical", label: "Clinical" },
];

const MAX_LENGTH = 2000;
const categoryLabel = (v) => NOTE_CATEGORIES.find((c) => c.value === v)?.label || v;

export default function CaseNotesDrawer({ open, onClose, cashlessCaseId, notes, loaded, loadError, onChanged }) {
  const readOnly = useReadOnly();
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [busyId, setBusyId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    if (!open || userId !== null) return;
    api.getSession().then((s) => setUserId(s?.user?.id ?? "")).catch(() => setUserId(""));
  }, [open, userId]);

  const canChange = (note) => !note.author_id || String(note.author_id) === String(userId);

  const add = useSend(
    async () => {
      const text = body.trim();
      if (!text) return undefined;
      const res = await api.createCaseNote(cashlessCaseId, { body: text, category });
      setBody("");
      setCategory("general");
      await onChanged();
      return res;
    },
    { success: "Note added" },
  );

  const act = async (note, fn, failure) => {
    setBusyId(note.id);
    setActionError(null);
    try {
      await fn();
      await onChanged();
      return true;
    } catch (err) {
      markHandled(err);
      setActionError(err?.message || failure);
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Drawer open={open} onClose={onClose} title="Internal notes" subtitle="Visible to your hospital team only. Never sent to the payer." width={520}>
        {!readOnly && (
          <div className="cn-compose">
            <label className="cv-field-key" htmlFor="case-note-body">
              Add a note
            </label>
            <textarea
              id="case-note-body"
              className="cv-ctl cv-textarea cv-ctl-fill"
              placeholder="e.g. Called the TPA at 3pm, they will release the approval after the CBC report"
              value={body}
              maxLength={MAX_LENGTH}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim() && !add.busy) add.run();
              }}
            />
            <div className="cn-compose-row">
              <Dropdown compact ariaLabel="Note category" value={category} options={NOTE_CATEGORIES} onChange={setCategory} />
              <span className="cn-count cv-card-meta">
                {body.length}/{MAX_LENGTH}
              </span>
              <button type="button" className="cv-btn is-primary" onClick={add.run} disabled={!body.trim() || add.busy}>
                {add.busy ? "Saving…" : "Add note"}
              </button>
            </div>
            {add.error && (
              <div className="cv-notice is-bad" role="alert">
                <div className="cv-notice-body">{add.error}</div>
              </div>
            )}
          </div>
        )}

        {(actionError || loadError) && (
          <div className="cv-notice is-bad cn-error" role="alert">
            <div className="cv-notice-body">{actionError || loadError}</div>
          </div>
        )}

        {!loaded ? (
          <LoadingBlock compact text="Loading notes…" />
        ) : notes.length === 0 ? (
          <div className="cn-empty">
            <StickyNote size={18} aria-hidden="true" />
            <span>No notes yet. Log calls and follow-ups here.</span>
          </div>
        ) : (
          <ul className="cn-list">
            {notes.map((note) => (
              <li key={note.id} className={`cn-note${note.pinned ? " is-pinned" : ""}`}>
                <div className="cn-note-head">
                  <span className="cn-chip">{categoryLabel(note.category)}</span>
                  {note.pinned && (
                    <span className="cn-pinned-label">
                      <Pin size={11} aria-hidden="true" /> Pinned
                    </span>
                  )}
                  <span className="cn-note-meta" title={formatDateTime(note.created_at)}>
                    {note.author_name || "Staff"} · {formatRelative(note.created_at)}
                  </span>
                </div>
                <p className="cn-note-body">{note.body}</p>
                {!readOnly && (
                  <div className="cn-note-actions">
                    <button type="button" className="cn-action" disabled={busyId === note.id} onClick={() => act(note, () => api.updateCaseNote(cashlessCaseId, note.id, { pinned: !note.pinned }), "The pin was not saved.")}>
                      {note.pinned ? <PinOff size={13} aria-hidden="true" /> : <Pin size={13} aria-hidden="true" />}
                      {note.pinned ? "Unpin" : "Pin to case"}
                    </button>
                    {canChange(note) && (
                      <button type="button" className="cn-action is-danger" disabled={busyId === note.id} onClick={() => setDeleting(note)}>
                        <Trash2 size={13} aria-hidden="true" /> Delete
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      <ConfirmModal
        open={!!deleting}
        title="Delete this note?"
        subtitle="Deleted for everyone."
        confirmLabel="Delete note"
        danger
        busy={!!deleting && busyId === deleting.id}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const note = deleting;
          const ok = await act(note, () => api.deleteCaseNote(cashlessCaseId, note.id), "The note was not deleted.");
          if (ok) setDeleting(null);
        }}
      >
        {deleting && <p className="cn-note-body">{deleting.body}</p>}
      </ConfirmModal>
    </>
  );
}
