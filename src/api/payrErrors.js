// PAYR gateway error classification.
//
// PAYR-#### codes appear in two places (per FRONTEND_IMPLEMENTATION_README
// "PAYR Error Codes"): in `errors[].code` on gateway callback payloads, and in
// 422 responses from prepare/submit endpoints. They group into four categories
// that each call for a different UX response. Pure helpers — no React.

const CATEGORY = {
  transport: {
    label: "Gateway communication error",
    guidance:
      "The request could not be delivered to the NHCX gateway. This is usually temporary — retry in a moment.",
    severity: "warning",
    retryable: true,
  },
  authorization: {
    label: "Access denied",
    guidance:
      "This facility's NHCX participant account is not authorized for this action. Contact your NHCX administrator — retrying will not help.",
    severity: "error",
    retryable: false,
  },
  account_blocked: {
    label: "Account suspended",
    guidance:
      "The sender or recipient NHCX account is suspended or blocked. Submissions are disabled until this is resolved — escalate to support.",
    severity: "critical",
    retryable: false,
  },
  protocol: {
    label: "Request could not be processed",
    guidance:
      "The gateway rejected the request as malformed or invalid. This is a system issue, not a data-entry error — escalate to technical support with the code below.",
    severity: "error",
    retryable: false,
  },
};

// Map a numeric PAYR code to its category per the documented ranges.
function categoryForNumber(n) {
  if (n >= 1001 && n <= 1003) return "transport";
  if (n === 1004 || n === 1013) return "authorization";
  if (n === 1016 || n === 1018 || n === 1020) return "account_blocked";
  if ((n >= 1005 && n <= 1012) || n === 1014 || n === 1015 || n === 1017 || n === 1019)
    return "protocol";
  return null;
}

const GUIDANCE = {
  payer: "The payer refused this request. Fix what it names and send again. If you are not sure what to change, share the code below with your IT team.",
  nhcx: "NHCX refused the message before it reached the payer. Nothing on this screen will fix it; share the code below with your IT team.",
};

let guide = null;
let guidePromise = null;
const listeners = new Set();

export function loadPayerGuide() {
  if (!guidePromise) {
    guidePromise = import("../help/payerErrors.json")
      .then((m) => {
        guide = m.default;
        listeners.forEach((fn) => fn());
        return guide;
      })
      .catch(() => {
        guidePromise = null;
        return null;
      });
  }
  return guidePromise;
}

export function onPayerGuideLoaded(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function payerGuideReady() {
  return !!guide;
}

/** Pull a normalized `PAYR-####` or `NHCX-####` token out of any string, or null. */
export function extractPayrCode(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/(PAYR|NHCX)[-\s]?(\d{3,4})/i);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

/**
 * Describe a PAYR code (or any string containing one). Returns null when no
 * PAYR code is present, so callers can fall back to their default rendering.
 */
export function describePayrError(input) {
  const code = extractPayrCode(typeof input === "string" ? input : input?.code || "");
  if (!code) return null;
  const known = guide?.[code];
  if (known) {
    return {
      code,
      category: known.source,
      label: known.title,
      meaning: known.meaning,
      fix: known.fix,
      guidance: GUIDANCE[known.source] || GUIDANCE.payer,
      severity: known.source === "nhcx" ? "warning" : "error",
      retryable: known.source === "nhcx",
    };
  }
  if (code.startsWith("NHCX")) {
    return { code, category: "nhcx", label: "NHCX refused the message", guidance: GUIDANCE.nhcx, severity: "warning", retryable: true };
  }
  const num = Number(code.slice(5));
  const category = categoryForNumber(num);
  const meta = (category && CATEGORY[category]) || CATEGORY.protocol;
  return { code, category: category || "protocol", ...meta };
}

/**
 * Normalize one error (string, or `{code, detail, display, message}`) into a
 * uniform shape for display. PAYR errors carry the friendly label + guidance;
 * the raw code is kept separate for an expandable "Details" affordance. Non-PAYR
 * errors pass through with their human text and a neutral `error` severity.
 */
export function classifyError(err) {
  const human =
    typeof err === "string"
      ? err
      : err?.message || err?.detail || err?.display || null;
  // `code` may be a plain string ("PAYR-1004") or an object ({display}); only a
  // string can carry a PAYR token. Scan both the code and the human text.
  const codeStr = typeof err === "object" && typeof err?.code === "string" ? err.code : "";
  const desc = describePayrError(`${codeStr} ${human || ""}`.trim());
  if (desc) {
    return {
      isPayr: true,
      code: desc.code,
      // Prefer the payer's human message when present; else the category label.
      title: desc.label,
      detail: human && !extractPayrCode(human) ? human : null,
      meaning: desc.meaning || null,
      fix: desc.fix || [],
      guidance: desc.guidance,
      severity: desc.severity,
      retryable: desc.retryable,
    };
  }
  return {
    isPayr: false,
    code: codeStr || null,
    title: human || codeStr || "Error",
    detail: null,
    guidance: null,
    severity: "error",
    retryable: false,
  };
}

/**
 * Enrich a raw error message string with PAYR context for a single-line surface
 * (e.g. a toast). Shows the friendly label + code; keeps any human message.
 */
export function enrichPayrMessage(message) {
  const desc = describePayrError(message);
  if (!desc) return message;
  const hasHumanText = message && message.replace(extractPayrCode(message), "").trim().length > 4;
  if (!hasHumanText) return `${desc.label} (${desc.code})`;
  // Avoid doubling the code when the raw message already contains it.
  return message.includes(desc.code) ? message : `${message} (${desc.code})`;
}
