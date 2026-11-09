import { Modal } from "./Overlay";

export default function ConfirmModal({
  open,
  title,
  subtitle,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  disabled = false,
  error,
  onCancel,
  onConfirm,
  width = 520,
  children,
}) {
  return (
    <Modal open={open} onClose={busy ? undefined : onCancel} title={title} subtitle={subtitle} width={width}>
      {children && <div className="confirm-body">{children}</div>}
      {error && (
        <div className="cv-notice is-bad confirm-error" role="alert">
          <div className="cv-notice-body">{error}</div>
        </div>
      )}
      <div className="confirm-actions">
        <button type="button" className="cv-btn" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`cv-btn ${danger ? "is-danger-fill" : "is-primary"}`}
          onClick={onConfirm}
          disabled={busy || disabled}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
