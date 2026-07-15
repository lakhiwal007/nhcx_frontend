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
  Palette,
  Sun,
  Moon,
  PanelLeft,
  PanelTop,
  Send,
  Inbox,
  Check,
  XCircle,
} from "lucide-react";
import { api, ADMIN_TOKEN_KEY, ALL_FACILITIES_MODE_KEY } from "../api";
import { Button, EmptyState, LoadingBlock } from "./Common";

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
      title={`Upload RSA Key - ${facility?.facility_code}`}
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

function FacilityCard({
  facility,
  onEdit,
  onUploadKey,
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
        <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
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
      </div>
    </motion.div>
  );
}

function RequestAccessForm({ onSubmit }) {
  const [form, setForm] = useState({ facility_name: "", facility_code: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!form.facility_name.trim()) {
      setError("Facility name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="inline-error-banner" style={{ margin: 0, background: "var(--success-light, rgba(34,197,94,0.08))", borderColor: "var(--success)", color: "var(--success)" }}>
        <CheckCircle2 size={16} />
        Request sent. An administrator will onboard this facility and it'll appear in your Active Facility list once approved.
      </div>
    );
  }

  return (
    <div>
      <div className="inline-error-banner" style={{ margin: "0 0 var(--space-3)" }}>
        <AlertCircle size={16} />
        No cashless-enabled facility is linked to your account. Request access below, or contact your administrator.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 220px" }}>
          <FormField label="Facility Name" required>
            <TextInput
              value={form.facility_name}
              onChange={(v) => setForm((p) => ({ ...p, facility_name: v }))}
              placeholder="City General Hospital"
            />
          </FormField>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <FormField label="Facility Code" hint="If you know it">
            <TextInput
              value={form.facility_code}
              onChange={(v) => setForm((p) => ({ ...p, facility_code: v }))}
              placeholder="HOSP-002"
              monospace
            />
          </FormField>
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <FormField label="Notes">
            <TextInput
              value={form.notes}
              onChange={(v) => setForm((p) => ({ ...p, notes: v }))}
              placeholder="Optional context for the admin"
            />
          </FormField>
        </div>
        <Button
          variant="primary"
          icon={Send}
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? "Sending…" : "Request Access"}
        </Button>
      </div>
      {error && (
        <div style={{ marginTop: "var(--space-2)", fontSize: "12px", color: "var(--error)", display: "flex", alignItems: "center", gap: "6px" }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}
    </div>
  );
}

function PendingRequestsPanel({ requests, onResolve }) {
  if (requests.length === 0) return null;

  return (
    <div
      style={{
        marginBottom: "var(--space-5)",
        padding: "16px 20px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
        <Inbox size={16} color="var(--primary)" />
        Pending Facility Requests ({requests.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {requests.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              padding: "10px 14px",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              fontSize: "13px",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{r.facility_name}</div>
              <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                {r.requested_by_name || "Unknown user"}
                {r.facility_code ? ` · ${r.facility_code}` : ""}
                {r.notes ? ` · ${r.notes}` : ""}
              </div>
            </div>
            <Button size="small" variant="outline" icon={Check} onClick={() => onResolve(r.id, "resolved")}>
              Mark Resolved
            </Button>
            <Button size="small" variant="outline" icon={XCircle} onClick={() => onResolve(r.id, "dismissed")}>
              Dismiss
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Settings({
  isAdmin = false,
  sessionFacilities = null,
  allFacilitiesMode = false,
  theme = "light",
  onToggleTheme,
  layoutDirection = "A",
  onToggleLayoutDirection,
}) {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem(ADMIN_TOKEN_KEY) || "",
  );

  const [showFacilityDrawer, setShowFacilityDrawer] = useState(false);
  const [editingFacility, setEditingFacility] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [keyDrawerFacility, setKeyDrawerFacility] = useState(null);

  const [pendingRequests, setPendingRequests] = useState([]);

  const loadPendingRequests = async () => {
    try {
      const res = await api.listFacilityAccessRequests({ status: "pending" });
      setPendingRequests(res?.requests || []);
    } catch (_) {
      setPendingRequests([]);
    }
  };

  useEffect(() => {
    if (isAdmin) loadPendingRequests();
  }, [isAdmin]);

  const handleSubmitAccessRequest = (formValues) =>
    api.createFacilityAccessRequest(formValues);

  const handleResolveAccessRequest = async (id, status) => {
    await api.updateFacilityAccessRequest(id, status);
    loadPendingRequests();
  };

  // Facility administration (register/edit/upload key) is an admin-only
  // surface gated by X-Admin-Token on the backend — GET /facilities lists
  // every facility in the system, not just the user's own, so it is never
  // loaded or rendered for a non-admin user. Regular users get facility
  // *selection* only, via the "Active Facility" section below (sourced from
  // GET /session, which already returns every facility for admins too).
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

  const needsFallbackPicker = Array.isArray(sessionFacilities) && sessionFacilities.length === 0;

  useEffect(() => {
    if (isAdmin || needsFallbackPicker) loadFacilities();
  }, [isAdmin, needsFallbackPicker]);

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
      scheme_code: facility.scheme_code || "PMJAY",
      environment: facility.environment || "sandbox",
      state: facility.state || "",
      district: facility.district || "",
      endpoint_url: facility.endpoint_url || "",
      primary_email: facility.primary_email || "",
      primary_mobile: facility.primary_mobile || "",
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

  return (
    <div>
      {isAdmin && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            marginBottom: "var(--space-4)",
          }}
        >
          <Button variant="primary" icon={Plus} onClick={openCreate}>
            Register Facility
          </Button>
        </div>
      )}

      {isAdmin && <PendingRequestsPanel requests={pendingRequests} onResolve={handleResolveAccessRequest} />}

      {sessionFacilities && (
        <div
          style={{
            marginBottom: "var(--space-5)",
            padding: "16px 20px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
            <Building2 size={16} color="var(--primary)" />
            Active Facility
          </div>

          {sessionFacilities.length === 0 ? (
            facilities.length > 0 ? (
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
              <RequestAccessForm onSubmit={handleSubmitAccessRequest} />
            )
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {sessionFacilities.map((f) => {
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
              {isAdmin && (
                <button
                  onClick={handleEnableAllFacilities}
                  className={`badge-modern ${allFacilitiesMode ? "badge-success" : "badge-info"}`}
                  style={{ cursor: "pointer", border: "none", fontSize: "13px", padding: "8px 14px" }}
                  title="Read-only view spanning every facility - no single facility is acted as"
                >
                  {allFacilitiesMode ? <CheckCircle2 size={13} /> : <Globe size={13} />}
                  View All Facilities (read-only)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginBottom: "var(--space-5)",
          padding: "16px 20px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
          <Palette size={16} color="var(--primary)" />
          Appearance
        </div>
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
      </div>

      {isAdmin && (
        <div
          style={{
            marginBottom: "var(--space-5)",
            padding: "16px 20px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            <Lock size={16} color="var(--primary)" />
            Admin Token
          </div>
          <input
            type="password"
            className="input-modern"
            style={{ maxWidth: "320px" }}
            placeholder="Deployment admin token (for facility mutations)"
            value={adminToken}
            onChange={(e) => handleAdminTokenChange(e.target.value)}
          />
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            Required to register or edit facilities and upload RSA keys.
          </span>
        </div>
      )}

      {isAdmin && loadError && (
        <div className="inline-error-banner">
          <AlertCircle size={16} />
          Could not load facilities. Showing the last known results, if any.
        </div>
      )}

      {isAdmin && (
        loading ? (
          <LoadingBlock text="Loading facilities…" />
        ) : facilities.length === 0 ? (
          <EmptyState
            icon={Building2}
            iconSize={52}
            iconOpacity={0.25}
            title="No Facilities Registered"
            description="Register your hospital's HCX facility to enable preauth, claims, and eligibility workflows."
          >
            <Button
              variant="primary"
              icon={Plus}
              onClick={openCreate}
              style={{ marginTop: "var(--space-5)" }}
            >
              Register First Facility
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
            {facilities.map((f) => (
              <FacilityCard
                key={f.facility_code}
                facility={f}
                onEdit={openEdit}
                onUploadKey={setKeyDrawerFacility}
              />
            ))}
          </motion.div>
        )
      )}

      <Drawer
        open={showFacilityDrawer}
        onClose={() => setShowFacilityDrawer(false)}
        title={
          editingFacility
            ? `Edit - ${editingFacility.facility_code}`
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
