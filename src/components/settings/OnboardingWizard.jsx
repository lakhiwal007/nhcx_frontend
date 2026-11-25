import { useState } from "react";
import { api, callbackBaseUrl } from "../../api";
import { useSend } from "../../hooks/util/useSend";
import { Drawer } from "../ui/Overlay";
import { Field, TextInput, TextArea, GenerateKeypairButton, Stepper } from "./fields";

const STEPS = ["Hospital", "First passcode", "Certificate", "Second passcode"];

export default function OnboardingWizard({ start, onClose, onDone }) {
  const [step, setStep] = useState(start?.step ?? 0);
  const [form, setForm] = useState(() => ({ scheme_code: "PMJAY", endpoint_url: callbackBaseUrl(), ...start?.facility }));
  const [transactionId, setTransactionId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [sentTo, setSentTo] = useState(null);
  const [errors, setErrors] = useState({});
  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const checkHospital = () => {
    const next = {};
    if (!form.facility_code) next.facility_code = "Enter the facility code.";
    if (!form.name) next.name = "Enter the hospital's name.";
    if (!form.registry_id) next.registry_id = "Enter the HFR id.";
    if (!form.primary_email) next.primary_email = "Enter the email.";
    if (!/^\d{10}$/.test(form.primary_mobile || "")) next.primary_mobile = "The 10-digit mobile on the HFR record.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const create = useSend(
    async () => {
      if (!checkHospital()) return undefined;
      const res = await api.startFacilityOnboarding({ facility_code: form.facility_code, registry_id: form.registry_id, primary_mobile: form.primary_mobile, primary_email: form.primary_email });
      setForm((p) => ({ ...p, hcx_participant_code: res.participant_code }));
      setTransactionId(res.transaction_id);
      setPasscode("");
      setSentTo(form.primary_mobile);
      setStep(1);
      return res;
    },
    { success: "Passcode sent" },
  );

  const confirmCreate = useSend(
    async () => {
      const res = await api.confirmFacilityOnboarding({
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
      return res;
    },
    { success: "Hospital created on NHCX" },
  );

  const register = useSend(
    async () => {
      const next = {};
      if (!form.encryption_cert) next.encryption_cert = "Generate or paste the certificate first.";
      if (!form.endpoint_url) next.endpoint_url = "Enter the callback URL.";
      setErrors(next);
      if (Object.keys(next).length) return undefined;
      const res = await api.registerFacilityOnboarding(form.facility_code, { encryption_cert: form.encryption_cert, private_key_pem: form.private_key_pem || undefined, endpoint_url: form.endpoint_url });
      setTransactionId(res.transaction_id);
      setPasscode("");
      setSentTo(form.primary_mobile || "the mobile on the HFR record");
      setStep(3);
      return res;
    },
    { success: "Passcode sent" },
  );

  const activate = useSend(
    async () => {
      const res = await api.activateFacilityOnboarding(form.facility_code, { transaction_id: transactionId, passcode: passcode.trim() });
      setStep(4);
      await onDone?.();
      return res;
    },
    { success: "Registered on NHCX production" },
  );

  const sends = [create, confirmCreate, register, activate];
  const active = sends[step] || null;
  const busy = sends.some((s) => s.busy);
  const primary =
    step === 0
      ? { label: "Create on NHCX and send the passcode", onClick: create.run }
      : step === 1
        ? { label: "Confirm the passcode", onClick: confirmCreate.run, disabled: !passcode.trim() }
        : step === 2
          ? { label: "Register the certificate and send the passcode", onClick: register.run }
          : step === 3
            ? { label: "Confirm the passcode", onClick: activate.run, disabled: !passcode.trim() }
            : null;

  const resend = step === 1 ? create : step === 3 ? register : null;

  return (
    <Drawer
      width={640}
      stack
      open
      onClose={busy ? undefined : onClose}
      title="Register on NHCX production"
      subtitle="Two steps, each with a passcode sent to the HFR mobile."
      footer={
        <div className="cv-drawer-actions">
          <button type="button" className="cv-btn" onClick={onClose} disabled={busy}>
            {step === 4 ? "Close" : "Cancel"}
          </button>
          {resend && (
            <button type="button" className="cv-btn" disabled={busy} onClick={resend.run}>
              Send a new passcode
            </button>
          )}
          {primary && (
            <button type="button" className="cv-btn is-primary" disabled={busy || primary.disabled} onClick={primary.onClick}>
              {busy ? "Working…" : primary.label}
            </button>
          )}
        </div>
      }
    >
      <div className="st-form">
        <Stepper steps={STEPS} current={step} />
        {active?.error && (
          <div className="cv-notice is-bad" role="alert">
            <div className="cv-notice-body">{active.error}</div>
          </div>
        )}

        {step === 0 && (
          <div className="st-grid">
            <Field label="Facility code" required htmlFor="ob-code" hint="The hospital's clinic id in the HIS" error={errors.facility_code}>
              <TextInput id="ob-code" value={form.facility_code} onChange={(v) => set("facility_code", v)} disabled={!!start?.facility?.facility_code} monospace invalid={!!errors.facility_code} />
            </Field>
            <Field label="Hospital name" required htmlFor="ob-name" error={errors.name}>
              <TextInput id="ob-name" value={form.name} onChange={(v) => set("name", v)} invalid={!!errors.name} />
            </Field>
            <Field label="HFR id" required htmlFor="ob-hfr" hint="Must be verified in the Health Facility Registry" error={errors.registry_id}>
              <TextInput id="ob-hfr" value={form.registry_id} onChange={(v) => set("registry_id", v)} placeholder="IN2910000001" monospace invalid={!!errors.registry_id} />
            </Field>
            <Field label="Mobile on the HFR record" required htmlFor="ob-mobile" hint="Must match HFR exactly" error={errors.primary_mobile}>
              <TextInput id="ob-mobile" value={form.primary_mobile} onChange={(v) => set("primary_mobile", v.replace(/\D/g, "").slice(0, 10))} placeholder="9876543210" monospace invalid={!!errors.primary_mobile} />
            </Field>
            <Field label="Email" required htmlFor="ob-email" error={errors.primary_email}>
              <TextInput id="ob-email" value={form.primary_email} onChange={(v) => set("primary_email", v)} placeholder="hcx@hospital.example" type="email" invalid={!!errors.primary_email} />
            </Field>
            <Field label="State" htmlFor="ob-state">
              <TextInput id="ob-state" value={form.state} onChange={(v) => set("state", v)} />
            </Field>
            <Field label="District" htmlFor="ob-district">
              <TextInput id="ob-district" value={form.district} onChange={(v) => set("district", v)} />
            </Field>
          </div>
        )}

        {(step === 1 || step === 3) && (
          <>
            {step === 1 && (
              <div className="cv-kv">
                <span>NHCX participant code</span>
                <span className="cv-mono">{form.hcx_participant_code}</span>
              </div>
            )}
            <div className="cv-notice is-info">
              <div className="cv-notice-body">
                NHCX sent a passcode to {sentTo || "the mobile on the HFR record"} to {step === 1 ? "confirm the hospital's creation" : "confirm the certificate and callback URL"}. It is valid for 24 hours.
              </div>
            </div>
            <Field label="Passcode" required htmlFor="ob-passcode">
              <TextInput id="ob-passcode" value={passcode} onChange={setPasscode} placeholder="From the SMS" monospace />
            </Field>
          </>
        )}

        {step === 2 && (
          <div className="st-grid">
            <div className="st-field is-wide">
              Created as <span className="cv-mono">{form.hcx_participant_code}</span>. Now register the certificate NHCX seals answers with, and the address it delivers them to.
            </div>
            <GenerateKeypairButton facilityCode={form.facility_code} facilityName={form.name} onGenerated={({ private_key_pem, encryption_cert }) => setForm((p) => ({ ...p, private_key_pem, encryption_cert }))} />
            <Field label="Encryption certificate" required wide htmlFor="ob-cert" hint="Base64 or PEM" error={errors.encryption_cert}>
              <TextArea id="ob-cert" rows={4} value={form.encryption_cert} onChange={(v) => set("encryption_cert", v)} invalid={!!errors.encryption_cert} />
            </Field>
            <Field label="Private key (PEM)" wide htmlFor="ob-key" hint="Leave empty to keep the stored key">
              <TextArea id="ob-key" rows={4} value={form.private_key_pem} onChange={(v) => set("private_key_pem", v)} />
            </Field>
            <Field label="Callback URL" required wide htmlFor="ob-url" hint="https, a domain name with no IP or port, hosted in India" error={errors.endpoint_url}>
              <TextInput id="ob-url" value={form.endpoint_url} onChange={(v) => set("endpoint_url", v)} monospace invalid={!!errors.endpoint_url} />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="cv-notice is-ok">
            <div className="cv-notice-body">
              {form.name || form.facility_code} is registered on NHCX production as <span className="cv-mono">{form.hcx_participant_code}</span>, and NHCX holds this certificate.
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
