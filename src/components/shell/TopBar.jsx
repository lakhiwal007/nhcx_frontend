import { Link } from "react-router-dom";
import { Menu, Sun, Moon, Building2, Globe } from "lucide-react";
import Breadcrumbs from "./Breadcrumbs";
import TipsToggle from "../../help/TipsToggle";

export default function TopBar({ crumbs, pathname, onOpenMenu, facility, theme, onToggleTheme, pageActionsRef }) {
  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button type="button" className="mobile-menu-btn" onClick={onOpenMenu} aria-label="Open the menu">
          <Menu size={20} aria-hidden="true" />
        </button>
        <Breadcrumbs crumbs={crumbs} pathname={pathname} />
      </div>
      <div className="top-actions">
        <div className="page-actions" ref={pageActionsRef} />
        {!facility.hasProvider ? (
          <Link to="/settings" className="topbar-facility is-missing">
            <Building2 size={13} aria-hidden="true" />
            No facility chosen
          </Link>
        ) : (
          <Link to="/settings" title={facility.allMode ? "Viewing all facilities (read-only)" : `Working as ${facility.label}. Change it in Settings.`} className={`topbar-facility${facility.allMode ? " is-all" : ""}`}>
            {facility.allMode ? <Globe size={13} aria-hidden="true" /> : <Building2 size={13} aria-hidden="true" />}
            <span className="topbar-facility-name">{facility.label}</span>
          </Link>
        )}
        <TipsToggle />
        <button type="button" onClick={onToggleTheme} className="theme-toggle" title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>
          {theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
