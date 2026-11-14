import ConfirmModal from "../../ui/ConfirmModal";

export default function SendGateModal({
  gate,
  title = "Send without these?",
  subtitle = "Only the plan lists them, so the send is allowed, but the payer may query or refuse.",
  sendLabel = "Send anyway",
  busy = false,
  children,
}) {
  return (
    <ConfirmModal
      open={gate.open}
      title={title}
      subtitle={subtitle}
      confirmLabel={sendLabel}
      cancelLabel="Go back"
      busy={gate.saving || busy}
      disabled={!gate.reason.trim()}
      error={gate.error}
      onCancel={gate.cancel}
      onConfirm={gate.proceed}
    >
      <ul className="cv-gate-list">
        {gate.waived.map((ask) => (
          <li key={`${ask.kind || "item"}-${ask.code || ask.form_url || ask.display}`}>{ask.display || ask.name || ask.code}</li>
        ))}
      </ul>
      {children}
      <label className="cv-gate-reason">
        <span className="cv-card-meta">Reason (kept as a case note)</span>
        <textarea className="cv-ctl cv-textarea" value={gate.reason} onChange={(e) => gate.setReason(e.target.value)} />
      </label>
    </ConfirmModal>
  );
}
