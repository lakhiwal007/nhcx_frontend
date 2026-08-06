const DASH = "—";

const toDate = (v) => {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const formatDate = (v, dash = DASH) => {
  const d = toDate(v);
  if (!d) return dash;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const formatDateShort = (v, dash = DASH) => {
  const d = toDate(v);
  if (!d) return dash;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    ? `${d.getDate()} ${MONTHS[d.getMonth()]}`
    : formatDate(d, dash);
};

export const formatTime = (v, dash = DASH) => {
  const d = toDate(v);
  if (!d) return dash;
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
};

export const formatDateTime = (v, dash = DASH) => {
  const d = toDate(v);
  if (!d) return dash;
  return `${formatDate(d)}, ${formatTime(d)}`;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const formatRelative = (v, dash = DASH) => {
  const d = toDate(v);
  if (!d) return dash;
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(new Date())) / DAY_MS);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  if (days === 1) return "Tomorrow";
  if (days < 0 && days >= -7) return `${-days} days ago`;
  if (days > 0 && days <= 7) return `in ${days} days`;
  return formatDate(d);
};

export const formatRelativePhrase = (v, dash = DASH) => {
  const s = formatRelative(v, dash);
  return /^(Today|Yesterday|Tomorrow)$/.test(s) ? s.toLowerCase() : s;
};

export const daysSince = (v) => {
  const d = toDate(v);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / DAY_MS);
};

export const formatMoney = (v, { dash = DASH, currency = "₹", signed = false } = {}) => {
  if (v === null || v === undefined || v === "") return dash;
  const n = Number(v);
  if (Number.isNaN(n)) return dash;
  const sign = n < 0 ? "-" : signed && n > 0 ? "+" : "";
  const gap = /^[A-Za-z]{2,}$/.test(currency) ? " " : "";
  return `${sign}${currency}${gap}${Math.abs(n).toLocaleString("en-IN")}`;
};

export const CASE_REF_PREFIX = "CASE-";

export const formatCaseRef = (cashlessCaseId, dash = DASH) =>
  cashlessCaseId === null || cashlessCaseId === undefined || cashlessCaseId === ""
    ? dash
    : `${CASE_REF_PREFIX}${cashlessCaseId}`;

export const currencySymbol = (code) => (!code || code === "INR" ? "₹" : code);

export const formatPercent = (v, { dash = DASH } = {}) => {
  if (v === null || v === undefined || v === "") return dash;
  const n = Number(v);
  return Number.isNaN(n) ? dash : `${n.toLocaleString("en-IN")}%`;
};

export const formatNumber = (v, dash = DASH) => {
  if (v === null || v === undefined || v === "") return dash;
  const n = Number(v);
  return Number.isNaN(n) ? dash : n.toLocaleString("en-IN");
};

export const formatPhone = (v, dash = DASH) => {
  if (v == null || v === "") return dash;
  const digits = String(v).replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return String(v);
};

export const formatAge = (dob, dash = DASH) => {
  const d = toDate(dob);
  if (!d) return dash;
  const months = Math.floor((Date.now() - d.getTime()) / (30.44 * DAY_MS));
  if (months < 1) return `${Math.max(0, Math.floor((Date.now() - d.getTime()) / (7 * DAY_MS)))} wks`;
  if (months < 24) return `${months} mos`;
  return `${Math.floor(months / 12)} yrs`;
};

export const humanize = (v, dash = DASH) => {
  if (v == null || v === "") return dash;
  const s = String(v).replace(/[_-]+/g, " ").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
