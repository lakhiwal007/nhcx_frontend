export const ROLE_OPTIONS = [
  { value: "10001", label: "Provider" },
  { value: "10002", label: "Payer" },
  { value: "10003", label: "TPA" },
  { value: "10004", label: "Regulator" },
  { value: "10005", label: "Research" },
  { value: "10006", label: "Member ISNP" },
  { value: "10007", label: "Sponsor" },
  { value: "10008", label: "HIE / HIO / HCX" },
];

export const LINKED_REGISTRY_OPTIONS = [
  { value: "10001", label: "HFR" },
  { value: "10002", label: "NIN" },
  { value: "10003", label: "ROHINI" },
  { value: "10004", label: "Payer" },
];

export const ENVIRONMENT_OPTIONS = [
  { value: "sandbox", label: "Sandbox" },
  { value: "production", label: "Production" },
];

export const OWNERSHIP_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "public", label: "Public (government)" },
  { value: "private", label: "Private" },
];

export const EMPTY_FORM = {
  facility_code: "",
  name: "",
  hcx_participant_code: "",
  registry_id: "",
  ownership: "",
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

export const formFromFacility = (f) => ({
  ...EMPTY_FORM,
  facility_code: f.facility_code,
  name: f.name,
  hcx_participant_code: f.hcx_participant_code || "",
  registry_id: f.registry_id || f.hfr_id || "",
  ownership: f.ownership || "",
  scheme_code: f.scheme_code || "PMJAY",
  environment: f.environment || "sandbox",
  state: f.state || "",
  district: f.district || "",
  endpoint_url: f.endpoint_url || "",
  primary_email: f.primary_email || "",
  primary_mobile: f.primary_mobile || "",
  signing_cert_path: f.signing_cert_path || "",
  encryption_cert: f.encryption_cert || "",
  roles: f.roles || ["10001"],
  linked_registry_codes: f.linked_registry_codes || [],
  active: f.active ?? true,
});

export function validateFacility(form, isEdit) {
  const errors = {};
  const need = (key, message) => {
    if (!String(form[key] || "").trim()) errors[key] = message;
  };
  need("facility_code", "Enter the facility code.");
  need("name", "Enter the hospital's name.");
  if (isEdit) need("hcx_participant_code", "Enter the NHCX participant code.");
  need("registry_id", "Enter the HFR id.");
  need("scheme_code", "Enter the scheme code.");
  need("state", "Enter the state.");
  need("district", "Enter the district.");
  need("endpoint_url", "Enter the callback URL.");
  if (form.endpoint_url && !/^https?:\/\//i.test(form.endpoint_url.trim())) errors.endpoint_url = "The callback URL must start with https://.";
  need("primary_email", "Enter the contact email.");
  if (form.primary_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.primary_email.trim())) errors.primary_email = "That does not look like an email address.";
  if (!/^\d{10}$/.test(form.primary_mobile || "")) errors.primary_mobile = "Enter the 10-digit mobile, with no country code or spaces.";
  need("encryption_cert", "Paste or generate the encryption certificate.");
  if (!(form.roles || []).length) errors.roles = "Pick at least one role.";
  if (!(form.linked_registry_codes || []).length) errors.linked_registry_codes = "Pick at least one registry; ABDM refuses an empty list.";
  return errors;
}

export function facilityPayload(form) {
  const payload = { ...form, hfr_id: form.registry_id };
  if (!payload.private_key_pem) delete payload.private_key_pem;
  if (!payload.hcx_participant_code) delete payload.hcx_participant_code;
  return payload;
}
