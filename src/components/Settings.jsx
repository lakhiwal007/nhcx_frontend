import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Plus,
  Key,
  Star,
  Edit2,
  X,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Mail,
  Phone,
  RefreshCw,
  Lock,
  Unlock,
} from "lucide-react";
import { api } from "../api";
import { PageHeader, Button } from "./Common";

const DEFAULT_FACILITY_KEY = "nhcx_default_facility";

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

const EMPTY_FORM = {
  facility_code: "",
  name: "",
  hcx_participant_code: "",
  registry_id: "",
  scheme_code: "",
  environment: "sandbox",
  state: "",
  district: "",
  endpoint_url: "",
  primary_email: "",
  primary_mobile: "",
  clinic_id: "",
  signing_cert_path: "",
  roles: ["10001"],
  linked_registry_codes: [],
  active: true,
  private_key_pem: "",
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
            marginTop: "4px",
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {options.map((o) => (
        <label
          key={o.value}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "5px 10px",
            border: `1px solid ${value.includes(o.value) ? "var(--primary)" : "var(--border-color)"}`,
            borderRadius: "8px",
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
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(4px)",
              zIndex: 90,
            }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            style={{
              position: "fixed",
              right: 0,
              top: 0,
              bottom: 0,
              width: "min(620px, 95vw)",
              background: "var(--bg-card)",
              borderLeft: "1px solid var(--border-color)",
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
                    padding: "4px",
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
                gap: "20px",
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
        marginTop: "4px",
      }}
    >
      {title}
    </div>
  );
}

function FacilityForm({ form, onChange, isEdit }) {
  return (
    <>
      <SectionHeader title="Identity" />
      <div
        className="grid-2-col" style={{ gap: "16px" }}
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
        required
        hint="ABDM participant_code, e.g. 1000099999@hcx"
      >
        <TextInput
          value={form.hcx_participant_code}
          onChange={(v) => onChange("hcx_participant_code", v)}
          placeholder="1000099999@hcx"
          monospace
        />
      </FormField>

      <div
        className="grid-2-col" style={{ gap: "16px" }}
      >
        <FormField label="Registry ID" hint="ABDM registryid / Client ID">
          <TextInput
            value={form.registry_id}
            onChange={(v) => onChange("registry_id", v)}
            placeholder="DEMO_CLIENT or HFR-12345"
          />
        </FormField>
        <FormField label="Scheme Code" hint="e.g. PMJAY">
          <TextInput
            value={form.scheme_code}
            onChange={(v) => onChange("scheme_code", v)}
            placeholder="PMJAY"
          />
        </FormField>
      </div>

      <div
        className="grid-2-col" style={{ gap: "16px" }}
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
              gap: "12px",
              height: "44px",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
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

      <FormField label="Participant Roles">
        <MultiCheckbox
          options={ROLE_OPTIONS}
          value={form.roles || []}
          onChange={(v) => onChange("roles", v)}
        />
      </FormField>

      <FormField label="Linked Registry Codes">
        <MultiCheckbox
          options={LINKED_REGISTRY_OPTIONS}
          value={form.linked_registry_codes || []}
          onChange={(v) => onChange("linked_registry_codes", v)}
        />
      </FormField>

      <div
        className="grid-2-col" style={{ gap: "16px" }}
      >
        <FormField label="State">
          <TextInput
            value={form.state}
            onChange={(v) => onChange("state", v)}
            placeholder="AndhraPradesh"
          />
        </FormField>
        <FormField label="District">
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
        className="grid-2-col" style={{ gap: "16px" }}
      >
        <FormField label="Primary Email">
          <TextInput
            value={form.primary_email}
            onChange={(v) => onChange("primary_email", v)}
            placeholder="hcx@hospital.example"
            type="email"
          />
        </FormField>
        <FormField label="Primary Mobile">
          <TextInput
            value={form.primary_mobile}
            onChange={(v) => onChange("primary_mobile", v)}
            placeholder="9876543210"
          />
        </FormField>
      </div>

      <FormField
        label="HIS Clinic ID"
        hint="Parent HIS clinics.id — required for visit list. Without this, patient visits will not appear."
      >
        <TextInput
          value={form.clinic_id}
          onChange={(v) => onChange("clinic_id", v)}
          placeholder="931"
          type="number"
        />
      </FormField>

      <FormField
        label="Signing Certificate Path (URL)"
        hint="Forwarded to ABDM at registration — not stored locally"
      >
        <TextInput
          value={form.signing_cert_path}
          onChange={(v) => onChange("signing_cert_path", v)}
          placeholder="https://hospital.example/certs/signing.crt"
          type="url"
        />
      </FormField>

      {!isEdit && (
        <>
          <SectionHeader title="RSA Private Key (optional at creation)" />
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
      title={`Upload RSA Key — ${facility?.facility_code}`}
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
            gap: "8px",
            alignItems: "flex-start",
            padding: "10px 14px",
            background: "rgba(239,68,68,0.06)",
            border: "1px solid var(--error)",
            borderRadius: "8px",
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

function FacilityCard({
  facility,
  isDefault,
  onSetDefault,
  onEdit,
  onUploadKey,
}) {
  const abdmOk = facility.abdm_registration?.success;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      style={{
        background: "var(--bg-card)",
        border: `1.5px solid ${isDefault ? "var(--primary)" : "var(--border-color)"}`,
        borderRadius: "16px",
        padding: "20px 24px",
        boxShadow: isDefault
          ? "0 0 0 3px rgba(79,70,229,0.1)"
          : "var(--shadow)",
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
              gap: "8px",
              marginBottom: "4px",
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
                borderRadius: "6px",
              }}
            >
              {facility.facility_code}
            </code>
            {isDefault && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--primary)",
                }}
              >
                <Star size={12} fill="currentColor" /> Default
              </span>
            )}
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
            {facility.clinic_id == null && (
              <span
                className="badge-modern badge-warning"
                title="HIS Clinic ID not set — visit list will be empty"
              >
                No Clinic ID
              </span>
            )}
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
          marginBottom: "16px",
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
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Mail size={11} color="var(--text-muted)" />
            {facility.primary_email}
          </div>
        )}
        {facility.primary_mobile && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Phone size={11} color="var(--text-muted)" />
            {facility.primary_mobile}
          </div>
        )}
        {facility.endpoint_url && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
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
          gap: "8px",
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
              gap: "4px",
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
              gap: "4px",
              fontSize: "11px",
              color: "var(--success)",
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={11} /> ABDM registered
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
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
          {!isDefault && (
            <Button
              size="small"
              variant="outline"
              icon={Star}
              onClick={() => onSetDefault(facility.facility_code)}
            >
              Set Default
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Settings() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [defaultFacility, setDefaultFacility] = useState(
    () => localStorage.getItem(DEFAULT_FACILITY_KEY) || "",
  );

  const [showFacilityDrawer, setShowFacilityDrawer] = useState(false);
  const [editingFacility, setEditingFacility] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [keyDrawerFacility, setKeyDrawerFacility] = useState(null);

  const loadFacilities = async () => {
    setLoading(true);
    try {
      const res = await api.listFacilities();
      const loadedFacilities = res?.facilities || [];
      setFacilities(loadedFacilities);
      
      // Auto-sync the provider_id for the current default facility
      const currentDefault = localStorage.getItem(DEFAULT_FACILITY_KEY);
      if (currentDefault) {
        const selected = loadedFacilities.find((f) => f.facility_code === currentDefault);
        if (selected && selected.hcx_participant_code) {
          localStorage.setItem("nhcx_default_provider_id", selected.hcx_participant_code);
          localStorage.setItem("nhcx_default_facility_name", selected.name || "");
        }
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFacilities();
  }, []);

  const openCreate = () => {
    setEditingFacility(null);
    setForm({ ...EMPTY_FORM });
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
      scheme_code: facility.scheme_code || "",
      environment: facility.environment || "sandbox",
      state: facility.state || "",
      district: facility.district || "",
      endpoint_url: facility.endpoint_url || "",
      primary_email: facility.primary_email || "",
      primary_mobile: facility.primary_mobile || "",
      clinic_id: facility.clinic_id != null ? String(facility.clinic_id) : "",
      signing_cert_path: facility.signing_cert_path || "",
      roles: facility.roles || ["10001"],
      linked_registry_codes: facility.linked_registry_codes || [],
      active: facility.active ?? true,
      private_key_pem: "",
    });
    setFormError(null);
    setShowFacilityDrawer(true);
  };

  const handleFormChange = (key, value) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!form.facility_code || !form.name || !form.hcx_participant_code) {
      setFormError(
        "Facility Code, Name, and HCX Participant Code are required.",
      );
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = { ...form };
      if (!payload.private_key_pem) delete payload.private_key_pem;
      if (payload.clinic_id === "" || payload.clinic_id == null) {
        delete payload.clinic_id;
      } else {
        payload.clinic_id = parseInt(payload.clinic_id, 10);
      }
      if (editingFacility) {
        await api.updateFacility(form.facility_code, payload);
      } else {
        await api.createFacility(payload);
      }
      setShowFacilityDrawer(false);
      await loadFacilities();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = (code) => {
    setDefaultFacility(code);
    localStorage.setItem(DEFAULT_FACILITY_KEY, code);

    const selected = facilities.find((f) => f.facility_code === code);
    if (selected && selected.hcx_participant_code) {
      localStorage.setItem(
        "nhcx_default_provider_id",
        selected.hcx_participant_code,
      );
      localStorage.setItem("nhcx_default_facility_name", selected.name || "");
    } else {
      localStorage.removeItem("nhcx_default_provider_id");
      localStorage.removeItem("nhcx_default_facility_name");
    }
    window.dispatchEvent(new CustomEvent("provider-changed"));
  };

  const defaultFacilityData = facilities.find(
    (f) => f.facility_code === defaultFacility,
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "28px",
        }}
      >
        <PageHeader
          title="Settings"
          subtitle="Manage HCX facility registrations, RSA keys, and ABDM configuration."
        />
        <Button variant="primary" icon={Plus} onClick={openCreate}>
          Register Facility
        </Button>
      </div>

      {facilities.length > 0 && (
        <div
          style={{
            marginBottom: "28px",
            padding: "16px 20px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            <Star size={16} color="var(--primary)" fill="var(--primary)" />{" "}
            Default Facility
          </div>
          <select
            className="input-modern"
            style={{ maxWidth: "360px", fontWeight: 600 }}
            value={defaultFacility}
            onChange={(e) => handleSetDefault(e.target.value)}
          >
            <option value="">— Select default facility —</option>
            {facilities.map((f) => (
              <option key={f.facility_code} value={f.facility_code}>
                {f.facility_code} — {f.name} ({f.environment})
              </option>
            ))}
          </select>
          {defaultFacilityData && (
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              <code style={{ color: "var(--primary)" }}>
                {defaultFacilityData.hcx_participant_code}
              </code>
              {" · "}
              {defaultFacilityData.private_key_set ? (
                <span style={{ color: "var(--success)" }}>Key set ✓</span>
              ) : (
                <span style={{ color: "var(--error)" }}>No key ⚠</span>
              )}
            </div>
          )}
          <button
            onClick={loadFacilities}
            title="Refresh"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              display: "flex",
              marginLeft: "auto",
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex-center py-20 flex-col">
          <div className="spinner mb-4" />
          <p className="text-muted">Loading facilities…</p>
        </div>
      ) : facilities.length === 0 ? (
        <div className="empty-view" style={{ minHeight: "40vh" }}>
          <Building2
            size={52}
            style={{ opacity: 0.25, marginBottom: "16px" }}
          />
          <h3>No Facilities Registered</h3>
          <p
            className="text-muted mt-2"
            style={{ maxWidth: "360px", textAlign: "center" }}
          >
            Register your hospital's HCX facility to enable preauth, claims, and
            eligibility workflows.
          </p>
          <Button
            variant="primary"
            icon={Plus}
            onClick={openCreate}
            style={{ marginTop: "20px" }}
          >
            Register First Facility
          </Button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(100%, 560px), 1fr))",
            gap: "16px",
          }}
        >
          {facilities.map((f) => (
            <FacilityCard
              key={f.facility_code}
              facility={f}
              isDefault={f.facility_code === defaultFacility}
              onSetDefault={handleSetDefault}
              onEdit={openEdit}
              onUploadKey={setKeyDrawerFacility}
            />
          ))}
        </motion.div>
      )}

      <Drawer
        open={showFacilityDrawer}
        onClose={() => setShowFacilityDrawer(false)}
        title={
          editingFacility
            ? `Edit — ${editingFacility.facility_code}`
            : "Register New Facility"
        }
        subtitle={
          editingFacility
            ? "Update facility details and sync to ABDM."
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
