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
  Stethoscope,
} from "lucide-react";
import { api, ALL_FACILITIES_MODE_KEY, callbackBaseUrl } from "../api";
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
  hfr_id: "",
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
        <FormField label="HFR ID" hint="Health Facility Registry id the payer knows the hospital by">
          <TextInput value={form.hfr_id} onChange={(v) => onChange("hfr_id", v)} placeholder="IN1910000151" monospace />
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

// NHCX production takes a participant only through two passcode-confirmed
// halves: create against the HFR record, then register the certificate and
// callback address. The passcodes go to the mobile on the HFR record.
const ONBOARDING_STEPS = ["Hospital details", "First passcode", "Certificate", "Second passcode"];

function OnboardingWizard({ open, start, onClose, onDone }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({});
  const [transactionId, setTransactionId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sentTo, setSentTo] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStep(start?.step ?? 0);
    setForm({ scheme_code: "PMJAY", endpoint_url: callbackBaseUrl(), ...start?.facility });
    setTransactionId("");
    setPasscode("");
    setError(null);
    setSentTo(null);
  }, [open, start]);

  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || "NHCX refused the request.");
    } finally {
      setBusy(false);
    }
  };

  const sendCreate = () =>
    run(async () => {
      if (!form.facility_code || !form.name || !form.registry_id || !form.primary_email) {
        throw new Error("Facility code, name, HFR ID and email are required.");
      }
      if (!/^\d{10}$/.test(form.primary_mobile || "")) {
        throw new Error("Enter the 10-digit mobile exactly as it is on the HFR record.");
      }
      const res = await api.startFacilityOnboarding({
        facility_code: form.facility_code,
        registry_id: form.registry_id,
        primary_mobile: form.primary_mobile,
        primary_email: form.primary_email,
      });
      setForm((p) => ({ ...p, hcx_participant_code: res.participant_code }));
      setTransactionId(res.transaction_id);
      setPasscode("");
      setSentTo(form.primary_mobile);
      setStep(1);
    });

  const confirmCreate = () =>
    run(async () => {
      await api.confirmFacilityOnboarding({
        facility_code: form.facility_code,
        participant_code: form.hcx_participant_code,
        transaction_id: transactionId,
        passcode: passcode.trim(),
        name: form.name,
        registry_id: form.registry_id,
        hfr_id: form.registry_id,
        scheme_code: form.scheme_code,
        state: form.state,
        district: form.district,
        primary_email: form.primary_email,
        primary_mobile: form.primary_mobile,
      });
      setPasscode("");
      setStep(2);
    });

  const sendCertificate = () =>
    run(async () => {
      if (!form.encryption_cert) throw new Error("Generate or paste the certificate first.");
      if (!form.endpoint_url) throw new Error("The callback URL is required.");
      const res = await api.registerFacilityOnboarding(form.facility_code, {
        encryption_cert: form.encryption_cert,
        private_key_pem: form.private_key_pem || undefined,
        endpoint_url: form.endpoint_url,
      });
      setTransactionId(res.transaction_id);
      setPasscode("");
      setSentTo(form.primary_mobile || "the mobile on the HFR record");
      setStep(3);
    });

  const confirmCertificate = () =>
    run(async () => {
      await api.activateFacilityOnboarding(form.facility_code, { transaction_id: transactionId, passcode: passcode.trim() });
      setStep(4);
      await onDone?.();
    });

  const passcodeStep = (onConfirm, onResend, what) => (
    <div className="st-stack">
      <div className="ep-notice">
        NHCX sent a passcode to {sentTo || "the mobile on the HFR record"} to {what}. It is valid for 24 hours.
      </div>
      <FormField label="Passcode" required>
        <TextInput value={passcode} onChange={setPasscode} placeholder="From the SMS" monospace />
      </FormField>
      <div className="st-row-actions">
        <Button write variant="primary" disabled={busy || !passcode.trim()} onClick={onConfirm}>
          {busy ? "Checking…" : "Confirm passcode"}
        </Button>
        <Button write variant="outline" disabled={busy} onClick={onResend}>
          Send a new passcode
        </Button>
      </div>
    </div>
  );

  return (
    <Drawer
      width={620}
      stack
      open={open}
      onClose={onClose}
      title="Register on NHCX production"
      subtitle={step < 4 ? `Step ${step + 1} of 4 · ${ONBOARDING_STEPS[step]}` : "Registered"}
      footer={
        <Button variant="outline" onClick={onClose}>
          {step === 4 ? "Close" : "Cancel"}
        </Button>
      }
    >
      <div className="st-stack">
        {error && <div className="ep-notice is-bad">{error}</div>}

        {step === 0 && (
          <>
            <FormField label="Facility Code" required hint="The hospital's clinic id in the HIS">
              <TextInput value={form.facility_code} onChange={(v) => set("facility_code", v)} disabled={!!start?.facility?.facility_code} monospace />
            </FormField>
            <FormField label="Hospital Name" required>
              <TextInput value={form.name} onChange={(v) => set("name", v)} />
            </FormField>
            <FormField label="HFR ID" required hint="The facility's Health Facility Registry id; it must be verified in HFR">
              <TextInput value={form.registry_id} onChange={(v) => set("registry_id", v)} placeholder="IN2910000001" monospace />
            </FormField>
            <FormField label="Mobile on the HFR record" required hint="Both passcodes go here; it must match HFR exactly">
              <TextInput value={form.primary_mobile} onChange={(v) => set("primary_mobile", v)} placeholder="9876543210" />
            </FormField>
            <FormField label="Email" required>
              <TextInput value={form.primary_email} onChange={(v) => set("primary_email", v)} placeholder="hcx@hospital.example" />
            </FormField>
            <FormField label="State">
              <TextInput value={form.state} onChange={(v) => set("state", v)} />
            </FormField>
            <FormField label="District">
              <TextInput value={form.district} onChange={(v) => set("district", v)} />
            </FormField>
            <div>
              <Button write variant="primary" disabled={busy} onClick={sendCreate}>
                {busy ? "Sending…" : "Create on NHCX and send passcode"}
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              NHCX participant code: <span className="ep-mono ep-strong">{form.hcx_participant_code}</span>
            </div>
            {passcodeStep(confirmCreate, sendCreate, "confirm the hospital's creation")}
          </>
        )}

        {step === 2 && (
          <>
            <div>
              Created as <span className="ep-mono ep-strong">{form.hcx_participant_code}</span>. Now register the certificate NHCX
              encrypts with, and the address it delivers payer answers to.
            </div>
            <GenerateKeypairButton
              facilityCode={form.facility_code}
              facilityName={form.name}
              onGenerated={({ private_key_pem, encryption_cert }) => setForm((p) => ({ ...p, private_key_pem, encryption_cert }))}
            />
            <FormField label="Encryption Certificate (Base64 or PEM)" required wide>
              <textarea className="input-modern st-textarea" rows={4} value={form.encryption_cert || ""} onChange={(e) => set("encryption_cert", e.target.value)} />
            </FormField>
            <FormField label="Private Key PEM" hint="Must belong to the certificate; leave empty to keep the key already stored" wide>
              <textarea className="input-modern st-textarea" rows={4} value={form.private_key_pem || ""} onChange={(e) => set("private_key_pem", e.target.value)} />
            </FormField>
            <FormField label="Callback URL" required hint="https, a domain name (no IP or port), hosted in India" wide>
              <TextInput value={form.endpoint_url} onChange={(v) => set("endpoint_url", v)} monospace />
            </FormField>
            <div>
              <Button write variant="primary" disabled={busy} onClick={sendCertificate}>
                {busy ? "Sending…" : "Register certificate and send passcode"}
              </Button>
            </div>
          </>
        )}

        {step === 3 && passcodeStep(confirmCertificate, sendCertificate, "confirm the certificate and callback URL")}

        {step === 4 && (
          <div className="ep-notice">
            {form.name || form.facility_code} is registered on NHCX production as {form.hcx_participant_code}, and NHCX holds this
            certificate.
          </div>
        )}
      </div>
    </Drawer>
  );
}

