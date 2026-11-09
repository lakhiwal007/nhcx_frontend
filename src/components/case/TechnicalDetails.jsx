import { useState } from "react";
import CopyButton from "../CopyButton";
import FhirBundleModal from "../FhirBundleModal";

export default function TechnicalDetails({ summary = "Details for the IT team", ids = [], bundle, bundleLabel = "View what was exchanged", raw, children }) {
  const [showBundle, setShowBundle] = useState(false);
  const rows = (ids || []).filter((r) => r && r.value != null && r.value !== "");
  if (!rows.length && !bundle && raw == null && !children) return null;
  return (
    <details className="cv-tech">
      <summary>{summary}</summary>
      <div className="cv-tech-body">
        {rows.map((row) => (
          <div key={row.label} className="cv-kv">
            <span>{row.label}</span>
            <span className="cv-tech-val">
              <span className="cv-mono">{String(row.value)}</span>
              <CopyButton value={String(row.value)} iconOnly />
            </span>
          </div>
        ))}
        {children}
        {bundle && (
          <button type="button" className="cv-link" onClick={() => setShowBundle(true)}>
            {bundleLabel}
          </button>
        )}
        {raw != null && <pre className="cv-tech-raw cv-mono">{typeof raw === "string" ? raw : JSON.stringify(raw, null, 2)}</pre>}
      </div>
      {bundle && (
        <FhirBundleModal
          open={showBundle}
          onClose={() => setShowBundle(false)}
          cashlessCaseId={bundle.cashlessCaseId}
          transactionType={bundle.transactionType}
          correlationId={bundle.correlationId}
        />
      )}
    </details>
  );
}
