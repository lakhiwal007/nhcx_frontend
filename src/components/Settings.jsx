import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Plus,
  Key,
  Edit2,
  X,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Mail,
  Phone,
  Lock,
  Unlock,
  AlertCircle,
  Sun,
  Moon,
  PanelLeft,
  PanelTop,
  Search,
  SearchX,
  Sparkles,
} from "lucide-react";
import { api, ALL_FACILITIES_MODE_KEY, callbackBaseUrl } from "../api";
import { getDeepLinkClinicId } from "../sessionBootstrap";
import { Button, Card, EmptyState, Input, LoadingBlock } from "./Common";

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

const facilityInlineActionStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "30px",
  height: "30px",
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  borderRadius: "var(--radius-sm)",
};

function FormField({ label, required, hint, children }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "12px",
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.4px",
          marginBottom: "6px",
        }}
      >
        {label} {required && <span style={{ color: "var(--error)" }}>*</span>}
      </label>
      {children}
      {hint && (
        <div
          style={{
            fontSize: "11px",
            color: "var(--text-muted)",
            marginTop: "var(--space-1)",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  monospace,
}) {
  return (
    <input
      className="input-modern"
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        fontFamily: monospace ? "monospace" : undefined,
        opacity: disabled ? 0.6 : 1,
      }}
    />
  );
}

function SelectInput({ value, onChange, options }) {
  return (
    <select
      className="input-modern"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function MultiCheckbox({ options, value = [], onChange }) {
  const toggle = (v) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
      {options.map((o) => (
        <label
          key={o.value}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "5px 10px",
            border: `1px solid ${value.includes(o.value) ? "var(--primary)" : "var(--border-color)"}`,
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 600,
            background: value.includes(o.value)
              ? "var(--primary-light)"
              : "var(--bg-main)",
            color: value.includes(o.value)
              ? "var(--primary)"
              : "var(--text-muted)",
            userSelect: "none",
            transition: "all 0.15s",
          }}
        >
          <input
            type="checkbox"
            checked={value.includes(o.value)}
            onChange={() => toggle(o.value)}
            style={{ display: "none" }}
          />
          {value.includes(o.value) && <CheckCircle2 size={12} />}
          {o.label}
        </label>
      ))}
    </div>
  );
}

