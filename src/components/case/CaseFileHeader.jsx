import { useEffect, useState } from "react";
import { User, Hash, Building2 } from "lucide-react";
import { api } from "../../api";

// The identity strip — the patient chart condensed to a single band above the
// stage. Replaces the old left-rail chart card; carries the same data inline.
export default function CaseFileHeader({ patient, caseState, effectiveCase, preauthRef, approvedAmount }) {
  const policyNumber =
    caseState.policy?.policyNumber ||
    caseState.policy?.policy_number ||
    effectiveCase.policy_number;
  const payerName = caseState.payer?.name;
  const payerId = effectiveCase.payer_id;
  // Resumed cases only carry payer_id, not the full payer object from the
  // search dropdown — resolve the friendly name via the cache-first lookup.
  const [resolvedPayerName, setResolvedPayerName] = useState(null);
  useEffect(() => {
    if (payerName || !payerId) return;
    let cancelled = false;
    api
      .getPayerById(payerId)
      .then((p) => !cancelled && setResolvedPayerName(p?.name || null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [payerName, payerId]);
  const payer = payerName || resolvedPayerName || payerId;
  // The facility (X-Provider-Id) every call on this case is scoped to.
  const facility =
    localStorage.getItem("nhcx_default_facility_name") ||
    localStorage.getItem("nhcx_default_provider_id") ||
    "";
  const abha = patient.abha_number || patient.abha;

  return (
    <div className="cx-id">
      <div className="cx-id-person">
        <div className="cx-id-avatar">{patient.name?.[0]?.toUpperCase() || "?"}</div>
        <div style={{ minWidth: 0 }}>
          <h2 className="cx-id-name">{patient.name}</h2>
          <div className="cx-id-meta">
            <span>
              <User size={11} style={{ marginRight: 4 }} />
              {patient.gender || "-"}
            </span>
            {patient.dob && <span>DOB {patient.dob}</span>}
            {facility && (
              <span className="cx-id-facility">
                <Building2 size={11} />
                {facility}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="cx-id-chips">
        <span className="cx-chip"><Hash size={10} />Child {patient.child_id}</span>
        {caseState.claim_id && <span className="cx-chip">Claim {caseState.claim_id}</span>}
        {caseState.cashless_case_id && <span className="cx-chip">Case {caseState.cashless_case_id}</span>}
      </div>

      <div className="cx-id-facts">
        <div className="cx-id-fact">
          <span className="cx-file-mono">Payer</span>
          <span className="cx-file-val">{payer || "-"}</span>
        </div>
        <div className="cx-id-fact">
          <span className="cx-file-mono">Policy</span>
          <span className="cx-file-val">{policyNumber || "-"}</span>
        </div>
        <div className="cx-id-fact">
          <span className="cx-file-mono">Preauth Ref</span>
          <span className="cx-file-val">{preauthRef || "-"}</span>
        </div>
        <div className="cx-id-fact">
          <span className="cx-file-mono">ABHA</span>
          <span className="cx-file-val">{abha || "-"}</span>
        </div>
        {approvedAmount != null && (
          <div className="cx-id-fact">
            <span className="cx-file-mono">Approved</span>
            <span className="cx-file-val" style={{ color: "var(--success)", fontWeight: 800 }}>
              ₹{approvedAmount.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
