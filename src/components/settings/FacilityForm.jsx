import { Field, TextInput, TextArea, GenerateKeypairButton, PEM_PLACEHOLDER } from "./fields";
import { ROLE_OPTIONS, LINKED_REGISTRY_OPTIONS, ENVIRONMENT_OPTIONS, OWNERSHIP_OPTIONS } from "./facilityModel";

function Checks({ id, options, value = [], onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="st-checks" id={id}>
      {options.map((o) => (
        <label key={o.value} className="st-check">
          <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function Group({ title, intro, children }) {
  return (
    <fieldset className="st-group">
      <legend className="st-group-title">{title}</legend>
      {intro && <p className="st-group-intro">{intro}</p>}
      <div className="st-grid">{children}</div>
    </fieldset>
  );
}

function Select({ id, value, onChange, options }) {
  return (
    <select id={id} className="cv-ctl cv-ctl-fill" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export default function FacilityForm({ form, errors = {}, onChange, isEdit }) {
  const f = (key, label, props = {}) => (
    <Field key={key} label={label} htmlFor={`fac-${key}`} error={errors[key]} {...props.field}>
      <TextInput id={`fac-${key}`} value={form[key]} onChange={(v) => onChange(key, props.clean ? props.clean(v) : v)} invalid={!!errors[key]} {...props.input} />
    </Field>
  );
  return (
    <div className="st-form">
      <Group title="The hospital" intro="How NHCX and the payers know this hospital.">
        {f("facility_code", "Facility code", { field: { required: true, hint: isEdit ? "Cannot change after registration." : "The hospital's clinic id in the HIS, e.g. HOSP-001" }, input: { placeholder: "HOSP-001", disabled: isEdit, monospace: true } })}
        {f("name", "Hospital name", { field: { required: true }, input: { placeholder: "City General Hospital" } })}
        {f("registry_id", "HFR id", { field: { required: true, hint: "Health Facility Registry id." }, input: { placeholder: "IN1910000151", monospace: true } })}
        <Field label="Hospital type" htmlFor="fac-ownership" hint="Some PMJAY packages are public only.">
          <Select id="fac-ownership" value={form.ownership} onChange={(v) => onChange("ownership", v)} options={OWNERSHIP_OPTIONS} />
        </Field>
        {f("scheme_code", "Scheme code", { field: { required: true, hint: "e.g. PMJAY" }, input: { placeholder: "PMJAY" } })}
        <Field label="Environment" htmlFor="fac-environment">
          <Select id="fac-environment" value={form.environment} onChange={(v) => onChange("environment", v)} options={ENVIRONMENT_OPTIONS} />
        </Field>
        {f("state", "State", { field: { required: true }, input: { placeholder: "AndhraPradesh" } })}
        {f("district", "District", { field: { required: true }, input: { placeholder: "Krishna" } })}
        {f("hcx_participant_code", "NHCX participant code", { field: { required: isEdit, wide: true, hint: isEdit ? "The code ABDM gave this hospital, e.g. 1000099999@hcx" : "Leave blank. ABDM assigns it." }, input: { placeholder: isEdit ? "1000099999@hcx" : "Assigned by ABDM", monospace: true } })}
        <Field label="Status" htmlFor="fac-active">
          <label className="st-check st-inline-check">
            <input id="fac-active" type="checkbox" checked={!!form.active} onChange={(e) => onChange("active", e.target.checked)} />
            Active
          </label>
        </Field>
      </Group>

      <Group title="Contact and callback" intro="Where NHCX sends payer answers and who it writes to.">
        {f("endpoint_url", "Callback URL", { field: { required: true, wide: true, hint: "https, a domain name, hosted in India. NHCX delivers every payer answer here." }, input: { placeholder: "https://hospital.example/hcx/callback", type: "url" } })}
        {f("primary_email", "Contact email", { field: { required: true }, input: { placeholder: "hcx@hospital.example", type: "email" } })}
        {f("primary_mobile", "Contact mobile", { field: { required: true, hint: "10 digits; on production the passcodes go here." }, input: { placeholder: "9876543210", monospace: true }, clean: (v) => v.replace(/\D/g, "").slice(0, 10) })}
      </Group>

      <Group title="ABDM registration" intro="What ABDM records about the participant.">
        <Field label="Participant roles" required wide error={errors.roles} htmlFor="fac-roles">
          <Checks id="fac-roles" options={ROLE_OPTIONS} value={form.roles || []} onChange={(v) => onChange("roles", v)} />
        </Field>
        <Field label="Linked registries" required wide error={errors.linked_registry_codes} htmlFor="fac-registries" hint="At least one.">
          <Checks id="fac-registries" options={LINKED_REGISTRY_OPTIONS} value={form.linked_registry_codes || []} onChange={(v) => onChange("linked_registry_codes", v)} />
        </Field>
        {f("signing_cert_path", "Signing certificate URL", { field: { wide: true, hint: "Sent to ABDM. Not stored here." }, input: { placeholder: "https://hospital.example/certs/signing.crt", type: "url" } })}
      </Group>

      <Group title="Encryption" intro="Certificate and key for payer answers.">
        {!isEdit && (
          <GenerateKeypairButton
            facilityCode={form.facility_code}
            facilityName={form.name}
            onGenerated={({ private_key_pem, encryption_cert }) => {
              onChange("encryption_cert", encryption_cert);
              onChange("private_key_pem", private_key_pem);
            }}
          />
        )}
        <Field label="Encryption certificate" required wide error={errors.encryption_cert} htmlFor="fac-cert" hint="Base64 or PEM. ABDM refuses a registration without it.">
          <TextArea id="fac-cert" rows={4} value={form.encryption_cert} onChange={(v) => onChange("encryption_cert", v)} placeholder="TUlJQzJqQ0NBY0tnQXdJQkFnSUJBVEFOQmdrcWhraUc5dzBCQVFzRkFEQVlNUll3..." invalid={!!errors.encryption_cert} />
        </Field>
        {!isEdit && (
          <Field label="Private key (PEM)" wide htmlFor="fac-key" hint="Optional. Include the BEGIN and END lines.">
            <TextArea id="fac-key" rows={6} value={form.private_key_pem} onChange={(v) => onChange("private_key_pem", v)} placeholder={PEM_PLACEHOLDER} />
          </Field>
        )}
      </Group>
    </div>
  );
}