function Drawer({ open, onClose, title, subtitle, children, footer }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-overlay"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 90,
            }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="glass-panel"
            style={{
              position: "fixed",
              right: 0,
              top: 0,
              bottom: 0,
              width: "min(620px, 95vw)",
              zIndex: 91,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "22px 28px",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>
                    {title}
                  </h3>
                  {subtitle && (
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: "13px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    display: "flex",
                    padding: "var(--space-1)",
                  }}
                >
                  <X size={22} />
                </button>
              </div>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px 28px",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-5)",
              }}
            >
              {children}
            </div>
            {footer && (
              <div
                style={{
                  padding: "16px 28px",
                  borderTop: "1px solid var(--border-color)",
                  display: "flex",
                  gap: "10px",
                  justifyContent: "flex-end",
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SectionHeader({ title }) {
  return (
    <div
      style={{
        fontSize: "11px",
        fontWeight: 800,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.6px",
        paddingBottom: "10px",
        borderBottom: "1px solid var(--border-color)",
        marginTop: "var(--space-1)",
      }}
    >
      {title}
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
    <div style={{ marginBottom: "var(--space-3)" }}>
      <Button
        variant="outline"
        icon={done ? CheckCircle2 : Sparkles}
        disabled={generating}
        onClick={handleClick}
      >
        {generating ? "Generating…" : done ? "Generated" : "Generate a new key + certificate"}
      </Button>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
        Creates a 2048-bit RSA key and a self-signed certificate in your browser and fills in both fields below. Nothing leaves this tab except in the form submission itself.
      </div>
      {error && (
        <div style={{ marginTop: "4px", fontSize: "12px", color: "var(--error)", display: "flex", alignItems: "center", gap: "6px" }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}
    </div>
  );
}

function FacilityForm({ form, onChange, isEdit }) {
  return (
    <>
      <SectionHeader title="Identity" />
      <div
        className="grid-2-col" style={{ gap: "var(--space-4)" }}
      >
        <FormField
          label="Facility Code"
          required
          hint={
            isEdit
              ? "Cannot be changed after creation."
              : "Unique short code, e.g. HOSP-001"
          }
        >
          <TextInput
            value={form.facility_code}
            onChange={(v) => onChange("facility_code", v)}
            placeholder="HOSP-001"
            disabled={isEdit}
            monospace
          />
        </FormField>
        <FormField label="Display Name" required>
          <TextInput
            value={form.name}
            onChange={(v) => onChange("name", v)}
            placeholder="City General Hospital"
          />
        </FormField>
      </div>

      <FormField
        label="HCX Participant Code"
        required={isEdit}
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

      <div
        className="grid-2-col" style={{ gap: "var(--space-4)" }}
      >
        <FormField label="Registry ID" required hint="ABDM registryid / Client ID">
          <TextInput
            value={form.registry_id}
            onChange={(v) => onChange("registry_id", v)}
            placeholder="DEMO_CLIENT or HFR-12345"
          />
        </FormField>
        <FormField label="Scheme Code" required hint="e.g. PMJAY">
          <TextInput
            value={form.scheme_code}
            onChange={(v) => onChange("scheme_code", v)}
            placeholder="PMJAY"
          />
        </FormField>
      </div>

      <div
        className="grid-2-col" style={{ gap: "var(--space-4)" }}
      >
        <FormField label="Environment">
          <SelectInput
            value={form.environment}
            onChange={(v) => onChange("environment", v)}
            options={ENVIRONMENT_OPTIONS}
          />
        </FormField>
        <FormField label="Active">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              height: "44px",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              <input
                type="checkbox"
                checked={!!form.active}
                onChange={(e) => onChange("active", e.target.checked)}
              />
              <span>{form.active ? "Active" : "Inactive"}</span>
            </label>
          </div>
        </FormField>
      </div>

      <SectionHeader title="ABDM Registration" />

      <FormField label="Participant Roles" required>
        <MultiCheckbox
          options={ROLE_OPTIONS}
          value={form.roles || []}
          onChange={(v) => onChange("roles", v)}
        />
      </FormField>

      <FormField label="Linked Registry Codes" required hint="At least one - ABDM rejects an empty list">
        <MultiCheckbox
          options={LINKED_REGISTRY_OPTIONS}
          value={form.linked_registry_codes || []}
          onChange={(v) => onChange("linked_registry_codes", v)}
        />
      </FormField>

      <div
        className="grid-2-col" style={{ gap: "var(--space-4)" }}
      >
        <FormField label="State" required>
          <TextInput
            value={form.state}
            onChange={(v) => onChange("state", v)}
            placeholder="AndhraPradesh"
          />
        </FormField>
        <FormField label="District" required>
          <TextInput
            value={form.district}
            onChange={(v) => onChange("district", v)}
            placeholder="Krishna"
          />
        </FormField>
      </div>

      <SectionHeader title="Contact & Endpoints" />

      <FormField
        label="Endpoint / Callback URL"
        required
        hint="Bridge URL for NHCX callbacks"
      >
        <TextInput
          value={form.endpoint_url}
          onChange={(v) => onChange("endpoint_url", v)}
          placeholder="https://hospital.example/hcx/callback"
          type="url"
        />
      </FormField>

      <div
        className="grid-2-col" style={{ gap: "var(--space-4)" }}
      >
        <FormField label="Primary Email" required>
          <TextInput
            value={form.primary_email}
            onChange={(v) => onChange("primary_email", v)}
            placeholder="hcx@hospital.example"
            type="email"
          />
        </FormField>
        <FormField
          label="Primary Mobile"
          required
          hint="10 digits, no country code or spaces - ABDM rejects anything else"
        >
          <TextInput
            value={form.primary_mobile}
            onChange={(v) => onChange("primary_mobile", v.replace(/\D/g, "").slice(0, 10))}
            placeholder="9876543210"
          />
        </FormField>
      </div>

      <FormField
        label="Signing Certificate Path (URL)"
        hint="Forwarded to ABDM at registration - not stored locally"
      >
        <TextInput
          value={form.signing_cert_path}
          onChange={(v) => onChange("signing_cert_path", v)}
          placeholder="https://hospital.example/certs/signing.crt"
          type="url"
        />
      </FormField>

      <FormField
        label="Encryption Certificate (Base64)"
        required
        hint="Base64-encoded public certificate - ABDM rejects registration without it"
      >
        <textarea
          className="input-modern"
          style={{
            fontFamily: "monospace",
            fontSize: "11px",
            height: "80px",
            resize: "vertical",
          }}
          placeholder="TUlJQzJqQ0NBY0tnQXdJQkFnSUJBVEFOQmdrcWhraUc5dzBCQVFzRkFEQVlNUll3..."
          value={form.encryption_cert || ""}
          onChange={(e) => onChange("encryption_cert", e.target.value)}
        />
      </FormField>

      {!isEdit && (
        <>
          <SectionHeader title="RSA Private Key (optional at creation)" />
          <GenerateKeypairButton
            facilityCode={form.facility_code}
            facilityName={form.name}
            onGenerated={({ private_key_pem, encryption_cert }) => {
              onChange("encryption_cert", encryption_cert);
              onChange("private_key_pem", private_key_pem);
            }}
          />
          <FormField
            label="Private Key PEM"
            hint="Paste the full RSA private key including -----BEGIN ... KEY----- headers. Can also be uploaded separately after creation."
          >
            <textarea
              className="input-modern"
              style={{
                fontFamily: "monospace",
                fontSize: "11px",
                height: "120px",
                resize: "vertical",
              }}
              placeholder={
                "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----"
              }
              value={form.private_key_pem || ""}
              onChange={(e) => onChange("private_key_pem", e.target.value)}
            />
          </FormField>
        </>
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
      open={open}
      onClose={onClose}
      title={`Upload RSA Key - ${facility?.name || facility?.facility_code}`}
      subtitle="The key is used to decrypt inbound NHCX callbacks. It is stored securely and never returned by the API."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Key}
            disabled={!pem.trim() || saving}
            onClick={handleUpload}
          >
            {saving ? "Uploading…" : "Upload Key"}
          </Button>
        </>
      }
    >
      <FormField
        label="RSA Private Key PEM"
        required
        hint="Both traditional RSA (BEGIN RSA PRIVATE KEY) and PKCS#8 (BEGIN PRIVATE KEY) formats are accepted."
      >
        <textarea
          className="input-modern"
          style={{
            fontFamily: "monospace",
            fontSize: "11px",
            height: "200px",
            resize: "vertical",
          }}
          placeholder={
            "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----"
          }
          value={pem}
          onChange={(e) => setPem(e.target.value)}
        />
      </FormField>
      {error && (
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            alignItems: "flex-start",
            padding: "10px 14px",
            background: "rgba(239,68,68,0.06)",
            border: "1px solid var(--error)",
            borderRadius: "var(--radius-sm)",
            fontSize: "13px",
            color: "var(--error)",
          }}
        >
          <AlertTriangle
            size={16}
            style={{ flexShrink: 0, marginTop: "1px" }}
          />{" "}
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
    setForm({
      scheme_code: "PMJAY",
      endpoint_url: callbackBaseUrl(),
      ...start?.facility,
    });
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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className="inline-error-banner" style={{ margin: 0, color: "var(--text)" }}>
        <Phone size={16} />
        NHCX sent a passcode to {sentTo || "the mobile on the HFR record"} to {what}. It is valid for 24 hours.
      </div>
      <FormField label="Passcode" required>
        <TextInput value={passcode} onChange={setPasscode} placeholder="From the SMS" monospace />
      </FormField>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
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
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {error && (
          <div className="inline-error-banner" style={{ margin: 0 }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
              <FormField label="State">
                <TextInput value={form.state} onChange={(v) => set("state", v)} />
              </FormField>
              <FormField label="District">
                <TextInput value={form.district} onChange={(v) => set("district", v)} />
              </FormField>
            </div>
            <div>
              <Button write variant="primary" disabled={busy} onClick={sendCreate}>
                {busy ? "Sending…" : "Create on NHCX and send passcode"}
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div style={{ fontSize: "13px" }}>
              NHCX participant code: <strong style={{ fontFamily: "monospace" }}>{form.hcx_participant_code}</strong>
            </div>
            {passcodeStep(confirmCreate, sendCreate, "confirm the hospital's creation")}
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: "13px" }}>
              Created as <strong style={{ fontFamily: "monospace" }}>{form.hcx_participant_code}</strong>. Now register the
              certificate NHCX encrypts with, and the address it delivers payer answers to.
            </div>
            <GenerateKeypairButton
              facilityCode={form.facility_code}
              facilityName={form.name}
              onGenerated={({ private_key_pem, encryption_cert }) => setForm((p) => ({ ...p, private_key_pem, encryption_cert }))}
            />
            <FormField label="Encryption Certificate (Base64 or PEM)" required>
              <textarea
                className="input-modern"
                rows={4}
                value={form.encryption_cert || ""}
                onChange={(e) => set("encryption_cert", e.target.value)}
                style={{ fontFamily: "monospace", fontSize: "11.5px" }}
              />
            </FormField>
            <FormField label="Private Key PEM" hint="Must belong to the certificate; leave empty to keep the key already stored">
              <textarea
                className="input-modern"
                rows={4}
                value={form.private_key_pem || ""}
                onChange={(e) => set("private_key_pem", e.target.value)}
                style={{ fontFamily: "monospace", fontSize: "11.5px" }}
              />
            </FormField>
            <FormField label="Callback URL" required hint="https, a domain name (no IP or port), hosted in India">
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
          <div className="inline-error-banner" style={{ margin: 0, color: "var(--success)" }}>
            <CheckCircle2 size={16} />
            {form.name || form.facility_code} is registered on NHCX production as {form.hcx_participant_code}, and NHCX holds
            this certificate.
          </div>
        )}
      </div>
    </Drawer>
  );
}

function FacilityCard({
  facility,
  onEdit,
  onUploadKey,
  onFinishOnboarding,
}) {
  const abdmOk = facility.abdm_registration?.success;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      style={{
        background: "var(--bg-card)",
        border: "1.5px solid var(--border-color)",
        borderRadius: "var(--radius-lg)",
        padding: "20px 24px",
        boxShadow: "var(--shadow)",
        transition: "all 0.2s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "14px",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              marginBottom: "var(--space-1)",
              flexWrap: "wrap",
            }}
          >
            <code
              style={{
                fontSize: "13px",
                fontWeight: 800,
                color: "var(--primary)",
                background: "var(--primary-light)",
                padding: "2px 8px",
                borderRadius: "var(--radius-xs)",
              }}
            >
              {facility.facility_code}
            </code>
            <span
              className={`badge-modern badge-${facility.environment === "production" ? "success" : "info"}`}
            >
              {facility.environment === "production" ? "Production" : "Sandbox"}
            </span>
            <span
              className={`badge-modern badge-${facility.active ? "success" : "error"}`}
            >
              {facility.active ? "Active" : "Inactive"}
            </span>
          </div>
          <div
            style={{ fontSize: "16px", fontWeight: 700, marginBottom: "2px" }}
          >
            {facility.name}
          </div>
          <code style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            {facility.hcx_participant_code}
          </code>
        </div>
      </div>

      <div
        className="grid-2-col"
        style={{
          gap: "10px",
          marginBottom: "var(--space-4)",
          fontSize: "12px",
        }}
      >
        {facility.registry_id && (
          <div>
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
              Registry ID:{" "}
            </span>
            {facility.registry_id}
          </div>
        )}
        {facility.scheme_code && (
          <div>
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
              Scheme:{" "}
            </span>
            {facility.scheme_code}
          </div>
        )}
        {facility.state && (
          <div>
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
              State:{" "}
            </span>
            {facility.state}
            {facility.district ? `, ${facility.district}` : ""}
          </div>
        )}
        {facility.primary_email && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <Mail size={11} color="var(--text-muted)" />
            {facility.primary_email}
          </div>
        )}
        {facility.primary_mobile && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <Phone size={11} color="var(--text-muted)" />
            {facility.primary_mobile}
          </div>
        )}
        {facility.endpoint_url && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
              gridColumn: "1 / -1",
            }}
          >
            <Globe size={11} color="var(--text-muted)" />
            {facility.endpoint_url}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          paddingTop: "14px",
          borderTop: "1px solid var(--border-color)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            fontWeight: 600,
            color: facility.private_key_set ? "var(--success)" : "var(--error)",
          }}
        >
          {facility.private_key_set ? <Lock size={13} /> : <Unlock size={13} />}
          {facility.private_key_set ? "Key Uploaded" : "No RSA Key"}
        </div>
        {!abdmOk && abdmOk !== undefined && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
              fontSize: "11px",
              color: "var(--warning)",
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={11} /> ABDM sync failed
          </div>
        )}
        {abdmOk && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
              fontSize: "11px",
              color: "var(--success)",
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={11} /> ABDM registered
          </div>
        )}
        {onEdit && (
          <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
            {onFinishOnboarding && (
              <Button size="small" variant="primary" icon={Globe} onClick={() => onFinishOnboarding(facility)}>
                Finish NHCX registration
              </Button>
            )}
            <Button
              size="small"
              variant="outline"
              icon={Key}
              onClick={() => onUploadKey(facility)}
            >
              {facility.private_key_set ? "Rotate Key" : "Upload Key"}
            </Button>
            <Button
              size="small"
              variant="outline"
              icon={Edit2}
              onClick={() => onEdit(facility)}
            >
              Edit
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
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
  const [editingFacility, setEditingFacility] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [keyDrawerFacility, setKeyDrawerFacility] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const isProduction = nhcxEnvironment === "production";
  const [editLoadingCode, setEditLoadingCode] = useState(null);

  const [facilitySearch, setFacilitySearch] = useState("");
  const facilitySearchQuery = facilitySearch.trim().toLowerCase();
  const filteredFacilities = facilitySearchQuery
    ? facilities.filter((f) =>
        [
          f.name,
          f.facility_code,
          f.hcx_participant_code,
          f.state,
          f.district,
          f.registry_id,
          f.environment,
        ]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(facilitySearchQuery)),
      )
    : facilities;

  // GET /facilities lists the caller's own clinics' facilities (every facility
  // for a read-only global admin), inactive ones included. The "Facility
  // Management" Card shows it to a global admin (view only) and to anyone who
  // may manage a facility; it's also loaded for the `needsFallbackPicker` case
  // below - a `skip_auth` sandbox with no real token to derive a facility list
  // from, where nothing else lets a dev pick one at all.
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

  const handleFormChange = (key, value) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!form.facility_code || !form.name || (editingFacility && !form.hcx_participant_code)) {
      setFormError(
        editingFacility
          ? "Facility Code, Name, and HCX Participant Code are required."
          : "Facility Code and Name are required.",
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

  return (
    <div>
      {readOnly && (
        <Card title="Active Facility" className="mb-6">
          <div className="inline-error-banner" style={{ margin: 0 }}>
            <Globe size={16} />
            This account sees every facility at once and changes nothing — no case, payer reply or facility can be edited from it.
          </div>
        </Card>
      )}

      {sessionFacilities && !readOnly && (
        <Card title="Active Facility" className="mb-6">
          {sessionFacilities.length === 0 ? (
            needsFallbackPicker && facilities.length > 0 ? (
              <div>
                <div className="inline-error-banner" style={{ margin: "0 0 var(--space-3)" }}>
                  <AlertCircle size={16} />
                  No facility is linked to your session. Pick one below to continue.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  {facilities.map((f) => {
                    const isActive = !allFacilitiesMode && localStorage.getItem("nhcx_default_provider_id") === f.hcx_participant_code;
                    return (
                      <button
                        key={f.facility_code}
                        onClick={() => handleSelectSessionFacility(f)}
                        className={`badge-modern ${isActive ? "badge-success" : "badge-info"}`}
                        style={{ cursor: "pointer", border: "none", fontSize: "13px", padding: "8px 14px" }}
                      >
                        {isActive && <CheckCircle2 size={13} />}
                        {f.name || f.facility_code}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <div className="inline-error-banner" style={{ margin: "0 0 var(--space-3)" }}>
                  <AlertCircle size={16} />
                  {canRegister
                    ? "No cashless-enabled facility is linked to your account. As its clinic admin, register it below."
                    : "No cashless-enabled facility is linked to your account. Ask your clinic admin to register it."}
                </div>
                {canRegister && (
                  <Button variant="primary" icon={Plus} onClick={() => openCreate(registerPrefill())}>
                    Register This Facility
                  </Button>
                )}
              </div>
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
                {sessionFacilities.map((f) => {
                  const isActive = !allFacilitiesMode && localStorage.getItem("nhcx_default_provider_id") === f.hcx_participant_code;
                  return (
                    <div
                      key={f.facility_code}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                        border: `1px solid ${isActive ? "var(--primary)" : "var(--border-color)"}`,
                        borderRadius: "var(--radius-pill)",
                        padding: "2px 4px 2px 2px",
                        background: "var(--bg-card)",
                      }}
                    >
                      <button
                        onClick={() => handleSelectSessionFacility(f)}
                        title={isActive ? "Active facility" : "Switch to this facility"}
                        className={`badge-modern ${isActive ? "badge-success" : "badge-info"}`}
                        style={{ cursor: "pointer", border: "none", fontSize: "13px", padding: "7px 12px" }}
                      >
                        {isActive && <CheckCircle2 size={13} />}
                        {f.name || f.facility_code}
                      </button>
                      {canManage(f.facility_code) && (
                        <>
                          <button
                            onClick={() => openEditByCode(f.facility_code)}
                            disabled={editLoadingCode === f.facility_code}
                            title="Edit facility — callback URL, contact, roles, encryption cert"
                            style={facilityInlineActionStyle}
                          >
                            {editLoadingCode === f.facility_code
                              ? <span className="spinner" style={{ width: "13px", height: "13px" }} />
                              : <Edit2 size={14} />}
                          </button>
                          <button
                            onClick={() => setKeyDrawerFacility(f)}
                            title="Upload or rotate the facility's RSA key"
                            style={facilityInlineActionStyle}
                          >
                            <Key size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {(canRegister || sessionFacilities.some((f) => canManage(f.facility_code))) && (
                <div>
                  {canRegister && (
                    <Button
                      variant="outline"
                      size="small"
                      icon={Plus}
                      onClick={() => openCreate(registerPrefill())}
                    >
                      Register another facility
                    </Button>
                  )}
                  <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "6px" }}>
                    Editing re-syncs the facility to ABDM. To change your NHCX callback URL, edit the facility and update the Endpoint / Callback URL field.
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <Card title="Appearance" className="mb-6">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "28px" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "var(--space-2)" }}>
              Theme
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                onClick={() => theme !== "light" && onToggleTheme?.()}
                className={`badge-modern ${theme === "light" ? "badge-success" : "badge-info"}`}
                style={{ cursor: "pointer", border: "none", fontSize: "13px", padding: "8px 14px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Sun size={13} /> Light
              </button>
              <button
                onClick={() => theme !== "dark" && onToggleTheme?.()}
                className={`badge-modern ${theme === "dark" ? "badge-success" : "badge-info"}`}
                style={{ cursor: "pointer", border: "none", fontSize: "13px", padding: "8px 14px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Moon size={13} /> Dark
              </button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "var(--space-2)" }}>
              Navigation Layout
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                onClick={() => layoutDirection !== "A" && onToggleLayoutDirection?.()}
                title="Dark rail sidebar on the left"
                className={`badge-modern ${layoutDirection === "A" ? "badge-success" : "badge-info"}`}
                style={{ cursor: "pointer", border: "none", fontSize: "13px", padding: "8px 14px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <PanelLeft size={13} /> Rail Sidebar
              </button>
              <button
                onClick={() => layoutDirection !== "B" && onToggleLayoutDirection?.()}
                title="Dark top command-bar with horizontal nav"
                className={`badge-modern ${layoutDirection === "B" ? "badge-success" : "badge-info"}`}
                style={{ cursor: "pointer", border: "none", fontSize: "13px", padding: "8px 14px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <PanelTop size={13} /> Top Bar
              </button>
            </div>
          </div>
        </div>
      </Card>

      {showManagement && (
        <Card
          title={
            facilitySearchQuery
              ? `Facility Management (${filteredFacilities.length} of ${facilities.length})`
              : `Facility Management${facilities.length ? ` (${facilities.length})` : ""}`
          }
          headerAction={
            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
              <div style={{ width: "260px" }}>
                <Input
                  icon={Search}
                  placeholder="Search name, code, participant…"
                  value={facilitySearch}
                  onChange={(e) => setFacilitySearch(e.target.value)}
                />
              </div>
              {canRegister && (
                <Button variant="primary" icon={Plus} onClick={() => openCreate(registerPrefill())}>
                  Register Facility
                </Button>
              )}
            </div>
          }
        >
          {loadError && (
            <div className="inline-error-banner">
              <AlertCircle size={16} />
              Could not load facilities. Showing the last known results, if any.
            </div>
          )}

          {loading ? (
            <LoadingBlock text="Loading facilities…" />
          ) : facilities.length === 0 ? (
            <EmptyState
              icon={Building2}
              iconSize={52}
              iconOpacity={0.25}
              title="No Facilities Registered"
              description="Register your hospital's HCX facility to enable preauth, claims, and eligibility workflows."
            >
              {canRegister && (
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => openCreate(registerPrefill())}
                  style={{ marginTop: "var(--space-5)" }}
                >
                  Register First Facility
                </Button>
              )}
            </EmptyState>
          ) : filteredFacilities.length === 0 ? (
            <EmptyState
              icon={SearchX}
              iconSize={44}
              iconOpacity={0.25}
              title="No Matching Facilities"
              description={`Nothing matches "${facilitySearch.trim()}". Try a different name, code, or participant ID.`}
            >
              <Button
                variant="outline"
                onClick={() => setFacilitySearch("")}
                style={{ marginTop: "var(--space-4)" }}
              >
                Clear Search
              </Button>
            </EmptyState>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(min(100%, 560px), 1fr))",
                gap: "var(--space-4)",
              }}
            >
              {filteredFacilities.map((f) => (
                <FacilityCard
                  key={f.facility_code}
                  facility={f}
                  onEdit={canManage(f.facility_code) ? openEdit : undefined}
                  onUploadKey={setKeyDrawerFacility}
                  onFinishOnboarding={
                    isProduction && canManage(f.facility_code) && !f.abdm_registered
                      ? (fac) => setOnboarding({ step: 2, facility: { ...fac } })
                      : undefined
                  }
                />
              ))}
            </motion.div>
          )}
        </Card>
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
        open={showFacilityDrawer}
        onClose={() => setShowFacilityDrawer(false)}
        title={
          editingFacility
            ? `Edit ${editingFacility.name || editingFacility.facility_code}`
            : "Register New Facility"
        }
        subtitle={
          editingFacility
            ? `Code ${editingFacility.facility_code} · updates sync to ABDM.`
            : "Creates the facility locally and proxies registration to ABDM."
        }
        footer={
          <>
            {formError && (
              <div
                style={{
                  flex: 1,
                  fontSize: "12px",
                  color: "var(--error)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <AlertTriangle size={14} /> {formError}
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => setShowFacilityDrawer(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={saving ? undefined : CheckCircle2}
              disabled={saving}
              onClick={handleSave}
            >
              {saving
                ? editingFacility
                  ? "Updating…"
                  : "Registering…"
                : editingFacility
                  ? "Save Changes"
                  : "Register Facility"}
            </Button>
          </>
        }
      >
        <FacilityForm
          form={form}
          onChange={handleFormChange}
          isEdit={!!editingFacility}
        />
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
