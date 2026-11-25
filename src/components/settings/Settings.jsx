import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Building2, Plus, Edit2, RefreshCw, Sun, Moon, PanelLeft, PanelTop, ArrowRight } from "lucide-react";
import { api, markHandled, ALL_FACILITIES_MODE_KEY } from "../../api";
import { getDeepLinkClinicId } from "../../lib/sessionBootstrap";
import { useSend } from "../../hooks/util/useSend";
import { Button, EmptyState, LoadingBlock } from "../ui/Common";
import { Drawer } from "../ui/Overlay";
import PageActions from "../ui/PageActions";
import { ReadOnlyContext } from "../../lib/readOnly";
import FacilityForm from "./FacilityForm";
import { EMPTY_FORM, formFromFacility, validateFacility, facilityPayload } from "./facilityModel";
import { KeyUploadDrawer, CertificateRotationDrawer } from "./KeyDrawers";
import OnboardingWizard from "./OnboardingWizard";
import Practitioners from "./Practitioners";
import FacilityAdmin from "./FacilityAdmin";
import AllFacilities from "./AllFacilities";
import { facilityIssues, facilityStatus } from "./facilityHealth";

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

const readStored = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const writeStored = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    return;
  }
};


export default function Settings({ readOnly = false, manageableFacilityCodes = [], managesAnyFacility = false, nhcxEnvironment = "sandbox", sessionFacilities = null, sessionUserId = null, sessionUserName = null, onSessionRefresh, allFacilitiesMode = false, theme = "light", onToggleTheme, layoutDirection = "B", onToggleLayoutDirection }) {
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
  const [opening, setOpening] = useState(null);
  const [openError, setOpenError] = useState(null);
  const [activeCode, setActiveCode] = useState(() => readStored("nhcx_default_provider_id"));
  const [adminCode, setAdminCode] = useState(null);

  const needsFallbackPicker = Array.isArray(sessionFacilities) && sessionFacilities.length === 0 && !sessionUserId;
  const canManage = (code) => managesAnyFacility || manageableFacilityCodes.includes(String(code));
  const showManagement = readOnly || managesAnyFacility || manageableFacilityCodes.length > 0;
  const isDesk = !showManagement && sessionFacilities?.length > 0;
  const globalView = readOnly || managesAnyFacility;

  useEffect(() => {
    if (!showManagement && !needsFallbackPicker && !isDesk) return undefined;
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
  }, [reloadKey, showManagement, needsFallbackPicker, isDesk]);

  const loading = (showManagement || needsFallbackPicker) && list.key !== reloadKey;
  const facilities = list.facilities || [];
  const statusOf = (code) => {
    const f = facilities.find((row) => String(row.facility_code) === String(code));
    if (!f) return null;
    const status = facilityStatus(facilityIssues(f));
    return [status.label, status.tone];
  };
  const ownPick = activeCode && facilities.find((f) => f.hcx_participant_code === activeCode && canManage(f.facility_code));
  const adminFacility = globalView
    ? facilities.find((f) => String(f.facility_code) === String(adminCode)) || null
    : facilities.find((f) => String(f.facility_code) === String(adminCode)) || ownPick || facilities.find((f) => canManage(f.facility_code)) || null;
  const detailOf = (code) => facilities.find((row) => String(row.facility_code) === String(code)) || null;
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
    { success: (res) => (res ? (isEdit ? "Facility saved" : "Facility registered") : null) },
  );
  const errorCount = Object.keys(errors).length;

  const pickFacility = (facility) => {
    writeStored("nhcx_default_provider_id", facility.hcx_participant_code);
    writeStored("nhcx_default_facility_name", facility.name || "");
    writeStored(ALL_FACILITIES_MODE_KEY, null);
    window.dispatchEvent(new CustomEvent("provider-changed"));
    setActiveCode(facility.hcx_participant_code);
  };

  const hasSessionFacilities = sessionFacilities?.length > 0;
  const pickerFacilities = hasSessionFacilities ? sessionFacilities : needsFallbackPicker ? facilities : [];
  const isActive = (f) => !allFacilitiesMode && activeCode === f.hcx_participant_code;
  const activeFacility = readOnly ? null : pickerFacilities.find(isActive) || null;
  const firstRun = !readOnly && sessionFacilities && !activeFacility;


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
          <div className="cv-notice-body">{managesAnyFacility ? "Sees all facilities. Cases are view only." : "View only, all facilities."}</div>
        </div>
      )}

      {isDesk && (
        <section className="st-section st-me" aria-label="You">
          <span className="st-me-av" aria-hidden="true">
            {String(sessionUserName || "?")
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase()}
          </span>
          <div className="st-me-who">
            <h2 className="st-section-title">{sessionUserName || "Signed in"}</h2>
            <span className="st-section-meta">Signed in from the hospital system</span>
          </div>
          <div className="st-me-chips">
            <span className="cv-chip is-ok">Can work cases</span>
            <span className="cv-chip is-todo">Hospital setup: clinic admin only</span>
          </div>
        </section>
      )}
      {sessionFacilities && !readOnly && (
        <Section id="st-active" title={firstRun ? "Choose the facility you work at" : "Active facility"} meta={!firstRun && activeFacility ? `Working as ${activeFacility.name || activeFacility.facility_code}` : null}>
          {firstRun && (
            <div className="st-pad">
              <div className="cv-notice is-info">
                <div className="cv-notice-body">
                  {pickerFacilities.length === 0 ? "No facility linked yet." : "Choose your facility to start."}
                  {cameFrom && pickerFacilities.length > 0 ? ` You will go back to ${cameFrom.startsWith("/case/") ? "the case" : "where you were"} after choosing.` : ""}
                </div>
              </div>
            </div>
          )}
          {pickerFacilities.length === 0 ? (
            <div className="st-pad st-stack">
              <div className="cv-notice is-warn">
                <div className="cv-notice-body">{canRegister ? "No facility linked. Register one above." : "No facility linked. Ask your clinic admin."}</div>
              </div>
            </div>
          ) : (
            <>
              {!hasSessionFacilities && (
                <div className="st-pad">
                  <div className="cv-notice is-warn">
                    <div className="cv-notice-body">Choose a facility to continue.</div>
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
                      {facilities.length > 0 && <th>Status</th>}
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
                          {facilities.length > 0 && <td>{statusOf(f.facility_code) && <span className={`cv-chip ${statusOf(f.facility_code)[1]}`}>{statusOf(f.facility_code)[0]}</span>}</td>}
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

      {isDesk && activeFacility && detailOf(activeFacility.facility_code) && (
        <Section id="st-glance" title={activeFacility.name || activeFacility.facility_code} meta="Setup questions go to your clinic admin">
          <dl className="st-glance">
            <dt>NHCX</dt>
            <dd>{detailOf(activeFacility.facility_code).abdm_registered ? `Registered · ${detailOf(activeFacility.facility_code).environment || "—"}` : "Not registered"}</dd>
            <dt>Payer answers</dt>
            <dd className={detailOf(activeFacility.facility_code).private_key_set ? undefined : "is-bad"}>{detailOf(activeFacility.facility_code).private_key_set ? "Can be read" : "Key missing. Ask your clinic admin."}</dd>
            <dt>Scheme</dt>
            <dd>{detailOf(activeFacility.facility_code).scheme_code || "—"}</dd>
          </dl>
        </Section>
      )}
      {isDesk && activeFacility && <Practitioners key={activeFacility.facility_code} facility={activeFacility} canEdit={hasSessionFacilities && canManage(activeFacility.facility_code)} />}

      {showManagement && (
        <>
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
            <EmptyState icon={Building2} iconSize={44} iconOpacity={0.25} title="No facilities registered" description="Register the facility to start.">
              {canRegister && (
                <Button variant="primary" size="small" icon={Plus} onClick={openCreate}>
                  Register facility
                </Button>
              )}
            </EmptyState>
          ) : globalView && !adminFacility ? (
            <AllFacilities facilities={facilities} search={search} onSearch={setSearch} onOpen={setAdminCode} />
          ) : adminFacility ? (
            <FacilityAdmin
              key={adminFacility.facility_code}
              facility={adminFacility}
              canManage={canManage(adminFacility.facility_code)}
              isProduction={isProduction}
              onEdit={openEdit}
              onUploadKey={setKeyUpload}
              onRotate={setRotate}
              onOnboard={(f) => setOnboarding({ step: 2, facility: { ...f } })}
              onBack={globalView ? () => setAdminCode(null) : null}
              viewingAsAdmin={globalView}
              switcher={
                !globalView && facilities.length > 1 ? (
                  <select className="cv-ctl st-adm-switch" aria-label="Facility" value={adminFacility.facility_code} onChange={(e) => setAdminCode(e.target.value)}>
                    {facilities.map((f) => (
                      <option key={f.facility_code} value={f.facility_code}>
                        {f.name || f.facility_code}
                      </option>
                    ))}
                  </select>
                ) : null
              }
            />
          ) : null}
        </>
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

      </ReadOnlyContext.Provider>
    </div>
  );
}
