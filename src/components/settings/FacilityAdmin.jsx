import { useEffect, useState } from "react";
import { ArrowLeft, Edit2, Key } from "lucide-react";
import { api, markHandled } from "../../api";
import { formatDate } from "../../lib/format.js";
import Practitioners from "./Practitioners";
import { certDaysLeft, facilityIssues, facilityStatus } from "./facilityHealth";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "Hospital details" },
  { id: "nhcx", label: "NHCX connection" },
  { id: "key", label: "Key and certificate" },
  { id: "doctors", label: "Doctors" },
];

function Facts({ rows }) {
  return (
    <dl className="st-glance">
      {rows.filter(Boolean).map(([label, value, bad]) => (
        <div key={label} className="st-glance-row">
          <dt>{label}</dt>
          <dd className={bad ? "is-bad" : undefined}>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function FacilityAdmin({ facility, canManage, isProduction, onEdit, onUploadKey, onRotate, onOnboard, onBack, viewingAsAdmin = false, switcher = null, appearance = null }) {
  const [tab, setTab] = useState("overview");
  const [doctors, setDoctors] = useState({ code: null, list: [] });
  const code = facility.facility_code;

  useEffect(() => {
    let live = true;
    api
      .listPractitioners(code)
      .then((res) => live && setDoctors({ code, list: res?.practitioners || [] }))
      .catch((err) => {
        markHandled(err);
        if (live) setDoctors({ code, list: [] });
      });
    return () => {
      live = false;
    };
  }, [code]);

  const missingHpr = doctors.code === code ? doctors.list.filter((d) => d.in_his !== false && !d.master?.hpr_id).length : 0;
  const issues = facilityIssues(facility, missingHpr);
  const status = facilityStatus(issues);
  const days = certDaysLeft(facility);
  const act = {
    onboard: isProduction && canManage ? { label: "Finish registration", run: () => onOnboard(facility) } : null,
    key: canManage ? { label: "Upload key", run: () => onUploadKey(facility) } : null,
    rotate: canManage ? { label: "Rotate certificate", run: () => onRotate(facility) } : null,
    doctors: { label: "Add HPR ids", run: () => setTab("doctors") },
  };
  const tile = (label, value, sub, tone) => (
    <div className={`st-tile is-${tone}`}>
      <span className="st-tile-key">{label}</span>
      <span className="st-tile-val">{value}</span>
      {sub && <span className="st-tile-sub">{sub}</span>}
    </div>
  );

  return (
    <div className="st-adm">
      <nav className="st-adm-nav" aria-label="Facility settings">
        {onBack && (
          <button type="button" className="st-adm-back" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden="true" /> All facilities
          </button>
        )}
        {switcher}
        <span className="st-adm-nav-title">{facility.name || code}</span>
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`st-adm-tab${tab === t.id ? " is-on" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "doctors" && missingHpr > 0 && <span className="st-adm-count">{missingHpr}</span>}
          </button>
        ))}
        {appearance && (
          <button type="button" className={`st-adm-tab${tab === "appearance" ? " is-on" : ""}`} onClick={() => setTab("appearance")}>
            Appearance
          </button>
        )}
      </nav>

      <div className="st-adm-main">
        {viewingAsAdmin && (
          <div className="cv-notice is-info">
            <div className="cv-notice-body">Viewing as admin. Facility settings can be changed. Cases stay view only.</div>
          </div>
        )}
        <section className="st-section st-adm-head">
          <span className="st-me-av is-square" aria-hidden="true">
            {initials(facility.name)}
          </span>
          <div className="st-me-who">
            <h2 className="st-section-title">{facility.name || code}</h2>
            <span className="st-section-meta">{[`Clinic ${code}`, facility.hcx_participant_code, facility.hfr_id && `HFR ${facility.hfr_id}`, facility.ownership, facility.scheme_code].filter(Boolean).join(" · ")}</span>
          </div>
          <span className={`cv-chip ${status.tone}`}>{status.label}</span>
          {canManage && (
            <button type="button" className="cv-btn" onClick={() => onEdit(facility)}>
              <Edit2 size={14} aria-hidden="true" /> Edit details
            </button>
          )}
        </section>

        {tab === "overview" && (
          <>
            <div className="st-tiles">
              {tile("NHCX registration", facility.abdm_registered ? "Registered" : "Not registered", facility.environment === "production" ? "Production" : "Sandbox", facility.abdm_registered ? "ok" : "bad")}
              {tile("Private key", facility.private_key_set ? "Uploaded" : "Missing", facility.private_key_set ? "Opens payer answers" : "Payer answers can't be read", facility.private_key_set ? "ok" : "bad")}
              {tile("Certificate", days == null ? "Unknown" : days < 0 ? "Ended" : `Ends in ${days} days`, facility.cert_expires_at ? formatDate(facility.cert_expires_at) : null, days == null ? "todo" : days < 0 ? "bad" : days <= 60 ? "warn" : "ok")}
              {tile("Doctors", missingHpr ? `${missingHpr} without HPR id` : "All have HPR ids", missingHpr ? "PMJAY refuses them" : null, missingHpr ? "warn" : "ok")}
            </div>
            <section className="st-section" aria-label="Needs you">
              <header className="st-section-head">
                <h2 className="st-section-title">Needs you</h2>
                <span className="st-section-meta">{issues.length ? `${issues.length} to fix` : "Nothing to fix"}</span>
              </header>
              {issues.length === 0 && <p className="st-pad st-quiet">This facility is ready for claims.</p>}
              {issues.map((issue) => {
                const action = act[issue.action];
                return (
                  <div key={issue.id} className="cv-row">
                    <span className={`cv-chip ${issue.tone === "bad" ? "is-bad" : "is-warn"}`}>{issue.tone === "bad" ? "Fix now" : "Soon"}</span>
                    <span className="cv-row-body">{issue.text}</span>
                    {action && (
                      <button type="button" className={`cv-btn${issue.tone === "bad" ? " is-primary" : ""}`} onClick={action.run}>
                        {action.label}
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
            <Practitioners key={`overview-doctors-${code}`} facility={facility} canEdit={canManage} />
          </>
        )}

        {tab === "details" && (
          <section className="st-section" aria-label="Hospital details">
            <header className="st-section-head">
              <h2 className="st-section-title">Hospital details</h2>
            </header>
            <Facts
              rows={[
                ["Name", facility.name],
                ["Clinic code", code],
                ["Hospital type", facility.ownership],
                ["Scheme", facility.scheme_code],
                ["State", facility.state],
                ["District", facility.district],
                ["Email", facility.primary_email],
                ["Mobile", facility.primary_mobile],
              ]}
            />
          </section>
        )}

        {tab === "nhcx" && (
          <section className="st-section" aria-label="NHCX connection">
            <header className="st-section-head">
              <h2 className="st-section-title">NHCX connection</h2>
              {isProduction && canManage && !facility.abdm_registered && (
                <span className="st-section-tools">
                  <button type="button" className="cv-btn is-primary" onClick={() => onOnboard(facility)}>
                    Finish registration
                  </button>
                </span>
              )}
            </header>
            <Facts
              rows={[
                ["Status", facility.abdm_registered ? "Registered" : "Not registered", !facility.abdm_registered],
                ["Environment", facility.environment === "production" ? "Production" : "Sandbox"],
                ["Participant code", facility.hcx_participant_code],
                ["HFR id", facility.hfr_id],
                ["Registry id", facility.registry_id],
                ["Callback URL", facility.endpoint_url],
              ]}
            />
          </section>
        )}

        {tab === "key" && (
          <section className="st-section" aria-label="Key and certificate">
            <header className="st-section-head">
              <h2 className="st-section-title">Key and certificate</h2>
              {canManage && (
                <span className="st-section-tools">
                  {facility.private_key_set ? (
                    <button type="button" className="cv-btn" onClick={() => onRotate(facility)}>
                      <Key size={14} aria-hidden="true" /> Rotate certificate
                    </button>
                  ) : (
                    <button type="button" className="cv-btn is-primary" onClick={() => onUploadKey(facility)}>
                      <Key size={14} aria-hidden="true" /> Upload key
                    </button>
                  )}
                </span>
              )}
            </header>
            <Facts
              rows={[
                ["Private key", facility.private_key_set ? "Uploaded. Never shown again." : "Missing", !facility.private_key_set],
                ["Certificate ends", facility.cert_expires_at ? `${formatDate(facility.cert_expires_at)}${days != null ? ` (${days < 0 ? "ended" : `${days} days`})` : ""}` : "Unknown", days != null && days < 0],
              ]}
            />
          </section>
        )}

        {tab === "doctors" && <Practitioners key={`doctors-${code}`} facility={facility} canEdit={canManage} />}

        {tab === "appearance" && appearance}
      </div>
    </div>
  );
}
