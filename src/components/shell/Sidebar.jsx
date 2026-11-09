import { NavLink, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck, X, Building2, Globe, ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SETTINGS_ITEM } from "../../shell/shellNav";

export default function Sidebar({ items, collapsed, onToggleCollapse, mobileOpen, onCloseMobile, facility, urgent, reduceMotion }) {
  const groups = [
    { label: "Claims", items: items.filter((i) => i.to !== "/registry") },
    { label: "Records", items: items.filter((i) => i.to === "/registry") },
  ];
  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-show" : ""}`} aria-label="Main navigation">
      <div className="sidebar-brand">
        <div className="brand-logo">
          <ShieldCheck color="white" size={18} aria-hidden="true" />
        </div>
        <div className="brand-text">
          <span className="brand-name">NHCX Service</span>
          <span className="brand-sub">Cashless claims</span>
        </div>
        <button type="button" className="mobile-close-btn" onClick={onCloseMobile} aria-label="Close menu">
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      {facility.hasProvider && (
        <Link to="/settings" onClick={onCloseMobile} title={facility.allMode ? "Viewing all facilities (read-only)" : `Working as ${facility.label}. Change it in Settings.`} className={`sidebar-facility${facility.allMode ? " is-all" : ""}`}>
          <span className="sidebar-facility-icon">{facility.allMode ? <Globe size={15} aria-hidden="true" /> : <Building2 size={15} aria-hidden="true" />}</span>
          <span className="sidebar-facility-text">
            <span className="sidebar-facility-label">{facility.allMode ? "Viewing" : "Facility"}</span>
            <span className="sidebar-facility-name">{facility.label}</span>
          </span>
          <ChevronsUpDown size={14} className="sidebar-facility-chevron" aria-hidden="true" />
        </Link>
      )}

      <nav className="sidebar-nav">
        {groups.map((group) => (
          <div key={group.label} className="sidebar-nav-group">
            <div className="sidebar-nav-label">{group.label}</div>
            {group.items.map(({ to, icon: Icon, label, badgeLabel, badgeTone }) => (
              <NavLink key={to} to={to} title={label} onClick={onCloseMobile} className={({ isActive }) => (isActive ? "active" : "")}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span className="nav-active-pill" layoutId={reduceMotion ? undefined : "sidebar-active-pill"} transition={{ type: "spring", stiffness: 500, damping: 42 }} />}
                    <Icon className="nav-icon" size={18} strokeWidth={1.9} aria-hidden="true" />
                    <span className="nav-label">{label}</span>
                    {badgeLabel && <span className={`nav-badge nav-badge--${badgeTone === "info" ? "info" : urgent ? "urgent" : "warning"}`}>{badgeLabel}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <NavLink to={SETTINGS_ITEM.to} title={SETTINGS_ITEM.label} onClick={onCloseMobile} className={({ isActive }) => `sidebar-footer-link${isActive ? " active" : ""}`}>
          <SETTINGS_ITEM.icon className="nav-icon" size={18} strokeWidth={1.9} aria-hidden="true" />
          <span className="nav-label">{SETTINGS_ITEM.label}</span>
        </NavLink>
        <button type="button" className="sidebar-footer-link sidebar-collapse-btn" onClick={onToggleCollapse} title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}>
          {collapsed ? <PanelLeftOpen className="nav-icon" size={18} strokeWidth={1.9} aria-hidden="true" /> : <PanelLeftClose className="nav-icon" size={18} strokeWidth={1.9} aria-hidden="true" />}
          <span className="nav-label">Collapse</span>
        </button>
      </div>
    </aside>
  );
}
