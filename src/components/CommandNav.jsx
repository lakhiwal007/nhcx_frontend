import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronDown, Settings, SlidersHorizontal, Moon, Sun } from "lucide-react";
import TipsToggle from "../help/TipsToggle";

const GAP = 4;

function Badge({ badge, tone, urgent }) {
  if (!(badge > 0)) return null;
  return (
    <span className="command-nav-badge" style={{ background: tone === "info" ? "var(--info)" : urgent ? "var(--error)" : "var(--warning)" }}>
      {badge > 99 ? "99+" : badge}
    </span>
  );
}

function Pill({ item, urgent, reduceMotion }) {
  const { to, icon: Icon, label, badge, badgeTone } = item;
  return (
    <NavLink to={to} title={label} className={({ isActive }) => `command-nav-pill${isActive ? " active" : ""}`}>
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              className="command-nav-active"
              layoutId={reduceMotion ? undefined : "command-active-pill"}
              transition={{ type: "spring", stiffness: 500, damping: 42 }}
            />
          )}
          <Icon size={16} />
          <span className="command-nav-label">{label}</span>
          <Badge badge={badge} tone={badgeTone} urgent={urgent} />
        </>
      )}
    </NavLink>
  );
}

function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, ref]);
}

export default function CommandNav({ items, urgent, reduceMotion }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef(null);
  const measureRef = useRef(null);
  const moreRef = useRef(null);
  const [fit, setFit] = useState(items.length);
  const [open, setOpen] = useState(false);
  useDismiss(open, setOpen, moreRef);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure) return;
    const compute = () => {
      const widths = [...measure.children].map((el) => el.getBoundingClientRect().width);
      const pills = widths.slice(0, items.length);
      const [settingsW = 34, moreW = 90] = widths.slice(items.length);
      const room = nav.clientWidth - settingsW - GAP;
      const total = pills.reduce((s, w) => s + w + GAP, 0);
      if (total <= room) {
        setFit(items.length);
        return;
      }
      let used = moreW + GAP;
      let n = 0;
      while (n < pills.length && used + pills[n] + GAP <= room) {
        used += pills[n] + GAP;
        n += 1;
      }
      setFit(Math.max(1, n));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [items]);

  const isActive = (to) => location.pathname === to || location.pathname.startsWith(`${to}/`) || (to === "/dashboard" && location.pathname.startsWith("/case/"));
  let visible = items.slice(0, fit);
  let overflow = items.slice(fit);
  const activeHidden = overflow.find((i) => isActive(i.to));
  if (activeHidden && visible.length > 0) {
    const bumped = visible[visible.length - 1];
    visible = [...visible.slice(0, -1), activeHidden];
    overflow = [bumped, ...overflow.filter((i) => i !== activeHidden)];
  }
  const overflowBadge = overflow.reduce((sum, i) => sum + (i.badge > 0 ? i.badge : 0), 0);

  return (
    <nav className="command-nav" ref={navRef} aria-label="Main">
      <div className="command-nav-measure" ref={measureRef} aria-hidden="true">
        {items.map(({ to, icon: Icon, label, badge }) => (
          <span key={to} className="command-nav-pill">
            <Icon size={16} />
            <span className="command-nav-label">{label}</span>
            {badge > 0 && <span className="command-nav-badge">{badge > 99 ? "99+" : badge}</span>}
          </span>
        ))}
        <span className="command-nav-pill command-nav-pill--icon">
          <Settings size={16} />
        </span>
        <span className="command-nav-pill">
          More
          <span className="command-nav-badge">9</span>
          <ChevronDown size={14} />
        </span>
      </div>

      {visible.map((item) => (
        <Pill key={item.to} item={item} urgent={urgent} reduceMotion={reduceMotion} />
      ))}

      {overflow.length > 0 && (
        <div className="command-more" ref={moreRef}>
          <button type="button" className={`command-nav-pill${open ? " is-open" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            More
            {overflowBadge > 0 && <span className="command-nav-badge" style={{ background: "var(--info)" }}>{overflowBadge > 99 ? "99+" : overflowBadge}</span>}
            <ChevronDown size={14} />
          </button>
          {open && (
            <div className="command-menu" role="menu">
              {overflow.map(({ to, icon: Icon, label, badge, badgeTone }) => (
                <button key={to} type="button" role="menuitem" className={`command-menu-item${isActive(to) ? " is-active" : ""}`} onClick={() => { setOpen(false); navigate(to); }}>
                  <Icon size={16} />
                  <span>{label}</span>
                  <Badge badge={badge} tone={badgeTone} urgent={urgent} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <NavLink to="/settings" title="Settings" className={({ isActive: on }) => `command-nav-pill command-nav-pill--icon${on ? " active" : ""}`}>
        {({ isActive: on }) => (
          <>
            {on && (
              <motion.span
                className="command-nav-active"
                layoutId={reduceMotion ? undefined : "command-active-pill"}
                transition={{ type: "spring", stiffness: 500, damping: 42 }}
              />
            )}
            <Settings size={16} />
          </>
        )}
      </NavLink>
    </nav>
  );
}

export function DisplayMenu({ theme, onToggleTheme }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  useDismiss(open, setOpen, ref);
  return (
    <div className="command-more" ref={ref}>
      <button type="button" className="command-icon-btn" title="Display" aria-label="Display settings" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <SlidersHorizontal size={18} />
      </button>
      {open && (
        <div className="command-menu is-right" role="menu">
          <div className="command-menu-row">
            <span>Explanations on each screen</span>
            <TipsToggle />
          </div>
          <button type="button" role="menuitem" className="command-menu-item" onClick={onToggleTheme}>
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
