const DAY = 86400000;

export function certDaysLeft(facility) {
  if (!facility?.cert_expires_at) return null;
  return Math.floor((new Date(facility.cert_expires_at).getTime() - Date.now()) / DAY);
}

export function facilityIssues(facility, missingHpr = 0) {
  const issues = [];
  if (!facility) return issues;
  if (!facility.abdm_registered) issues.push({ id: "abdm", tone: "bad", text: "Not registered with NHCX.", action: "onboard" });
  if (!facility.private_key_set) issues.push({ id: "key", tone: "bad", text: "Key missing. Payer answers can't be read.", action: "key" });
  const days = certDaysLeft(facility);
  if (days != null && days < 0) issues.push({ id: "cert", tone: "bad", text: "Certificate has ended.", action: "rotate" });
  else if (days != null && days <= 60) issues.push({ id: "cert", tone: "warn", text: `Certificate ends in ${days} ${days === 1 ? "day" : "days"}.`, action: "rotate" });
  if (missingHpr > 0) issues.push({ id: "hpr", tone: "warn", text: `${missingHpr} ${missingHpr === 1 ? "doctor has" : "doctors have"} no HPR id.`, action: "doctors" });
  return issues;
}

export function facilityStatus(issues) {
  if (issues.some((i) => i.tone === "bad")) return { label: "Not set up", tone: "is-bad", rank: 0 };
  if (issues.length) return { label: "Needs attention", tone: "is-warn", rank: 1 };
  return { label: "Ready for claims", tone: "is-ok", rank: 2 };
}
