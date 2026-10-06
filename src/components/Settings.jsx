import { useState, useEffect } from "react";
import {
  Building2,
  Plus,
  Key,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sun,
  Moon,
  PanelLeft,
  PanelTop,
  SearchX,
  Sparkles,
} from "lucide-react";
import { api, ADMIN_TOKEN_KEY, ALL_FACILITIES_MODE_KEY } from "../api";
import { getDeepLinkClinicId } from "../sessionBootstrap";
import { Button, EmptyState, LoadingBlock } from "./Common";
import { Drawer } from "./Overlay";
import { Section } from "./case/CaseFile";
import PageActions from "./PageActions";

const ROLE_OPTIONS = [
  { value: "10001", label: "Provider" },
  { value: "10002", label: "Payer" },
  { value: "10003", label: "TPA" },
  { value: "10004", label: "Regulator" },
  { value: "10005", label: "Research" },
  { value: "10006", label: "Member ISNP" },
  { value: "10007", label: "Sponsor" },
  { value: "10008", label: "HIE / HIO / HCX" },
];

const LINKED_REGISTRY_OPTIONS = [
  { value: "10001", label: "HFR" },
  { value: "10002", label: "NIN" },
  { value: "10003", label: "ROHINI" },
  { value: "10004", label: "Payer" },
];

const ENVIRONMENT_OPTIONS = [
  { value: "sandbox", label: "Sandbox" },
  { value: "production", label: "Production" },
];

const REQUIRED_TEXT_FIELDS = [
  ["registry_id", "Registry ID"],
  ["scheme_code", "Scheme Code"],
  ["state", "State"],
  ["district", "District"],
  ["endpoint_url", "Endpoint / Callback URL"],
  ["primary_email", "Primary Email"],
  ["encryption_cert", "Encryption Certificate (Base64)"],
];

const EMPTY_FORM = {
  facility_code: "",
  name: "",
  hcx_participant_code: "",
  registry_id: "",
  scheme_code: "PMJAY",
  environment: "sandbox",
  state: "",
  district: "",
  endpoint_url: "",
  primary_email: "",
  primary_mobile: "",
  signing_cert_path: "",
  encryption_cert: "",
  roles: ["10001"],
  linked_registry_codes: ["10001"],
  active: true,
  private_key_pem: "",
};

const PEM_PLACEHOLDER = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----";

