import { useState, useEffect } from "react";
import { Pin, PinOff, Trash2, StickyNote } from "lucide-react";
import { api } from "../../api";
import { useReadOnly, READ_ONLY_TITLE } from "../../readOnly";
import { Drawer } from "../Overlay";
import { Button, LoadingBlock } from "../Common";
import Dropdown from "../Dropdown";
import { formatDateTime, formatRelative } from "../../format.js";

const NOTE_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "payer_call", label: "Payer call" },
  { value: "follow_up", label: "Follow-up" },
  { value: "billing", label: "Billing" },
  { value: "clinical", label: "Clinical" },
];

const MAX_LENGTH = 2000;
const categoryLabel = (v) => NOTE_CATEGORIES.find((c) => c.value === v)?.label || v;

export function PinnedNoteStrip({ notes, onOpen }) {
  const pinned = notes.filter((n) => n.pinned);
  if (pinned.length === 0) return null;
  const latest = pinned[0];
  return (
    <button type="button" className="cx-pinned-note" onClick={onOpen}>
      <Pin size={13} aria-hidden="true" />
      <span className="cx-pinned-note-body">
        <strong>{categoryLabel(latest.category)}:</strong> {latest.body}
      </span>
      <span className="cx-pinned-note-meta">
        {latest.author_name || "Staff"} · {formatRelative(latest.created_at)}
        {pinned.length > 1 ? ` · +${pinned.length - 1} pinned` : ""}
      </span>
    </button>
  );
}

export default function CaseNotesDrawer({ open, onClose, cashlessCaseId, notes, loaded, loadError, onChanged }) {
  const readOnly = useReadOnly();
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    if (!open || userId !== null) return;
    api.getSession().then((s) => setUserId(s?.user?.id ?? "")).catch(() => setUserId(""));
  }, [open, userId]);

  const canChange = (note) => !note.author_id || String(note.author_id) === String(userId);

  const add = async () => {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      await api.createCaseNote(cashlessCaseId, { body: text, category });
      setBody("");
      setCategory("general");
      await onChanged();
    } catch (err) {
      setActionError(err.message || "The note was not saved.");
    } finally {
      setSaving(false);
    }
  };

  const act = async (note, fn) => {
    setBusyId(note.id);
    setActionError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setActionError(err.message || "That change was not saved.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Internal notes"
      subtitle="Visible to your hospital team only. Never sent to the payer."
      width={520}
    >
      <div className="cn-compose">
        <label className="cn-label" htmlFor="case-note-body">Add a note</label>
        <textarea
          id="case-note-body"
          className="input-modern rp-textarea"
          placeholder="e.g. Called the TPA at 3pm, they will release the approval after the CBC report"
          value={body}
          maxLength={MAX_LENGTH}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add();
          }}
        />
        <div className="cn-compose-row">
          <Dropdown compact ariaLabel="Note category" value={category} options={NOTE_CATEGORIES} onChange={setCategory} />
          <span className="cn-count ep-muted">{body.length}/{MAX_LENGTH}</span>
          <Button write size="small" onClick={add} disabled={!body.trim() || saving}>
            {saving ? "Saving…" : "Add note"}
          </Button>
        </div>
      </div>

      {(actionError || loadError) && <div className="ep-notice is-bad cn-error">{actionError || loadError}</div>}

      {!loaded ? (
        <LoadingBlock compact text="Loading notes…" />
      ) : notes.length === 0 ? (
        <div className="cn-empty">
          <StickyNote size={18} aria-hidden="true" />
          <span>No notes yet. Record payer calls, promised documents and follow-ups here so the next person on the desk knows where the case stands.</span>
        </div>
      ) : (
        <ul className="cn-list">
          {notes.map((note) => (
            <li key={note.id} className={`cn-note${note.pinned ? " is-pinned" : ""}`}>
              <div className="cn-note-head">
                <span className="cn-chip">{categoryLabel(note.category)}</span>
                {note.pinned && <span className="cn-pinned-label"><Pin size={11} aria-hidden="true" /> Pinned</span>}
                <span className="cn-note-meta" title={formatDateTime(note.created_at)}>
                  {note.author_name || "Staff"} · {formatRelative(note.created_at)}
                </span>
              </div>
              <p className="cn-note-body">{note.body}</p>
              <div className="cn-note-actions">
                <button
                  type="button"
                  className="cn-action"
                  disabled={busyId === note.id || readOnly}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  onClick={() => act(note, () => api.updateCaseNote(cashlessCaseId, note.id, { pinned: !note.pinned }))}
                >
                  {note.pinned ? <PinOff size={13} aria-hidden="true" /> : <Pin size={13} aria-hidden="true" />}
                  {note.pinned ? "Unpin" : "Pin to case"}
                </button>
                {canChange(note) && !readOnly && (
                  <button
                    type="button"
                    className="cn-action is-danger"
                    disabled={busyId === note.id}
                    onClick={() =>
                      confirmId === note.id
                        ? act(note, () => api.deleteCaseNote(cashlessCaseId, note.id))
                        : setConfirmId(note.id)}
                    onBlur={() => setConfirmId((c) => (c === note.id ? null : c))}
                  >
                    <Trash2 size={13} aria-hidden="true" /> {confirmId === note.id ? "Click again to delete" : "Delete"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