// Key and ABDM status: plain text when fine, colour only when something is wrong.
function practitionerForm(doctor) {
  const master = doctor.master || {};
  return {
    hpr_id: master.hpr_id || "",
    qualification_display: master.qualification_display || (doctor.qualifications || []).join(", "),
    specialty_code: master.specialty_code || "",
    specialty_display: master.specialty_display || doctor.specialization || "",
  };
}

function PractitionerDrawer({ facilityCode, doctor, onClose, onSaved }) {
  const [form, setForm] = useState(() => practitionerForm(doctor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const hprDigits = (form.hpr_id || "").replace(/[\s-]/g, "");
  const hprValid = /^\d{14}$/.test(hprDigits);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.savePractitioner(facilityCode, doctor.doctor_id, { ...form, hpr_id: hprDigits, active: true });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      width={560}
      stack
      open
      onClose={onClose}
      title={`HPR id — ${doctor.name || doctor.doctor_id}`}
      subtitle="Sent as this doctor's identity in every pre-auth and claim. PMJAY looks the doctor up by it."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!hprValid || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="st-grid">
        <FormField label="HPR id" required wide hint="The 14-digit Healthcare Professionals Registry id. Hyphens are fine.">
          <TextInput value={form.hpr_id} onChange={set("hpr_id")} placeholder="71-1234-5678-9012" monospace />
        </FormField>
        <FormField label="Degrees" wide hint="As written, e.g. MBBS, MS (Ortho). The highest degree named is sent.">
          <TextInput value={form.qualification_display} onChange={set("qualification_display")} placeholder="MBBS, MD (General Medicine)" />
        </FormField>
        <FormField label="Specialty SNOMED code" hint="Optional. Sent as the care-team specialty.">
          <TextInput value={form.specialty_code} onChange={set("specialty_code")} placeholder="394537008" monospace />
        </FormField>
        <FormField label="Specialty name">
          <TextInput value={form.specialty_display} onChange={set("specialty_display")} placeholder="Paediatric specialty" />
        </FormField>
      </div>
      {form.hpr_id && !hprValid && <div className="ep-notice is-warn">An HPR id has 14 digits.</div>}
      {error && <div className="ep-notice is-bad">{error}</div>}
    </Drawer>
  );
}

function PractitionerSection({ facility, canEdit }) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const facilityCode = facility.facility_code;

  useEffect(() => {
    let live = true;
    api
      .listPractitioners(facilityCode)
      .then((res) => live && setDoctors(res?.practitioners || []))
      .catch((err) => live && setLoadError(err.message || "Could not load the doctors."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [facilityCode]);

  const replace = (saved) => setDoctors((list) => list.map((d) => (d.doctor_id === saved.doctor_id ? saved : d)));

  const toggleActive = async (doctor) => {
    setTogglingId(doctor.doctor_id);
    try {
      replace(await api.savePractitioner(facilityCode, doctor.doctor_id, { hpr_id: doctor.master.hpr_id, active: !doctor.master.active }));
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const inHis = doctors.filter((d) => d.in_his);
  const missing = inHis.filter((d) => !d.master?.active).length;

  return (
    <Section
      id="st-practitioners"
      title="Doctors' HPR ids"
      meta={!loading && inHis.length > 0 && (missing ? `${missing} of ${inHis.length} without an HPR id` : "Every doctor has an HPR id")}
    >
      <div className="ep-pad">
        <div className="ep-notice">
          The HIS holds no HPR ids, so a doctor without one here goes to the payer under their registration number, which PMJAY refuses.
          {!canEdit && " Only this facility's clinic admin can change them."}
        </div>
      </div>
      {loadError && <div className="ep-notice is-bad st-notice">{loadError}</div>}
      {loading ? (
        <LoadingBlock text="Loading doctors…" />
      ) : doctors.length === 0 ? (
        <EmptyState icon={Stethoscope} iconSize={44} iconOpacity={0.25} title="No doctors found" description="The HIS lists no doctors for this facility." />
      ) : (
        <div className="ep-table-wrap">
          <table className="ep-table st-table">
            <thead>
              <tr>
                <th>Doctor</th>
                <th>HPR id</th>
                <th>Degrees · Specialty</th>
                <th className="st-col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {doctors.map((d) => {
                const master = d.master;
                const retired = master && !master.active;
                return (
                  <tr key={d.doctor_id}>
                    <td>
                      <span className="ep-strong">{d.name || `Doctor ${d.doctor_id}`}</span>
                      <span className="ep-field-sub">
                        {[d.registration_no, d.specialization, !d.in_his && "no longer in the HIS"].filter(Boolean).join(" · ") || d.doctor_id}
                      </span>
                    </td>
                    <td className="ep-mono">
                      {!master ? <span className="is-bad">Missing</span> : retired ? <span className="ep-muted">{master.hpr_id} · retired</span> : master.hpr_id}
                    </td>
                    <td>
                      {master ? (
                        <>
                          <span>{master.qualification_display || "—"}</span>
                          <span className="ep-field-sub">{master.specialty_display || master.specialty_code || "—"}</span>
                        </>
                      ) : (
                        <span className="ep-muted">—</span>
                      )}
                    </td>
                    <td className="st-col-actions">
                      {canEdit && (
                        <div className="st-row-actions">
                          {d.in_his && (
                            <button type="button" className="ep-action" onClick={() => setEditing(d)}>
                              <Edit2 size={13} /> {master ? "Edit" : "Add"}
                            </button>
                          )}
                          {master && (
                            <button type="button" className="ep-action" disabled={togglingId === d.doctor_id} onClick={() => toggleActive(d)}>
                              {master.active ? "Retire" : "Reinstate"}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <PractitionerDrawer key={editing.doctor_id} facilityCode={facilityCode} doctor={editing} onClose={() => setEditing(null)} onSaved={replace} />}
    </Section>
  );
}

function KeyStatus({ set }) {
  return set ? <span className="ep-muted">Uploaded</span> : <span className="is-bad">Missing</span>;
}

function AbdmStatus({ registration }) {
  const ok = registration?.success;
  if (ok === undefined) return <span className="ep-muted">—</span>;
  return ok ? <span className="ep-muted">Registered</span> : <span className="st-warn">Sync failed</span>;
}

export default function Settings({
  readOnly = false,
  manageableFacilityCodes = [],
  managesAnyFacility = false,
  nhcxEnvironment = "sandbox",
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

  const [showFacilityDrawer, setShowFacilityDrawer] = useState(false);
  const [onboarding, setOnboarding] = useState(null);
  const isProduction = nhcxEnvironment === "production";
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

  // GET /facilities lists the caller's own clinics' facilities (every facility
  // for a read-only global admin), inactive ones included. The "Facility
  // management" section shows it to a global admin (view only) and to anyone
  // who may manage a facility; it's also loaded for the `needsFallbackPicker`
  // case below - a `skip_auth` sandbox with no real token to derive a facility
  // list from, where nothing else lets a dev pick one at all.
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

  // Only a clinic admin may register or change a facility, and only its own
  // clinics' (WRAPPER-ERROR:1014 otherwise); skip_auth sandboxes may touch any.
  const canManage = (code) => managesAnyFacility || manageableFacilityCodes.includes(String(code));
  const registeredCodes = new Set([...(sessionFacilities || []), ...facilities].map((f) => String(f.facility_code)));
  const unregisteredCodes = manageableFacilityCodes.filter((code) => !registeredCodes.has(code));
  const canRegister = managesAnyFacility || unregisteredCodes.length > 0;
  const showManagement = readOnly || managesAnyFacility || manageableFacilityCodes.length > 0;
  const registerPrefill = () => {
    const clinicId = getDeepLinkClinicId();
    return { facility_code: (clinicId && canManage(clinicId) ? String(clinicId) : unregisteredCodes[0]) || "" };
  };

  useEffect(() => {
    if (showManagement || needsFallbackPicker) loadFacilities();
  }, [showManagement, needsFallbackPicker]);

  const openCreate = (prefill = {}) => {
    if (isProduction) {
      setOnboarding({ step: 0, facility: prefill });
      return;
    }
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
      hfr_id: facility.hfr_id || "",
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
  // GET /facilities management list below).
  const handleSelectSessionFacility = (facility) => {
    localStorage.setItem("nhcx_default_provider_id", facility.hcx_participant_code);
    localStorage.setItem("nhcx_default_facility_name", facility.name || "");
    localStorage.removeItem(ALL_FACILITIES_MODE_KEY);
    window.dispatchEvent(new CustomEvent("provider-changed"));
  };

  const isActiveFacility = (f) => !allFacilitiesMode && localStorage.getItem("nhcx_default_provider_id") === f.hcx_participant_code;
  const hasSessionFacilities = sessionFacilities?.length > 0;
  // The fallback picker reuses the admin list, so it has no per-facility edit/key actions.
  const pickerFacilities = hasSessionFacilities ? sessionFacilities : needsFallbackPicker ? facilities : [];
  const activeFacility = readOnly ? null : pickerFacilities.find(isActiveFacility);

  return (
    <div className="ep-screen st-screen">
      {canRegister && (
        <PageActions>
          <Button variant="outline" size="small" icon={Plus} onClick={() => openCreate(registerPrefill())}>
            Register facility
          </Button>
        </PageActions>
      )}

      {readOnly && (
        <Section id="st-active" title="Active facility">
          <div className="ep-pad">
            <div className="ep-notice">
              This account sees every facility at once and changes nothing — no case, payer reply or facility can be edited from it.
            </div>
          </div>
        </Section>
      )}

      {sessionFacilities && !readOnly && (
        <Section
          id="st-active"
          title="Active facility"
          meta={hasSessionFacilities && sessionFacilities.some((f) => canManage(f.facility_code)) && "Editing re-syncs the facility to ABDM, including the NHCX callback URL."}
        >
          {pickerFacilities.length === 0 ? (
            <div className="ep-pad st-stack">
              <div className="ep-notice is-bad">
                {canRegister
                  ? "No cashless-enabled facility is linked to your account. As its clinic admin, register it here."
                  : "No cashless-enabled facility is linked to your account. Ask your clinic admin to register it."}
              </div>
              {canRegister && (
                <div>
                  <Button variant="primary" icon={Plus} onClick={() => openCreate(registerPrefill())}>
                    Register this facility
                  </Button>
                </div>
              )}
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
                            {hasSessionFacilities && canManage(f.facility_code) && (
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
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>
      )}

      {activeFacility && <PractitionerSection key={activeFacility.facility_code} facility={activeFacility} canEdit={hasSessionFacilities && canManage(activeFacility.facility_code)} />}

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

      {showManagement && (
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
                        {canManage(f.facility_code) && (
                          <div className="st-row-actions">
                            {isProduction && !f.abdm_registered && (
                              <button type="button" className="ep-action" onClick={() => setOnboarding({ step: 2, facility: { ...f } })}>
                                Finish NHCX registration
                              </button>
                            )}
                            <button type="button" className="ep-action" onClick={() => openEdit(f)}>
                              <Edit2 size={13} /> Edit
                            </button>
                            <button type="button" className="ep-action" onClick={() => setKeyDrawerFacility(f)}>
                              <Key size={13} /> {f.private_key_set ? "Rotate" : "Upload"}
                            </button>
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

      <OnboardingWizard
        open={!!onboarding}
        start={onboarding}
        onClose={() => setOnboarding(null)}
        onDone={async () => {
          await loadFacilities();
          await onSessionRefresh?.();
        }}
      />

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
