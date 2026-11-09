import { useState } from "react";
import { api } from "../../api";
import { useSend } from "../../hooks/useSend";
import { Drawer } from "../Overlay";
import { Field, TextArea, GenerateKeypairButton, PEM_PLACEHOLDER } from "./fields";

export function KeyUploadDrawer({ facility, onClose, onUploaded }) {
  const [pem, setPem] = useState("");
  const upload = useSend(
    async () => {
      const res = await api.uploadFacilityKey(facility.facility_code, { private_key_pem: pem.trim() });
      onUploaded?.();
      onClose();
      return res;
    },
    { success: "Key uploaded" },
  );
  const close = () => {
    upload.reset();
    onClose();
  };
  return (
    <Drawer
      width={620}
      stack
      open={!!facility}
      onClose={upload.busy ? undefined : close}
      title={`Upload the key for ${facility?.name || facility?.facility_code || ""}`}
      subtitle="The key opens the payer answers NHCX seals with this hospital's certificate. It is stored on the server and never shown again."
      footer={
        <div className="cv-drawer-actions">
          <button type="button" className="cv-btn" onClick={close} disabled={upload.busy}>
            Cancel
          </button>
          <button type="button" className="cv-btn is-primary" disabled={!pem.trim() || upload.busy} onClick={upload.run}>
            {upload.busy ? "Uploading…" : "Upload key"}
          </button>
        </div>
      }
    >
      <div className="st-form">
        <Field label="Private key (PEM)" required htmlFor="key-pem" hint="Either BEGIN RSA PRIVATE KEY or BEGIN PRIVATE KEY is accepted." error={upload.error}>
          <TextArea id="key-pem" rows={10} placeholder={PEM_PLACEHOLDER} value={pem} onChange={setPem} invalid={!!upload.error} />
        </Field>
      </div>
    </Drawer>
  );
}

export function CertificateRotationDrawer({ facility, onClose, onRotated }) {
  const [form, setForm] = useState({ private_key_pem: "", encryption_cert: "" });
  const [result, setResult] = useState(null);
  const rotate = useSend(
    async () => {
      const saved = await api.rotateFacilityCertificate(facility.facility_code, { private_key_pem: form.private_key_pem.trim(), encryption_cert: form.encryption_cert.trim() });
      setResult(saved);
      onRotated?.();
      return saved;
    },
    { success: "Certificate rotated" },
  );
  const ready = form.private_key_pem.trim() && form.encryption_cert.trim();
  return (
    <Drawer
      width={620}
      stack
      open={!!facility}
      onClose={rotate.busy ? undefined : onClose}
      title={`Rotate the certificate for ${facility?.name || facility?.facility_code || ""}`}
      subtitle="Replaces this hospital's key and the certificate NHCX holds for it in one step. Answers the payers sealed with the old certificate still open."
      footer={
        <div className="cv-drawer-actions">
          {result ? (
            <button type="button" className="cv-btn is-primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button type="button" className="cv-btn" onClick={onClose} disabled={rotate.busy}>
                Cancel
              </button>
              <button type="button" className="cv-btn is-primary" disabled={!ready || rotate.busy} onClick={rotate.run}>
                {rotate.busy ? "Rotating…" : "Rotate certificate"}
              </button>
            </>
          )}
        </div>
      }
    >
      {result ? (
        <div className={`cv-notice ${result.registry_matches ? "is-ok" : "is-warn"}`}>
          <div className="cv-notice-body">
            {result.registry_matches
              ? "NHCX now holds the new certificate. Payers that cached the old one for up to a day still get through."
              : "The new key is saved and NHCX took the certificate, but NHCX's registry still shows a different one. Check again later, or rotate again with the same key."}
          </div>
        </div>
      ) : (
        <div className="st-form">
          <div className="st-grid">
            <GenerateKeypairButton facilityCode={facility?.facility_code} facilityName={facility?.name} onGenerated={({ private_key_pem, encryption_cert }) => setForm({ private_key_pem, encryption_cert })} />
            <Field label="Encryption certificate" required wide htmlFor="rot-cert" hint="Base64 or PEM.">
              <TextArea id="rot-cert" rows={4} value={form.encryption_cert} onChange={(v) => setForm((f) => ({ ...f, encryption_cert: v }))} />
            </Field>
            <Field label="Private key (PEM)" required wide htmlFor="rot-key" hint="Must belong to the certificate." error={rotate.error}>
              <TextArea id="rot-key" rows={6} placeholder={PEM_PLACEHOLDER} value={form.private_key_pem} onChange={(v) => setForm((f) => ({ ...f, private_key_pem: v }))} invalid={!!rotate.error} />
            </Field>
          </div>
        </div>
      )}
    </Drawer>
  );
}
