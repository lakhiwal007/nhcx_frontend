import { useEffect, useRef } from "react";
import { MoreHorizontal } from "lucide-react";

export default function RowMenu({ items, label = "More actions", disabled = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const close = () => {
      el.open = false;
    };
    const onDown = (e) => {
      if (el.open && !el.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === "Escape" && el.open) close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const live = (items || []).filter(Boolean);
  if (!live.length) return <span className="cc-menu-slot" aria-hidden="true" />;
  return (
    <details
      className="cc-menu"
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && ref.current) ref.current.open = false;
        e.stopPropagation();
      }}
    >
      <summary className="cc-menu-trigger" aria-label={label} aria-disabled={disabled || undefined}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </summary>
      <div className="cc-menu-list" role="menu">
        {live.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="cc-menu-item"
            disabled={disabled || item.disabled}
            onClick={() => {
              if (ref.current) ref.current.open = false;
              item.onClick?.();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
