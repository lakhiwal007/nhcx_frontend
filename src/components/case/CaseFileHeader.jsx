import { User, Hash, Building2 } from "lucide-react";

// The "patient chart" header that sits atop the Case Spine.
export default function CaseFileHeader({ patient, caseState, effectiveCase, preauthRef }) {
  const policyNumber =
    caseState.policy?.policyNumber ||
    caseState.policy?.policy_number ||
    effectiveCase.policy_number;
  const payer = caseState.payer?.name || effectiveCase.payer_id;
  // The facility (X-Provider-Id) every call on this case is scoped to — the
  // chart's letterhead. Name preferred, participant code as fallback.
  const facility =
    localStorage.getItem("nhcx_default_facility_name") ||
    localStorage.getItem("nhcx_default_provider_id") ||
    "";

  return (
    <div className="cx-file">
      {facility && (
        <div className="cx-file-facility">
          <Building2 size={11} />
          <span>{facility}</span>
        </div>
      )}
      <div className="cx-file-top">
        <div className="cx-avatar">{patient.name?.[0]?.toUpperCase() || "?"}</div>
        <div style={{ minWidth: 0 }}>
          <h2 className="cx-file-name">{patient.name}</h2>
          <div className="cx-file-sub">
            <span>
              <User size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "-1px" }} />
              {patient.gender || "—"}
            </span>
            {patient.dob && <span>DOB {patient.dob}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "10px 16px 0" }}>
        <span className="cx-chip"><Hash size={10} />Child {patient.child_id}</span>
        {caseState.claim_id && <span className="cx-chip">Claim {caseState.claim_id}</span>}
        {caseState.cashless_case_id && <span className="cx-chip">Case {caseState.cashless_case_id}</span>}
      </div>

      <div className="cx-file-meta">
        <div className="cx-file-cell">
          <span className="cx-file-mono">Payer</span>
          <span className="cx-file-val">{payer || "—"}</span>
        </div>
        <div className="cx-file-cell">
          <span className="cx-file-mono">Policy</span>
          <span className="cx-file-val">{policyNumber || "—"}</span>
        </div>
        <div className="cx-file-cell">
          <span className="cx-file-mono">Preauth Ref</span>
          <span className="cx-file-val">{preauthRef || "—"}</span>
        </div>
        <div className="cx-file-cell">
          <span className="cx-file-mono">ABHA</span>
          <span className="cx-file-val">{patient.abha_number || patient.abha || "—"}</span>
        </div>
      </div>
    </div>
  );
}
