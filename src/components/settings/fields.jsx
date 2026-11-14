import { useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "../ui/Common";

export const PEM_PLACEHOLDER = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----";

export function Field({ label, required, hint, wide, error, htmlFor, children }) {
  return (
    <div className={`st-field${wide ? " is-wide" : ""}${error ? " is-invalid" : ""}`}>
      <label className="st-field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="st-req"> *</span>}
      </label>
      {children}
      {error ? (
        <span className="st-error" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="st-hint">{hint}</span>
      )}
    </div>
  );
}

export function TextInput({ id, value, onChange, placeholder, type = "text", disabled, monospace, invalid }) {
  return <input id={id} className={`cv-ctl cv-ctl-fill${monospace ? " cv-mono" : ""}`} type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} aria-invalid={invalid || undefined} />;
}

export function TextArea({ id, value, onChange, placeholder, rows = 4, invalid }) {
  return <textarea id={id} className="cv-ctl cv-ctl-fill st-textarea" rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={invalid || undefined} />;
}

export function GenerateKeypairButton({ facilityCode, facilityName, onGenerated }) {
  const [state, setState] = useState({ busy: false, done: false, error: null });
  const generate = async () => {
    setState({ busy: true, done: false, error: null });
    try {
      const { generateFacilityKeypair } = await import("../../lib/certGeneration");
      const { privateKeyPem, encryptionCertBase64 } = await generateFacilityKeypair({ facilityCode, facilityName });
      onGenerated({ private_key_pem: privateKeyPem, encryption_cert: encryptionCertBase64 });
      setState({ busy: false, done: true, error: null });
    } catch (err) {
      setState({ busy: false, done: false, error: err?.message || "The key could not be generated." });
    }
  };
  return (
    <div className="st-field is-wide">
      <div>
        <Button variant="outline" size="small" icon={state.done ? CheckCircle2 : Sparkles} disabled={state.busy} onClick={generate}>
          {state.busy ? "Generating…" : state.done ? "Generated and filled in" : "Generate a new key and certificate"}
        </Button>
      </div>
      <span className="st-hint">Makes a 2048-bit RSA key and a self-signed certificate in this browser and fills in both fields. Nothing leaves this tab until you save.</span>
      {state.error && (
        <span className="st-error" role="alert">
          {state.error}
        </span>
      )}
    </div>
  );
}

export function Stepper({ steps, current }) {
  return (
    <ol className="st-stepper" aria-label="Steps">
      {steps.map((label, i) => (
        <li key={label} className={i < current ? "is-done" : i === current ? "is-current" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="st-stepper-dot">{i < current ? "✓" : i + 1}</span>
          <span className="st-stepper-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
