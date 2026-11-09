import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { HOME, SCREEN_LABELS } from "../../shell/shellNav";

export default function Breadcrumbs({ crumbs, pathname }) {
  const atHome = pathname === HOME;
  return (
    <nav className="breadcrumb-modern" aria-label="Breadcrumb">
      {!atHome && (
        <Link to={HOME} className="breadcrumb-link">
          {SCREEN_LABELS["work-queue"]}
        </Link>
      )}
      {crumbs
        .filter((c) => !(atHome && c.to === HOME && crumbs.length > 1))
        .map((crumb, i, arr) => {
          const last = i === arr.length - 1;
          const first = i === 0 && atHome;
          return (
            <span key={`${crumb.to}-${i}`} className="crumb-step">
              {!first && <ChevronRight size={14} aria-hidden="true" />}
              {last ? (
                <span className="crumb-current" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link to={crumb.to} className="breadcrumb-link crumb-link">
                  {crumb.label}
                </Link>
              )}
            </span>
          );
        })}
    </nav>
  );
}
