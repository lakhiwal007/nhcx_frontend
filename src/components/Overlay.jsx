import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

// Shared overlay shells: a right-hand Drawer and a centred Modal. Both close
// on Escape, on a backdrop click and on the X button, and expose themselves
// to assistive tech as a labelled modal dialog. Styles: `.ov-*` in App.css.

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function Header({ title, subtitle, extra, onClose }) {
  return (
    <div className="ov-head">
      <div className="ov-head-text">
        <h3 className="ov-title">
          {title}
          {extra}
        </h3>
        {subtitle && <p className="ov-subtitle">{subtitle}</p>}
      </div>
      <button type="button" className="ov-close" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, titleExtra, footer, width = 560, stack = false, children }) {
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="glass-overlay ov-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="glass-panel ov-drawer"
            style={{ width: `min(${width}px, 95vw)` }}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <Header title={title} subtitle={subtitle} extra={titleExtra} onClose={onClose} />
            <div className={`ov-body${stack ? " ov-body-stack" : ""}`}>{children}</div>
            {footer && <div className="ov-footer">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Modal({ open, onClose, title, subtitle, width = 520, children }) {
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className="ov-modal-wrap">
          <motion.div
            className="glass-overlay ov-backdrop-abs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="glass-panel ov-modal"
            style={{ maxWidth: `${width}px` }}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
          >
            <Header title={title} subtitle={subtitle} onClose={onClose} />
            <div className="ov-modal-body">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
