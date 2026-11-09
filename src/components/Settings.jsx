import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Building2, Plus, Key, Edit2, RefreshCw, Sun, Moon, PanelLeft, PanelTop, SearchX, Stethoscope, ArrowRight } from "lucide-react";
import { api, markHandled, ALL_FACILITIES_MODE_KEY } from "../api";
import { getDeepLinkClinicId } from "../sessionBootstrap";
import { useSend } from "../hooks/useSend";
import { Button, EmptyState, LoadingBlock } from "./Common";
import { Drawer } from "./Overlay";
import PageActions from "./PageActions";
import { ReadOnlyContext } from "../readOnly";
import FacilityForm from "./settings/FacilityForm";
import { EMPTY_FORM, formFromFacility, validateFacility, facilityPayload } from "./settings/facilityForm";
import { KeyUploadDrawer, CertificateRotationDrawer } from "./settings/KeyDrawers";
import OnboardingWizard from "./settings/OnboardingWizard";
import Practitioners from "./settings/Practitioners";

function Section({ id, title, meta, tools, children }) {
  return (
    <section className="st-section" id={id} aria-label={title}>
      <header className="st-section-head">
        <h2 className="st-section-title">{title}</h2>
        {meta && <span className="st-section-meta">{meta}</span>}
        {tools && <span className="st-section-tools">{tools}</span>}
      </header>
      {children}
    </section>
  );
}

function Segmented({ value, options, onPick }) {
  return (
    <div className="st-seg" role="radiogroup">
      {options.map(({ value: v, label, icon: Icon, title }) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} title={title} onClick={() => value !== v && onPick()}>
          <Icon size={14} aria-hidden="true" /> {label}
        </button>
      ))}
    </div>
  );
}

const keyWord = (f) => (f.private_key_set ? "Uploaded" : "Missing");
const abdmWord = (f) => (f.abdm_registration?.success === undefined ? "—" : f.abdm_registration.success ? "Registered" : "Sync failed");

