import { useState, useEffect, useRef } from "react";

/**
 * Styled replacement for a native <select>, whose popup can't be themed.
 * Click toggles, click outside or Esc closes, ↑/↓ move the highlight and
 * Enter picks. `compact` gives the 36px toolbar size.
 */
export default function Dropdown({ value, options = [], onChange, compact = false, placeholder = "Select…", ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const rootRef = useRef(null);

  const selIdx = options.findIndex((o) => String(o.value) === String(value));
  const label = selIdx >= 0 ? options[selIdx].label : placeholder;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (v) => {
    setOpen(false);
    onChange?.(v);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setHi((h) => Math.max(0, Math.min(options.length - 1, (h < 0 ? selIdx : h) + step)));
      return;
    }
    if (e.key === "Enter" && open && hi >= 0) {
      e.preventDefault();
      pick(options[hi].value);
    }
  };

  return (
    <div ref={rootRef} className="dd-root">
      <button
        type="button"
        className={`input-modern dd-trigger${compact ? " dd-compact" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setOpen((o) => !o);
          setHi(selIdx);
        }}
        onKeyDown={onKeyDown}
      >
        <span className="dd-label">{label}</span>
        <span className="dd-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" className="dd-menu">
          {options.map((o, i) => {
            const sel = i === selIdx;
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={sel}
                className={`dd-option${sel ? " is-selected" : ""}${!sel && i === hi ? " is-highlighted" : ""}`}
                onClick={() => pick(o.value)}
                onMouseEnter={() => setHi(i)}
              >
                <span>{o.label}</span>
                <span className="dd-check">{sel ? "✓" : ""}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
