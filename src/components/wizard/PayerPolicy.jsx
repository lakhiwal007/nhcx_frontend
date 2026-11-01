import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, AlertTriangle, CheckCircle2, Radar, RefreshCw } from "lucide-react";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { Button, InfoTip, NextStep } from "../Common";
import Dropdown from "../Dropdown";
import PayerName from "../PayerName";
import { useTips } from "../../help/tips.js";
import { POLICY_CHANGE_RESET } from "../case/caseStages";
import ChangePolicyModal from "./ChangePolicyModal";
import { formatMoney, formatDate, humanize } from "../../format.js";

const IDENTIFIER_TYPE_LABELS = {
  AbhaNumber: "ABHA Number",
  MemberId: "Member ID",
  MobileNo: "Mobile Number",
};

const IDENTIFIER_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "AbhaNumber", label: IDENTIFIER_TYPE_LABELS.AbhaNumber },
  { value: "MemberId", label: IDENTIFIER_TYPE_LABELS.MemberId },
  { value: "MobileNo", label: IDENTIFIER_TYPE_LABELS.MobileNo },
];

// The payer chips only earn their row once the list is long enough to need them.
const PAYER_CHIPS_FROM = 4;

const policyNumberOf = (policy) => policy?.policy_number;
const sumInsuredOf = (policy) => policy?.sum_insured;

const payerFromPolicy = (policy) => {
  const code = policy?.payer_id;
  if (!code) return null;
  return { code, name: policy?.payer_name || code };
};

const isActiveStatus = (status) => /^(active|in.?force)/i.test(status || "");

const isExpired = (policy) => {
  if (!policy?.effective_to) return false;
  const end = new Date(policy.effective_to);
  if (Number.isNaN(end.getTime())) return false;
  end.setHours(23, 59, 59, 999);
  return end < new Date();
};

// Could pay for this admission, as far as the lookup shows. A registry row often
// has no status at all, so only a status that says otherwise rules a policy out.
const isUsable = (policy) => !isExpired(policy) && (!policy?.status || isActiveStatus(policy.status));

// A case resumed in another browser has no saved policy object, only the number
// and payer the case itself carries.
const casePolicyOf = (caseState, cashlessCase) =>
  caseState.policy ||
  (cashlessCase?.policy_number
    ? { policy_number: cashlessCase.policy_number, payer_id: cashlessCase.payer_id, payer_name: caseState.payer?.name }
    : null);

const validityOf = (policy) => {
  const from = policy?.effective_from && formatDate(policy.effective_from);
  const to = policy?.effective_to && formatDate(policy.effective_to);
  if (isExpired(policy)) return `Ended ${to}`;
  if (from && to) return `${from} – ${to}`;
  if (to) return `Until ${to}`;
  return from ? `From ${from}` : null;
};

// Columns no row has a value for are left out, so a sparse registry answer does
// not leave empty columns behind.
const columnsFor = (rows) => {
  const shown = {
    member: rows.some((p) => p.member_id),
    validity: rows.some(validityOf),
    status: rows.some((p) => p.status),
    amount: rows.some(sumInsuredOf),
  };
  const template = [
    "16px",
    "minmax(0, 2fr)",
    "minmax(0, 1.3fr)",
    shown.member && "minmax(0, 1fr)",
    shown.validity && "178px",
    shown.status && "78px",
    shown.amount && "96px",
  ];
  return { shown, template: template.filter(Boolean).join(" ") };
};