function FormField({ label, required, hint, wide, children }) {
  return (
    <label className={`st-field${wide ? " is-wide" : ""}`}>
      <span className="st-field-label">
        {label}
        {required && <span className="st-req"> *</span>}
      </span>
      {children}
      {hint && <span className="st-hint">{hint}</span>}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", disabled, monospace }) {
  return (
    <input
      className={`input-modern pd-input${monospace ? " ep-mono" : ""}`}
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

function SelectInput({ value, onChange, options }) {
  return (
    <select className="input-modern pd-input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function MultiCheckbox({ options, value = [], onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="st-checks">
      {options.map((o) => (
        <label key={o.value} className="pd-radio">
          <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function FormGroup({ title, children }) {
  return (
    <fieldset className="st-group">
      <legend className="st-group-title">{title}</legend>
      <div className="st-grid">{children}</div>
    </fieldset>
  );
}

// Two-option segmented switch used by Appearance.
function Segmented({ value, options, onPick }) {
  return (
    <div className="st-seg" role="radiogroup">
      {options.map(({ value: v, label, icon: Icon, title }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={value === v ? "is-on" : ""}
          title={title}
          onClick={() => value !== v && onPick()}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}

function GenerateKeypairButton({ facilityCode, facilityName, onGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const handleClick = async () => {
    setGenerating(true);
    setError(null);
    setDone(false);
    try {
      const { generateFacilityKeypair } = await import("../certGeneration");
      const { privateKeyPem, encryptionCertBase64 } = await generateFacilityKeypair({ facilityCode, facilityName });
      onGenerated({ private_key_pem: privateKeyPem, encryption_cert: encryptionCertBase64 });
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (err) {
      setError(err.message || "Key generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="st-field is-wide">
      <div>
        <Button variant="outline" size="small" icon={done ? CheckCircle2 : Sparkles} disabled={generating} onClick={handleClick}>
          {generating ? "Generating…" : done ? "Generated" : "Generate a new key + certificate"}
        </Button>
      </div>
      <span className="st-hint">
        Creates a 2048-bit RSA key and a self-signed certificate in your browser and fills in both fields. Nothing leaves this tab except in the form submission itself.
      </span>
      {error && (
        <span className="st-error">
          <AlertTriangle size={13} /> {error}
        </span>
      )}
    </div>
  );
}

function FacilityForm({ form, onChange, isEdit }) {
  return (
    <>
      <FormGroup title="Identity">
        <FormField label="Facility code" required hint={isEdit ? "Cannot be changed after creation." : "Unique short code, e.g. HOSP-001"}>
          <TextInput value={form.facility_code} onChange={(v) => onChange("facility_code", v)} placeholder="HOSP-001" disabled={isEdit} monospace />
        </FormField>
        <FormField label="Display name" required>
          <TextInput value={form.name} onChange={(v) => onChange("name", v)} placeholder="City General Hospital" />
        </FormField>
        <FormField
          label="HCX participant code"
          required={isEdit}
          wide
          hint={
            isEdit
              ? "ABDM participant_code, e.g. 1000099999@hcx"
              : "Leave blank — ABDM's participant/create assigns this on registration. Only set it to re-link a participant code that already exists outside this wrapper."
          }
        >
          <TextInput
            value={form.hcx_participant_code}
            onChange={(v) => onChange("hcx_participant_code", v)}
            placeholder={isEdit ? "1000099999@hcx" : "Auto-assigned by ABDM"}
            monospace
          />
        </FormField>
        <FormField label="Registry ID" required hint="ABDM registryid / Client ID">
          <TextInput value={form.registry_id} onChange={(v) => onChange("registry_id", v)} placeholder="DEMO_CLIENT or HFR-12345" />
        </FormField>
        <FormField label="Scheme code" required hint="e.g. PMJAY">
          <TextInput value={form.scheme_code} onChange={(v) => onChange("scheme_code", v)} placeholder="PMJAY" />
        </FormField>
        <FormField label="Environment">
          <SelectInput value={form.environment} onChange={(v) => onChange("environment", v)} options={ENVIRONMENT_OPTIONS} />
        </FormField>
        <FormField label="Status">
          <span className="pd-radio st-inline-check">
            <input type="checkbox" checked={!!form.active} onChange={(e) => onChange("active", e.target.checked)} />
            Active
          </span>
        </FormField>
      </FormGroup>

      <FormGroup title="ABDM registration">
        <FormField label="Participant roles" required wide>
          <MultiCheckbox options={ROLE_OPTIONS} value={form.roles || []} onChange={(v) => onChange("roles", v)} />
        </FormField>
        <FormField label="Linked registry codes" required wide hint="At least one — ABDM rejects an empty list">
          <MultiCheckbox options={LINKED_REGISTRY_OPTIONS} value={form.linked_registry_codes || []} onChange={(v) => onChange("linked_registry_codes", v)} />
        </FormField>
        <FormField label="State" required>
          <TextInput value={form.state} onChange={(v) => onChange("state", v)} placeholder="AndhraPradesh" />
        </FormField>
        <FormField label="District" required>
          <TextInput value={form.district} onChange={(v) => onChange("district", v)} placeholder="Krishna" />
        </FormField>
      </FormGroup>

      <FormGroup title="Contact & endpoints">
        <FormField label="Endpoint / callback URL" required wide hint="Bridge URL for NHCX callbacks">
          <TextInput value={form.endpoint_url} onChange={(v) => onChange("endpoint_url", v)} placeholder="https://hospital.example/hcx/callback" type="url" />
        </FormField>
        <FormField label="Primary email" required>
          <TextInput value={form.primary_email} onChange={(v) => onChange("primary_email", v)} placeholder="hcx@hospital.example" type="email" />
        </FormField>
        <FormField label="Primary mobile" required hint="10 digits, no country code or spaces">
          <TextInput
            value={form.primary_mobile}
            onChange={(v) => onChange("primary_mobile", v.replace(/\D/g, "").slice(0, 10))}
            placeholder="9876543210"
            monospace
          />
        </FormField>
        <FormField label="Signing certificate path (URL)" wide hint="Forwarded to ABDM at registration — not stored locally">
          <TextInput
            value={form.signing_cert_path}
            onChange={(v) => onChange("signing_cert_path", v)}
            placeholder="https://hospital.example/certs/signing.crt"
            type="url"
          />
        </FormField>
        <FormField label="Encryption certificate (Base64)" required wide hint="Base64-encoded public certificate — ABDM rejects registration without it">
          <textarea
            className="input-modern st-textarea"
            rows={4}
            placeholder="TUlJQzJqQ0NBY0tnQXdJQkFnSUJBVEFOQmdrcWhraUc5dzBCQVFzRkFEQVlNUll3..."
            value={form.encryption_cert || ""}
            onChange={(e) => onChange("encryption_cert", e.target.value)}
          />
        </FormField>
      </FormGroup>

      {!isEdit && (
        <FormGroup title="RSA private key (optional at creation)">
          <GenerateKeypairButton
            facilityCode={form.facility_code}
            facilityName={form.name}
            onGenerated={({ private_key_pem, encryption_cert }) => {
              onChange("encryption_cert", encryption_cert);
              onChange("private_key_pem", private_key_pem);
            }}
          />
          <FormField
            label="Private key PEM"
            wide
            hint="Paste the full RSA private key including the -----BEGIN ... KEY----- headers. Can also be uploaded after creation."
          >
            <textarea
              className="input-modern st-textarea"
              rows={6}
              placeholder={PEM_PLACEHOLDER}
              value={form.private_key_pem || ""}
              onChange={(e) => onChange("private_key_pem", e.target.value)}
            />
          </FormField>
        </FormGroup>
      )}
    </>
  );
}

function KeyUploadDrawer({ facility, open, onClose, onUploaded }) {
  const [pem, setPem] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setPem("");
      setError(null);
    }
  }, [open]);

  const handleUpload = async () => {
    if (!pem.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.uploadFacilityKey(facility.facility_code, {
        private_key_pem: pem.trim(),
      });
      onUploaded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      width={620}
      stack
      open={open}
      onClose={onClose}
      title={`Upload RSA key — ${facility?.name || facility?.facility_code}`}
      subtitle="The key decrypts inbound NHCX callbacks. It is stored securely and never returned by the API."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Key} disabled={!pem.trim() || saving} onClick={handleUpload}>
            {saving ? "Uploading…" : "Upload key"}
          </Button>
        </>
      }
    >
      <FormField
        label="RSA private key PEM"
        required
        hint="Both traditional RSA (BEGIN RSA PRIVATE KEY) and PKCS#8 (BEGIN PRIVATE KEY) formats are accepted."
      >
        <textarea className="input-modern st-textarea" rows={10} placeholder={PEM_PLACEHOLDER} value={pem} onChange={(e) => setPem(e.target.value)} />
      </FormField>
      {error && (
        <div className="ep-notice is-bad">
          {error}
        </div>
      )}
    </Drawer>
  );
}

// Key and ABDM status: plain text when fine, colour only when something is wrong.
function KeyStatus({ set }) {
  return set ? <span className="ep-muted">Uploaded</span> : <span className="is-bad">Missing</span>;
}

function AbdmStatus({ registration }) {
  const ok = registration?.success;
  if (ok === undefined) return <span className="ep-muted">—</span>;
  return ok ? <span className="ep-muted">Registered</span> : <span className="st-warn">Sync failed</span>;
}

export default function Settings({
  isAdmin = false,
  sessionFacilities = null,
  sessionUserId = null,
  onSessionRefresh,
  allFacilitiesMode = false,
  theme = "light",
  onToggleTheme,
  layoutDirection = "A",
  onToggleLayoutDirection,
}) {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY) || "");

  const [showFacilityDrawer, setShowFacilityDrawer] = useState(false);
  const [editingFacility, setEditingFacility] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [keyDrawerFacility, setKeyDrawerFacility] = useState(null);
  const [editLoadingCode, setEditLoadingCode] = useState(null);

  const [facilitySearch, setFacilitySearch] = useState("");
  const facilitySearchQuery = facilitySearch.trim().toLowerCase();
  const filteredFacilities = facilitySearchQuery
    ? facilities.filter((f) =>
        [f.name, f.facility_code, f.hcx_participant_code, f.state, f.district, f.registry_id, f.environment]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(facilitySearchQuery)),
      )
    : facilities;

  // The "Facility management" section below (register/edit/upload key) is
  // rendered only for isAdmin, since GET /facilities lists every facility in
  // the system, not just the caller's own. It's still loaded read-only for
  // the `needsFallbackPicker` case below - a `skip_auth` sandbox with no real
  // token to derive a facility list from, where nothing else lets a dev pick
  // one at all. A real (non-skip_auth) user with zero facilities of their own
  // never hits that branch, even if unrelated facilities exist system-wide -
  // see needsFallbackPicker.
  const loadFacilities = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.listFacilities();
      setFacilities(res?.facilities || []);
    } catch (_) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const needsFallbackPicker = Array.isArray(sessionFacilities) && sessionFacilities.length === 0 && !sessionUserId;

  useEffect(() => {
    if (isAdmin || needsFallbackPicker) loadFacilities();
  }, [isAdmin, needsFallbackPicker]);

  const openCreate = (prefill = {}) => {
    setEditingFacility(null);
    setForm({ ...EMPTY_FORM, ...prefill });
    setFormError(null);
    setShowFacilityDrawer(true);
  };

  const openEdit = (facility) => {
    setEditingFacility(facility);
    setForm({
      facility_code: facility.facility_code,
      name: facility.name,
      hcx_participant_code: facility.hcx_participant_code,
      registry_id: facility.registry_id || "",
      scheme_code: facility.scheme_code || "PMJAY",
      environment: facility.environment || "sandbox",
      state: facility.state || "",
      district: facility.district || "",
      endpoint_url: facility.endpoint_url || "",
      primary_email: facility.primary_email || "",
      primary_mobile: facility.primary_mobile || "",
      signing_cert_path: facility.signing_cert_path || "",
      encryption_cert: facility.encryption_cert || "",
      roles: facility.roles || ["10001"],
      linked_registry_codes: facility.linked_registry_codes || [],
      active: facility.active ?? true,
      private_key_pem: "",
    });
    setFormError(null);
    setShowFacilityDrawer(true);
  };

  const openEditByCode = async (facilityCode) => {
    setEditLoadingCode(facilityCode);
    try {
      const full = await api.getFacility(facilityCode);
      openEdit(full);
    } catch (_) {
    } finally {
      setEditLoadingCode(null);
    }
  };

  const handleFormChange = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!form.facility_code || !form.name || (editingFacility && !form.hcx_participant_code)) {
      setFormError(
        editingFacility ? "Facility Code, Name, and HCX Participant Code are required." : "Facility Code and Name are required.",
      );
      return;
    }
    const missingField = REQUIRED_TEXT_FIELDS.find(([key]) => !form[key]);
    if (missingField) {
      setFormError(`${missingField[1]} is required.`);
      return;
    }
    if (!/^\d{10}$/.test(form.primary_mobile || "")) {
      setFormError("Primary Mobile is required and must be exactly 10 digits - ABDM rejects any other format.");
      return;
    }
    if (!(form.roles || []).length) {
      setFormError("Select at least one Participant Role.");
      return;
    }
    if (!(form.linked_registry_codes || []).length) {
      setFormError("Select at least one Linked Registry Code - ABDM rejects an empty list.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = { ...form };
      if (!payload.private_key_pem) delete payload.private_key_pem;
      if (!payload.hcx_participant_code) delete payload.hcx_participant_code;
      if (editingFacility) {
        await api.updateFacility(form.facility_code, payload);
      } else {
        await api.createFacility(payload);
      }
      setShowFacilityDrawer(false);
      await loadFacilities();
      await onSessionRefresh?.();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Act as a specific facility from the session's own facility list (the set
  // this user may actually select, per GET /session - distinct from the
  // admin-gated GET /facilities management list below).
  const handleSelectSessionFacility = (facility) => {
    localStorage.setItem("nhcx_default_provider_id", facility.hcx_participant_code);
    localStorage.setItem("nhcx_default_facility_name", facility.name || "");
    localStorage.removeItem(ALL_FACILITIES_MODE_KEY);
    window.dispatchEvent(new CustomEvent("provider-changed"));
  };

  // Admin-only: enter the read-only cross-facility view - no X-Provider-Id is
  // sent, so every read spans all facilities; writes remain blocked until a
  // single facility is selected again.
  const handleEnableAllFacilities = () => {
    localStorage.setItem(ALL_FACILITIES_MODE_KEY, "true");
    localStorage.removeItem("nhcx_default_provider_id");
    localStorage.removeItem("nhcx_default_facility_name");
    window.dispatchEvent(new CustomEvent("provider-changed"));
  };

  const handleAdminTokenChange = (value) => {
    setAdminToken(value);
    if (value) localStorage.setItem(ADMIN_TOKEN_KEY, value);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  };

  const isActiveFacility = (f) => !allFacilitiesMode && localStorage.getItem("nhcx_default_provider_id") === f.hcx_participant_code;
  const hasSessionFacilities = sessionFacilities?.length > 0;
  // The fallback picker reuses the admin list, so it has no per-facility edit/key actions.
  const pickerFacilities = hasSessionFacilities ? sessionFacilities : needsFallbackPicker ? facilities : [];

  return (
    <div className="ep-screen st-screen">
      {(isAdmin || hasSessionFacilities) && (
        <PageActions>
          <Button variant="outline" size="small" icon={Plus} onClick={() => openCreate()}>
            Register facility
          </Button>
        </PageActions>
      )}

      {sessionFacilities && (
        <Section
          id="st-active"
          title="Active facility"
          meta={hasSessionFacilities && "Editing re-syncs the facility to ABDM, including the NHCX callback URL."}
        >
          {pickerFacilities.length === 0 ? (
            <div className="ep-pad st-stack">
              <div className="ep-notice is-bad">
                No cashless-enabled facility is linked to your account. If you're the clinic owner, register it here — otherwise, ask
                your clinic's owner to register it.
              </div>
              <div>
                <Button variant="primary" icon={Plus} onClick={() => openCreate({ facility_code: getDeepLinkClinicId() || "" })}>
                  Register this facility
                </Button>
              </div>
            </div>
          ) : (
            <>
              {!hasSessionFacilities && (
                <div className="ep-notice is-warn st-notice">No facility is linked to your session. Pick one to continue.</div>
              )}
              <div className="ep-table-wrap">
                <table className="ep-table st-table">
                  <thead>
                    <tr>
                      <th className="st-col-pick" aria-label="Active" />
                      <th>Facility</th>
                      <th>Participant code</th>
                      <th className="st-col-actions" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {pickerFacilities.map((f) => {
                      const on = isActiveFacility(f);
                      return (
                        <tr key={f.facility_code} className={`st-pick-row${on ? " is-on" : ""}`} onClick={() => handleSelectSessionFacility(f)}>
                          <td className="st-col-pick">
                            <input
                              type="radio"
                              name="st-active-facility"
                              checked={on}
                              onChange={() => handleSelectSessionFacility(f)}
                              aria-label={`Act as ${f.name || f.facility_code}`}
                            />
                          </td>
                          <td>
                            <span className="ep-strong">{f.name || f.facility_code}</span>
                            <span className="ep-field-sub">{f.facility_code}</span>
                          </td>
                          <td className="ep-mono">{f.hcx_participant_code || "—"}</td>
                          <td className="st-col-actions" onClick={(e) => e.stopPropagation()}>
                            {hasSessionFacilities && (
                              <div className="st-row-actions">
                                <button
                                  type="button"
                                  className="ep-action"
                                  disabled={editLoadingCode === f.facility_code}
                                  title="Edit facility — callback URL, contact, roles, encryption cert"
                                  onClick={() => openEditByCode(f.facility_code)}
                                >
                                  {editLoadingCode === f.facility_code ? <span className="spinner st-spinner" /> : <Edit2 size={13} />}
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="ep-action"
                                  title="Upload or rotate the facility's RSA key"
                                  onClick={() => setKeyDrawerFacility(f)}
                                >
                                  <Key size={13} /> Key
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {isAdmin && hasSessionFacilities && (
                      <tr className={`st-pick-row${allFacilitiesMode ? " is-on" : ""}`} onClick={handleEnableAllFacilities}>
                        <td className="st-col-pick">
                          <input
                            type="radio"
                            name="st-active-facility"
                            checked={allFacilitiesMode}
                            onChange={handleEnableAllFacilities}
                            aria-label="View all facilities"
                          />
                        </td>
                        <td>
                          <span className="ep-strong">All facilities</span>
                          <span className="st-sub">Read-only — no single facility is acted as</span>
                        </td>
                        <td className="ep-muted">—</td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>
      )}

      <Section id="st-appearance" title="Appearance">
        <dl className="ep-fields cols-1 st-prefs">
          <div className="ep-field">
            <dt>Theme</dt>
            <dd>
              <Segmented
                value={theme}
                onPick={() => onToggleTheme?.()}
                options={[
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                ]}
              />
            </dd>
          </div>
          <div className="ep-field">
            <dt>Navigation</dt>
            <dd>
              <Segmented
                value={layoutDirection}
                onPick={() => onToggleLayoutDirection?.()}
                options={[
                  { value: "A", label: "Sidebar", icon: PanelLeft, title: "Sidebar navigation on the left" },
                  { value: "B", label: "Top bar", icon: PanelTop, title: "Top command bar with horizontal navigation" },
                ]}
              />
            </dd>
          </div>
        </dl>
      </Section>

      {isAdmin && (
        <Section
          id="st-facilities"
          title="Facility management"
          meta={facilities.length > 0 && (facilitySearchQuery ? `${filteredFacilities.length} of ${facilities.length}` : `${facilities.length} registered`)}
        >
          <div className="ep-toolbar">
            <input
              className="input-modern ep-search"
              placeholder="Search name, code, participant…"
              value={facilitySearch}
              onChange={(e) => setFacilitySearch(e.target.value)}
            />
            <label className="st-token">
              <span className="ep-muted">Admin token</span>
              <input
                type="password"
                className="input-modern pd-input"
                placeholder="Required to register, edit or upload keys"
                value={adminToken}
                onChange={(e) => handleAdminTokenChange(e.target.value)}
              />
            </label>
          </div>

          {loadError && <div className="ep-notice is-bad st-notice">Could not load facilities. Showing the last known results, if any.</div>}

          {loading ? (
            <LoadingBlock text="Loading facilities…" />
          ) : facilities.length === 0 ? (
            <EmptyState
              icon={Building2}
              iconSize={44}
              iconOpacity={0.25}
              title="No facilities registered"
              description="Register your hospital's HCX facility to enable preauth, claims, and eligibility workflows."
            />
          ) : filteredFacilities.length === 0 ? (
            <EmptyState
              icon={SearchX}
              iconSize={44}
              iconOpacity={0.25}
              title="No matching facilities"
              description={`Nothing matches "${facilitySearch.trim()}".`}
            >
              <Button variant="outline" size="small" onClick={() => setFacilitySearch("")}>
                Clear search
              </Button>
            </EmptyState>
          ) : (
            <div className="ep-table-wrap">
              <table className="ep-table st-table st-admin-table">
                <thead>
                  <tr>
                    <th>Facility</th>
                    <th>Participant · Registry</th>
                    <th>Scheme · Env</th>
                    <th>Region</th>
                    <th>Contact</th>
                    <th>RSA key</th>
                    <th>ABDM</th>
                    <th className="st-col-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredFacilities.map((f) => (
                    <tr key={f.facility_code}>
                      <td>
                        <span className="ep-strong">{f.name}</span>
                        <span className="ep-field-sub">
                          {f.facility_code}
                          {!f.active && <span className="is-bad"> · Inactive</span>}
                        </span>
                      </td>
                      <td>
                        <span className="ep-mono">{f.hcx_participant_code || "—"}</span>
                        {f.registry_id && <span className="ep-field-sub">{f.registry_id}</span>}
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
                        {f.primary_mobile && <span className="ep-field-sub">{f.primary_mobile}</span>}
                        {f.endpoint_url && (
                          <span className="ep-field-sub st-ellipsis" title={f.endpoint_url}>
                            {f.endpoint_url}
                          </span>
                        )}
                      </td>
                      <td>
                        <KeyStatus set={f.private_key_set} />
                      </td>
                      <td>
                        <AbdmStatus registration={f.abdm_registration} />
                      </td>
                      <td className="st-col-actions">
                        <div className="st-row-actions">
                          <button type="button" className="ep-action" onClick={() => openEdit(f)}>
                            <Edit2 size={13} /> Edit
                          </button>
                          <button type="button" className="ep-action" onClick={() => setKeyDrawerFacility(f)}>
                            <Key size={13} /> {f.private_key_set ? "Rotate" : "Upload"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <Drawer
        width={620}
        stack
        open={showFacilityDrawer}
        onClose={() => setShowFacilityDrawer(false)}
        title={editingFacility ? `Edit ${editingFacility.name || editingFacility.facility_code}` : "Register new facility"}
        subtitle={
          editingFacility
            ? `Code ${editingFacility.facility_code} · updates sync to ABDM.`
            : "Creates the facility locally and proxies registration to ABDM."
        }
        footer={
          <>
            {formError && (
              <span className="st-error st-footer-error">
                <AlertCircle size={14} /> {formError}
              </span>
            )}
            <Button variant="outline" onClick={() => setShowFacilityDrawer(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={saving ? undefined : CheckCircle2} disabled={saving} onClick={handleSave}>
              {saving ? (editingFacility ? "Updating…" : "Registering…") : editingFacility ? "Save changes" : "Register facility"}
            </Button>
          </>
        }
      >
        <FacilityForm form={form} onChange={handleFormChange} isEdit={!!editingFacility} />
      </Drawer>

      <KeyUploadDrawer
        facility={keyDrawerFacility}
        open={!!keyDrawerFacility}
        onClose={() => setKeyDrawerFacility(null)}
        onUploaded={loadFacilities}
      />
    </div>
  );
}