export default function Settings({ readOnly = false, manageableFacilityCodes = [], managesAnyFacility = false, nhcxEnvironment = "sandbox", sessionFacilities = null, sessionUserId = null, onSessionRefresh, allFacilitiesMode = false, theme = "light", onToggleTheme, layoutDirection = "B", onToggleLayoutDirection }) {
  const navigate = useNavigate();
  const location = useLocation();
  const cameFrom = location.state?.from && location.state.from !== "/settings" ? location.state.from : null;
  const isProduction = nhcxEnvironment === "production";

  const [list, setList] = useState({ key: -1, facilities: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [facilityDrawer, setFacilityDrawer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [onboarding, setOnboarding] = useState(null);
  const [keyUpload, setKeyUpload] = useState(null);
  const [rotate, setRotate] = useState(null);
  const [doctorsFor, setDoctorsFor] = useState(null);
  const [opening, setOpening] = useState(null);
  const [openError, setOpenError] = useState(null);
  const [activeCode, setActiveCode] = useState(() => localStorage.getItem("nhcx_default_provider_id") || "");

  const needsFallbackPicker = Array.isArray(sessionFacilities) && sessionFacilities.length === 0 && !sessionUserId;
  const canManage = (code) => managesAnyFacility || manageableFacilityCodes.includes(String(code));
  const showManagement = readOnly || managesAnyFacility || manageableFacilityCodes.length > 0;

  useEffect(() => {
    if (!showManagement && !needsFallbackPicker) return undefined;
    let live = true;
    api
      .listFacilities()
      .then((res) => live && setList({ key: reloadKey, facilities: res?.facilities || [], error: null }))
      .catch((err) => {
        markHandled(err);
        if (live) setList((prev) => ({ ...prev, key: reloadKey, error: err?.message || "The facilities could not be loaded." }));
      });
    return () => {
      live = false;
    };
  }, [reloadKey, showManagement, needsFallbackPicker]);

  const loading = (showManagement || needsFallbackPicker) && list.key !== reloadKey;
  const facilities = list.facilities || [];
  const reload = () => setReloadKey((k) => k + 1);
  const afterChange = async () => {
    reload();
    await onSessionRefresh?.();
  };

  const registeredCodes = new Set([...(sessionFacilities || []), ...facilities].map((f) => String(f.facility_code)));
  const unregisteredCodes = manageableFacilityCodes.filter((code) => !registeredCodes.has(code));
  const canRegister = !readOnly && (managesAnyFacility || unregisteredCodes.length > 0);
  const registerPrefill = () => {
    const clinicId = getDeepLinkClinicId();
    return { facility_code: (clinicId && canManage(clinicId) ? String(clinicId) : unregisteredCodes[0]) || "" };
  };

  const openCreate = () => {
    const prefill = registerPrefill();
    if (isProduction) {
      setOnboarding({ step: 0, facility: prefill });
      return;
    }
    setForm({ ...EMPTY_FORM, ...prefill });
    setErrors({});
    setFacilityDrawer({ mode: "create" });
  };
  const openEdit = (facility) => {
    setForm(formFromFacility(facility));
    setErrors({});
    setFacilityDrawer({ mode: "edit", facility });
  };
  const openEditByCode = async (code) => {
    setOpening(code);
    setOpenError(null);
    try {
      openEdit(await api.getFacility(code));
    } catch (err) {
      markHandled(err);
      setOpenError(err?.message || "The facility could not be opened.");
    } finally {
      setOpening(null);
    }
  };

  const isEdit = facilityDrawer?.mode === "edit";
  const save = useSend(
    async () => {
      const found = validateFacility(form, isEdit);
      setErrors(found);
      if (Object.keys(found).length) return undefined;
      const payload = facilityPayload(form);
      const res = isEdit ? await api.updateFacility(form.facility_code, payload) : await api.createFacility(payload);
      setFacilityDrawer(null);
      await afterChange();
      return res;
    },
    { success: isEdit ? "Facility saved" : "Facility registered" },
  );
  const errorCount = Object.keys(errors).length;

  const pickFacility = (facility) => {
    localStorage.setItem("nhcx_default_provider_id", facility.hcx_participant_code);
    localStorage.setItem("nhcx_default_facility_name", facility.name || "");
    localStorage.removeItem(ALL_FACILITIES_MODE_KEY);
    window.dispatchEvent(new CustomEvent("provider-changed"));
    setActiveCode(facility.hcx_participant_code);
  };

  const hasSessionFacilities = sessionFacilities?.length > 0;
  const pickerFacilities = hasSessionFacilities ? sessionFacilities : needsFallbackPicker ? facilities : [];
  const isActive = (f) => !allFacilitiesMode && activeCode === f.hcx_participant_code;
  const activeFacility = readOnly ? null : pickerFacilities.find(isActive) || null;
  const firstRun = !readOnly && sessionFacilities && !activeFacility;

  const q = search.trim().toLowerCase();
  const filtered = q ? facilities.filter((f) => [f.name, f.facility_code, f.hcx_participant_code, f.state, f.district, f.registry_id, f.environment].filter(Boolean).some((v) => v.toLowerCase().includes(q))) : facilities;

  return (
    <div className="st-screen">
      <PageActions>
        {(showManagement || needsFallbackPicker) && (
          <Button variant="outline" size="small" icon={RefreshCw} disabled={loading} onClick={reload} title="Reload the facilities">
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        )}
        {canRegister && (
          <Button variant="primary" size="small" icon={Plus} onClick={openCreate}>
            Register facility
          </Button>
        )}
      </PageActions>

      {readOnly && (
        <div className="cv-notice is-info">
          <div className="cv-notice-body">{managesAnyFacility ? "This account sees every facility and can manage their settings. Cases and payer replies are view-only." : "This account sees every facility at once and changes nothing: no case, payer reply or facility can be edited from it."}</div>
        </div>
      )}

      {sessionFacilities && !readOnly && (
        <Section id="st-active" title={firstRun ? "Choose the facility you work at" : "Active facility"} meta={!firstRun && activeFacility ? `Working as ${activeFacility.name || activeFacility.facility_code}` : null}>
          {firstRun && (
            <div className="st-pad">
              <div className="cv-notice is-info">
                <div className="cv-notice-body">
                  {pickerFacilities.length === 0 ? "No cashless-enabled facility is linked to this account yet." : "Every case, task and message is scoped to one facility. Pick yours to start; you can change it here later."}
                  {cameFrom && pickerFacilities.length > 0 ? ` You will go back to ${cameFrom.startsWith("/case/") ? "the case" : "where you were"} after choosing.` : ""}
                </div>
              </div>
            </div>
          )}
          {pickerFacilities.length === 0 ? (
            <div className="st-pad st-stack">
              <div className="cv-notice is-warn">
                <div className="cv-notice-body">{canRegister ? "No cashless-enabled facility is linked to your account. As its clinic admin, register it with the button above." : "No cashless-enabled facility is linked to your account. Ask your clinic admin to register it."}</div>
              </div>
            </div>
          ) : (
            <>
              {!hasSessionFacilities && (
                <div className="st-pad">
                  <div className="cv-notice is-warn">
                    <div className="cv-notice-body">No facility is linked to your session. Pick one to continue.</div>
                  </div>
                </div>
              )}
              <div className="wq-table-scroll">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th className="st-col-pick">
                        <span className="sr-only">Active</span>
                      </th>
                      <th>Facility</th>
                      <th>Participant code</th>
                      <th className="st-col-actions">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickerFacilities.map((f) => {
                      const on = isActive(f);
                      return (
                        <tr key={f.facility_code} className={`st-pick-row${on ? " is-on" : ""}`} onClick={() => pickFacility(f)}>
                          <td className="st-col-pick">
                            <input type="radio" name="st-active-facility" checked={on} onChange={() => pickFacility(f)} aria-label={`Work as ${f.name || f.facility_code}`} />
                          </td>
                          <td>
                            <span className="st-strong">{f.name || f.facility_code}</span>
                            <span className="st-sub">{f.facility_code}</span>
                          </td>
                          <td className="cv-mono">{f.hcx_participant_code || "—"}</td>
                          <td className="st-col-actions" onClick={(e) => e.stopPropagation()}>
                            {hasSessionFacilities && canManage(f.facility_code) && (
                              <div className="st-row-actions">
                                <button type="button" className="cv-link" disabled={opening === f.facility_code} onClick={() => openEditByCode(f.facility_code)}>
                                  <Edit2 size={13} aria-hidden="true" /> {opening === f.facility_code ? "Opening…" : "Edit"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {firstRun && activeCode && cameFrom && (
                <div className="st-pad">
                  <Button variant="primary" icon={ArrowRight} onClick={() => navigate(cameFrom)}>
                    Continue
                  </Button>
                </div>
              )}
              {!firstRun && cameFrom && (
                <div className="st-pad">
                  <Button variant="primary" icon={ArrowRight} onClick={() => navigate(cameFrom)}>
                    Continue to {cameFrom.startsWith("/case/") ? "the case" : "where you were"}
                  </Button>
                </div>
              )}
            </>
          )}
          {openError && (
            <div className="st-pad">
              <div className="cv-notice is-bad" role="alert">
                <div className="cv-notice-body">{openError}</div>
              </div>
            </div>
          )}
        </Section>
      )}

      {activeFacility && <Practitioners key={activeFacility.facility_code} facility={activeFacility} canEdit={hasSessionFacilities && canManage(activeFacility.facility_code)} />}

      {showManagement && (
        <Section
          id="st-facilities"
          title="Facility management"
          meta={facilities.length > 0 ? (q ? `${filtered.length} of ${facilities.length}` : `${facilities.length} registered`) : null}
          tools={facilities.length > 3 && <input className="cv-ctl st-search" placeholder="Search name, code or participant…" aria-label="Search facilities" value={search} onChange={(e) => setSearch(e.target.value)} />}
        >
          {list.error && (
            <div className="st-pad">
              <div className="cv-notice is-warn" role="alert">
                <div className="cv-notice-body">The facilities could not be loaded{list.facilities ? ", so the list may be out of date" : ""}: {list.error}</div>
              </div>
            </div>
          )}
          {loading && !list.facilities ? (
            <LoadingBlock compact text="Loading the facilities…" />
          ) : facilities.length === 0 ? (
            <EmptyState icon={Building2} iconSize={44} iconOpacity={0.25} title="No facilities registered" description="Register the hospital's facility to enable eligibility, pre-auth and claims.">
              {canRegister && (
                <Button variant="primary" size="small" icon={Plus} onClick={openCreate}>
                  Register facility
                </Button>
              )}
            </EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState icon={SearchX} iconSize={44} iconOpacity={0.25} title="No matching facilities" description={`Nothing matches "${search.trim()}".`}>
              <Button variant="outline" size="small" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </EmptyState>
          ) : (
            <div className="wq-table-scroll">
              <table className="st-table st-admin-table">
                <thead>
                  <tr>
                    <th>Facility</th>
                    <th>Participant · HFR</th>
                    <th>Scheme · environment</th>
                    <th>Region</th>
                    <th>Contact</th>
                    <th>Key</th>
                    <th>ABDM</th>
                    <th className="st-col-actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => (
                    <tr key={f.facility_code}>
                      <td>
                        <span className="st-strong">{f.name}</span>
                        <span className="st-sub">
                          {f.facility_code}
                          {!f.active && <span className="is-bad"> · Inactive</span>}
                        </span>
                      </td>
                      <td>
                        <span className="cv-mono">{f.hcx_participant_code || "—"}</span>
                        {(f.registry_id || f.hfr_id) && <span className="st-sub cv-mono">{f.registry_id || f.hfr_id}</span>}
                      </td>
                      <td>
                        {f.scheme_code || "—"}
                        <span className="st-sub">{f.environment === "production" ? "Production" : "Sandbox"}</span>
                      </td>
                      <td>
                        {f.state || "—"}
                        {f.district && <span className="st-sub">{f.district}</span>}
                      </td>
                      <td className="st-contact">
                        {f.primary_email || "—"}
                        {f.primary_mobile && <span className="st-sub">{f.primary_mobile}</span>}
                        {f.endpoint_url && (
                          <span className="st-sub st-ellipsis" title={f.endpoint_url}>
                            {f.endpoint_url}
                          </span>
                        )}
                      </td>
                      <td>{f.private_key_set ? <span className="ep-muted">{keyWord(f)}</span> : <span className="is-bad">{keyWord(f)}</span>}</td>
                      <td>{f.abdm_registration?.success === false ? <span className="st-warn">{abdmWord(f)}</span> : <span className="ep-muted">{abdmWord(f)}</span>}</td>
                      <td className="st-col-actions">
                        {canManage(f.facility_code) && (
                          <div className="st-row-actions">
                            {isProduction && !f.abdm_registered && (
                              <button type="button" className="cv-link" onClick={() => setOnboarding({ step: 2, facility: { ...f } })}>
                                Finish NHCX registration
                              </button>
                            )}
                            <button type="button" className="cv-link" onClick={() => openEdit(f)}>
                              <Edit2 size={13} aria-hidden="true" /> Edit
                            </button>
                            {f.private_key_set ? (
                              <button type="button" className="cv-link" onClick={() => setRotate(f)}>
                                <Key size={13} aria-hidden="true" /> Rotate certificate
                              </button>
                            ) : (
                              <button type="button" className="cv-link" onClick={() => setKeyUpload(f)}>
                                <Key size={13} aria-hidden="true" /> Upload key
                              </button>
                            )}
                            {readOnly && (
                              <button type="button" className="cv-link" onClick={() => setDoctorsFor(f)}>
                                <Stethoscope size={13} aria-hidden="true" /> Doctors
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <Section id="st-appearance" title="Appearance">
        <div className="st-pad st-prefs">
          <div className="st-pref">
            <span className="st-pref-label">Theme</span>
            <Segmented
              value={theme}
              onPick={() => onToggleTheme?.()}
              options={[
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
              ]}
            />
          </div>
          <div className="st-pref">
            <span className="st-pref-label">Navigation</span>
            <Segmented
              value={layoutDirection}
              onPick={() => onToggleLayoutDirection?.()}
              options={[
                { value: "A", label: "Sidebar", icon: PanelLeft, title: "Navigation down the left" },
                { value: "B", label: "Top bar", icon: PanelTop, title: "Navigation across the top" },
              ]}
            />
          </div>
        </div>
      </Section>

      <ReadOnlyContext.Provider value={readOnly && !managesAnyFacility}>
        {onboarding && <OnboardingWizard key={`${onboarding.step}-${onboarding.facility?.facility_code || ""}`} start={onboarding} onClose={() => setOnboarding(null)} onDone={afterChange} />}

        <Drawer
          width={640}
          stack
          open={!!facilityDrawer}
          onClose={save.busy ? undefined : () => setFacilityDrawer(null)}
          title={isEdit ? `Edit ${facilityDrawer.facility.name || facilityDrawer.facility.facility_code}` : "Register a facility"}
          subtitle={isEdit ? "Changes are synced to ABDM, including the callback URL." : "Creates the facility here and registers it with ABDM."}
          footer={
            <div className="cv-drawer-actions">
              {errorCount > 0 && (
                <span className="st-error st-footer-error" role="alert">
                  {errorCount === 1 ? "1 field needs attention" : `${errorCount} fields need attention`}
                </span>
              )}
              <button type="button" className="cv-btn" onClick={() => setFacilityDrawer(null)} disabled={save.busy}>
                Cancel
              </button>
              <button type="button" className="cv-btn is-primary" disabled={save.busy} onClick={save.run}>
                {save.busy ? (isEdit ? "Saving…" : "Registering…") : isEdit ? "Save changes" : "Register facility"}
              </button>
            </div>
          }
        >
          {save.error && (
            <div className="cv-notice is-bad" role="alert">
              <div className="cv-notice-body">{save.error}</div>
            </div>
          )}
          <FacilityForm form={form} errors={errors} onChange={(key, value) => setForm((p) => ({ ...p, [key]: value }))} isEdit={isEdit} />
        </Drawer>

        <KeyUploadDrawer key={`upload-${keyUpload?.facility_code || "none"}`} facility={keyUpload} onClose={() => setKeyUpload(null)} onUploaded={reload} />
        <CertificateRotationDrawer key={`rotate-${rotate?.facility_code || "none"}`} facility={rotate} onClose={() => setRotate(null)} onRotated={reload} />

        <Drawer width={860} stack open={!!doctorsFor} onClose={() => setDoctorsFor(null)} title={`Doctors at ${doctorsFor?.name || doctorsFor?.facility_code || ""}`} subtitle={doctorsFor ? `Code ${doctorsFor.facility_code}` : undefined}>
          {doctorsFor && <Practitioners key={`doctors-${doctorsFor.facility_code}`} facility={doctorsFor} canEdit={canManage(doctorsFor.facility_code)} embedded />}
        </Drawer>
      </ReadOnlyContext.Provider>
    </div>
  );
}