export default function PayerPolicy({ ctx }) {
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const { patient, caseState, updateCaseState, caseClosed, cashlessCase, setCashlessCase } = ctx;
  const { showTips } = useTips();
  const locked = readOnly || caseClosed;

  const [payerFilter, setPayerFilter] = useState(null);

  const [policies, setPolicies] = useState([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [policyError, setPolicyError] = useState(null);
  const [searchDone, setSearchDone] = useState(false);
  const [foundBy, setFoundBy] = useState(null);
  const [selectedPolicy, setSelectedPolicy] = useState(() => casePolicyOf(caseState, cashlessCase));
  const [pendingPolicy, setPendingPolicy] = useState(null);
  const [identifierType, setIdentifierType] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberIdOnFile, setMemberIdOnFile] = useState("");

  const applyPolicy = (policy) => {
    setSelectedPolicy(policy);
    if (caseState.cashless_case_id) setCashlessCase(null);
    updateCaseState({ policy, payer: payerFromPolicy(policy), ...POLICY_CHANGE_RESET });
  };

  const fetchPolicies = async (idType, typedMemberId = "") => {
    if (!patient?.child_id) return;
    setLoadingPolicies(true);
    setPolicyError(null);
    setPolicies([]);
    setPayerFilter(null);
    setFoundBy(null);
    try {
      const body = { child_id: patient.child_id, force_refresh: false };
      if (caseState.admission_id) body.admission_id = caseState.admission_id;
      const trimmedMemberId = typedMemberId.trim();
      if (trimmedMemberId) body.member_id = trimmedMemberId;
      else if (idType) body.identifier_type = idType;
      const res = await api.fetchPolicies(body);
      const found = res?.data?.policies || [];
      setPolicies(found);
      setSearchDone(true);
      const used = res?.data?.identifier_used;
      if (used?.type === "MemberId" && used.value) setMemberIdOnFile(used.value);
      if (found.length) setFoundBy(IDENTIFIER_TYPE_LABELS[used?.type] || null);
      // One policy that could pay is picked for the user, who still has to
      // press Continue. Never done on a case that already exists.
      const usable = found.filter(isUsable);
      if (usable.length === 1 && !selectedPolicy && !caseState.cashless_case_id) applyPolicy(usable[0]);
    } catch (err) {
      setPolicyError(err.message);
    } finally {
      setLoadingPolicies(false);
    }
  };

  useEffect(() => {
    if (locked || !patient?.child_id || policies.length || selectedPolicy) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) fetchPolicies("");
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.child_id]);

  const selectedNumber = policyNumberOf(selectedPolicy);

  // The case's own policy stays on the list even when a search does not return it.
  const listedPolicies =
    selectedPolicy && !policies.some((policy) => policyNumberOf(policy) === selectedNumber)
      ? [selectedPolicy, ...policies]
      : policies;

  const discoveredPayers = [];
  for (const policy of listedPolicies) {
    const payer = payerFromPolicy(policy);
    if (payer && !discoveredPayers.some((p) => p.code === payer.code)) {
      discoveredPayers.push(payer);
    }
  }

  const visiblePolicies = payerFilter
    ? listedPolicies.filter((policy) => payerFromPolicy(policy)?.code === payerFilter)
    : listedPolicies;

  const handlePayerFilter = (code) => {
    setPayerFilter(payerFilter === code ? null : code);
  };

  const handleIdentifierTypeChange = (idType) => {
    setIdentifierType(idType);
    const nextMemberId = idType === "MemberId" ? memberId || memberIdOnFile : "";
    setMemberId(nextMemberId);
    fetchPolicies(idType, nextMemberId);
  };

  const handleMemberIdSearch = () => {
    fetchPolicies("MemberId", memberId);
  };

  const handlePolicySelect = (policy) => {
    if (locked || policyNumberOf(policy) === selectedNumber) return;
    if (caseState.cashless_case_id) setPendingPolicy(policy);
    else applyPolicy(policy);
  };

  const confirmPolicyChange = () => {
    applyPolicy(pendingPolicy);
    setPendingPolicy(null);
  };

  const effectivePayer = payerFromPolicy(selectedPolicy);

  const canDiscover = !locked;
  const openDiscovery = () => {
    const typed = identifierType === "MemberId" ? memberId.trim() : "";
    navigate(typed ? `../discover?member_id=${encodeURIComponent(typed)}` : "../discover");
  };
  const discoverButton = (label) => (
    <button type="button" className="pp-btn" onClick={openDiscovery}>
      <Radar size={14} /> {label}
    </button>
  );

  const handleNext = () => {
    if (selectedPolicy && effectivePayer) {
      navigate("../prep");
    }
  };

  const policyCount = visiblePolicies.length;
  const savedOnly = !!selectedPolicy && policies.length === 0 && !loadingPolicies && !policyError;
  const showList = !loadingPolicies && !policyError && policyCount > 0;
  const columns = columnsFor(visiblePolicies);
  const typedMemberId = identifierType === "MemberId" ? memberId.trim() : "";
  const headTitle = savedOnly
    ? "Policy on this case"
    : showList
      ? `${policyCount} ${policyCount === 1 ? "policy" : "policies"}`
      : "Policies";
  const headNote = loadingPolicies
    ? "Searching the patient's policies…"
    : policyError
      ? "Search failed"
      : savedOnly
        ? searchDone && "No other policies found"
        : showList && foundBy && `found by ${foundBy}`;
  const overBill = (sumInsured) =>
    caseState.estimatedBillAmount > 0 && sumInsured > 0 && sumInsured < caseState.estimatedBillAmount;

  return (
    <div className="wizard-step">
      <div className="pp-panel">
        <div className="pp-head">
          <div className="pp-head-line">
            <h2 className="pp-title">{headTitle}</h2>
            {headNote && <span className="pp-muted">{headNote}</span>}
            <InfoTip
              title="How policies are found"
              text="We look for policies an insurer has linked to the patient's ABHA number, member ID or mobile. Pick the one that pays for this admission."
            />
          </div>
          {!locked && (
            <div className="pp-searchby">
              {savedOnly && (
                <button type="button" className="pp-btn" onClick={() => fetchPolicies(identifierType, memberId)}>
                  <RefreshCw size={14} /> Search again
                </button>
              )}
              <span className="pp-searchby-key">
                Search by
                <InfoTip
                  title="Search by"
                  text="Auto tries the ABHA number, then the member ID, then the mobile number. Choose Member ID to type the number printed on the insurance card."
                />
              </span>
              <div className="pp-searchby-select">
                <Dropdown
                  compact
                  ariaLabel="Search policies by identifier"
                  value={identifierType}
                  options={IDENTIFIER_OPTIONS}
                  onChange={(v) => !loadingPolicies && handleIdentifierTypeChange(v)}
                />
              </div>
              {identifierType === "MemberId" && (
                <>
                  <input
                    className="input-modern pp-input pp-member-input"
                    placeholder={memberIdOnFile ? "Member ID" : "Type a member ID…"}
                    aria-label="Member ID"
                    value={memberId}
                    onChange={(e) => setMemberId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleMemberIdSearch();
                    }}
                  />
                  <button
                    type="button"
                    className="pp-btn"
                    disabled={loadingPolicies || !memberId.trim()}
                    onClick={handleMemberIdSearch}
                  >
                    Search
                  </button>
                </>
              )}
              {showList && discoverButton("Discover with a payer")}
            </div>
          )}
        </div>

        {!loadingPolicies && listedPolicies.length >= PAYER_CHIPS_FROM && discoveredPayers.length > 1 && (
          <div className="pp-payerbar">
            <span className="pp-payerbar-key">Payer</span>
            <button
              type="button"
              className={`wq-chip${payerFilter === null ? " is-on" : ""}`}
              onClick={() => setPayerFilter(null)}
            >
              All
              <span className="wq-chip-count">{listedPolicies.length}</span>
            </button>
            {discoveredPayers.map((payer) => (
              <button
                type="button"
                key={payer.code}
                className={`wq-chip${payerFilter === payer.code ? " is-on" : ""}`}
                onClick={() => handlePayerFilter(payer.code)}
                title={payer.code}
              >
                <PayerName id={payer.code} name={payer.name === payer.code ? undefined : payer.name} />
                <span className="wq-chip-count">
                  {listedPolicies.filter((p) => payerFromPolicy(p)?.code === payer.code).length}
                </span>
              </button>
            ))}
          </div>
        )}

        {locked && listedPolicies.length === 0 ? (
          <div className="pp-state">
            <div>
              <div className="pp-state-title">{readOnly ? "View only" : "Case settled"}</div>
              <div className="pp-muted">
                {readOnly
                  ? "Looking up a patient's policies asks the payer, which this account cannot do."
                  : "This case is settled, so its policy is not looked up again."}
              </div>
            </div>
          </div>
        ) : loadingPolicies ? (
          <div className="pp-list" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="pp-row is-skeleton">
                <span className="skeleton-line" style={{ width: 16, height: 16, borderRadius: "50%" }} />
                <div style={{ flex: 1 }}>
                  <span className="skeleton-line" style={{ width: "40%", height: 12 }} />
                  <span className="skeleton-line" style={{ width: "65%", height: 10, marginTop: 8 }} />
                </div>
              </div>
            ))}
          </div>
        ) : policyError ? (
          <NextStep
            tone="bad"
            className="pp-next"
            title="Couldn't reach the insurance registry"
            steps={[
              "Press Retry. A failed lookup is often a short network problem.",
              "If it keeps failing, ask the insurer directly with Discover with a payer.",
            ]}
            actions={
              <>
                <button type="button" className="pp-btn" onClick={() => fetchPolicies(identifierType, memberId)}>
                  Retry
                </button>
                {canDiscover && discoverButton("Discover with a payer")}
              </>
            }
          >
            {policyError}
          </NextStep>
        ) : policyCount === 0 ? (
          <NextStep
            tone="warn"
            className="pp-next"
            title={`No policy found${
              typedMemberId
                ? ` for member ID ${typedMemberId}`
                : identifierType
                  ? ` by ${IDENTIFIER_TYPE_LABELS[identifierType]}`
                  : patient?.name
                    ? ` for ${patient.name}`
                    : ""
            }`}
            actions={
              <>
                {identifierType !== "MemberId" && (
                  <button type="button" className="pp-btn" onClick={() => handleIdentifierTypeChange("MemberId")}>
                    Search by member ID
                  </button>
                )}
                {identifierType && (
                  <button type="button" className="pp-btn" onClick={() => handleIdentifierTypeChange("")}>
                    Try all identifiers
                  </button>
                )}
                {canDiscover && discoverButton("Discover with a payer")}
              </>
            }
          >
            {typedMemberId
              ? "Check the member ID against the card for a typo. If it is right, ask the insurer directly with Discover."
              : "Many policies are not linked to an ABHA or mobile yet, so the patient may still be insured. Ask for the insurance card or e-card; a child's cover is often on a parent's card."}
            {showTips && (
              <div className="pp-next-tip">No insurance at all? Treat them as a cash patient. No cashless case is needed.</div>
            )}
          </NextStep>
        ) : (
          <div
            className="pp-list"
            role="radiogroup"
            aria-label="Policies"
            style={{ "--pp-cols": columns.template }}
          >
            <div className="pp-list-head" aria-hidden="true">
              <span />
              <span>Policy</span>
              <span>Payer</span>
              {columns.shown.member && <span>Member ID</span>}
              {columns.shown.validity && <span>Valid</span>}
              {columns.shown.status && <span>Status</span>}
              {columns.shown.amount && <span className="pp-cell-amount">Sum insured</span>}
            </div>
            {visiblePolicies.map((policy) => {
              const policyNumber = policyNumberOf(policy);
              const sumInsured = sumInsuredOf(policy);
              const isSelected = selectedNumber === policyNumber;
              const status = policy.status;
              const expired = isExpired(policy);
              const validity = validityOf(policy);
              const product = policy.product_name && policy.product_name !== policyNumber ? policy.product_name : null;
              const scheme = policy.scheme_type ? humanize(policy.scheme_type) : null;
              return (
                <div
                  key={policyNumber}
                  role="radio"
                  aria-checked={isSelected}
                  aria-disabled={locked || undefined}
                  tabIndex={!locked && (isSelected || (!selectedNumber && policy === visiblePolicies[0])) ? 0 : -1}
                  className={`pp-row${isSelected ? " is-selected" : ""}${locked ? " is-locked" : ""}`}
                  onClick={() => handlePolicySelect(policy)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handlePolicySelect(policy);
                    }
                  }}
                >
                  <span className="pp-radio" aria-hidden="true" />
                  <div className="pp-cell-policy">
                    <span className={product ? "pp-product" : "pp-product pp-mono"} title={product || policyNumber}>
                      {product || policyNumber}
                    </span>
                    {(product || scheme) && (
                      <span className="pp-cell-sub">
                        {product && <span className="pp-mono">{policyNumber}</span>}
                        {product && scheme && " · "}
                        {scheme}
                      </span>
                    )}
                  </div>
                  <div className="pp-cell pp-cell-payer">
                    <PayerName id={policy.payer_id} name={policy.payer_name} />
                  </div>
                  {columns.shown.member && (
                    <div className={`pp-cell pp-mono${policy.member_id ? "" : " is-empty"}`} title="Member ID">
                      {policy.member_id || "—"}
                    </div>
                  )}
                  {columns.shown.validity && (
                    <div className={`pp-cell${expired ? " is-expired" : ""}${validity ? "" : " is-empty"}`}>
                      {expired && <AlertTriangle size={12} aria-hidden="true" />}
                      {validity || "—"}
                    </div>
                  )}
                  {columns.shown.status && (
                    <div className={`pp-cell${status ? "" : " is-empty"}`}>
                      {status ? (
                        <span className={`pp-status${isActiveStatus(status) ? " is-active" : ""}`} title={status}>
                          {status.replace(/_/g, " ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </div>
                  )}
                  {columns.shown.amount && (
                    <div className={`pp-cell pp-cell-amount${sumInsured ? "" : " is-empty"}`}>
                      {sumInsured ? <span className="pp-amount">{formatMoney(sumInsured)}</span> : "—"}
                    </div>
                  )}
                  {overBill(sumInsured) && (
                    <div className="pp-row-warn">
                      <AlertTriangle size={12} />
                      Estimated bill {formatMoney(caseState.estimatedBillAmount)} is above this sum insured.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="pp-footer">
          <div className="pp-footer-text">
            {selectedPolicy && effectivePayer ? (
              <>
                <CheckCircle2 size={14} className="pp-footer-ok" />
                <span>
                  <strong>{selectedPolicy?.product_name || selectedNumber}</strong>
                  {" · "}
                  <PayerName id={selectedPolicy.payer_id} name={selectedPolicy.payer_name} />
                </span>
              </>
            ) : (
              <span className="pp-muted">
                {caseClosed ? "The case is settled; its policy can't be changed." : "Select the policy that pays for this admission to continue."}
              </span>
            )}
          </div>
          {!caseClosed && (
            <Button
              variant="primary"
              size="small"
              disabled={!selectedPolicy || !effectivePayer}
              disabledReason="Select a policy above first."
              onClick={handleNext}
            >
              Continue to eligibility
              <ArrowRight size={14} />
            </Button>
          )}
        </div>
      </div>

      <ChangePolicyModal
        open={!!pendingPolicy}
        from={selectedPolicy?.product_name || selectedNumber}
        to={pendingPolicy?.product_name || policyNumberOf(pendingPolicy)}
        onCancel={() => setPendingPolicy(null)}
        onConfirm={confirmPolicyChange}
      />
    </div>
  );
}
