import { Link } from "react-router-dom";
import { Building2, Globe } from "lucide-react";
import BrandMark from "./BrandMark";
import CommandNav, { DisplayMenu } from "../CommandNav";
import Breadcrumbs from "./Breadcrumbs";
import { HOME } from "../../shell/shellNav";

export default function CommandBar({ items, urgent, reduceMotion, facility, theme, onToggleTheme, crumbs, pathname, showCrumbs, pageActionsRef }) {
  return (
    <>
      <header className="command-bar">
        <div className="command-bar-left">
          <Link to={HOME} className="command-brand" aria-label="NHCX Service home">
            <span className="command-brand-logo is-mark">
              <BrandMark size={24} />
            </span>
            <span className="command-brand-name">NHCX Service</span>
          </Link>
          <CommandNav items={items} urgent={urgent} reduceMotion={reduceMotion} />
        </div>
        <div className="command-bar-right">
          <Link to="/settings" className={`command-facility-btn${facility.allMode ? " is-all" : ""}${!facility.hasProvider ? " is-missing" : ""}`} title={!facility.hasProvider ? "No facility chosen. Choose one in Settings." : facility.allMode ? "Viewing all facilities (read-only). Choose one in Settings." : `Working as ${facility.label}. Change it in Settings.`}>
            {facility.allMode ? <Globe size={13} aria-hidden="true" /> : <Building2 size={13} aria-hidden="true" />}
            <span className="command-facility-label">{facility.hasProvider ? facility.label : "No facility"}</span>
          </Link>
          <DisplayMenu theme={theme} onToggleTheme={onToggleTheme} />
        </div>
      </header>
      {showCrumbs && (
        <div className="breadcrumb-strip">
          <Breadcrumbs crumbs={crumbs} pathname={pathname} />
          <div className="page-actions" ref={pageActionsRef} />
        </div>
      )}
    </>
  );
}
