import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Radar, RefreshCw, Search } from "lucide-react";
import { api, markHandled } from "../../api";
import { InfoTip, NextStep } from "../Common";
import Dropdown from "../Dropdown";
import PayerName from "../PayerName";
import { useTips } from "../../help/tips.js";
import { useCaseLock } from "../../hooks/useCaseLock";
import { useCasePane, asRecord } from "../case/useCasePane";
import CaseStep, { Pane, Verdict } from "../case/CaseStep";
import DiscoverCoverDrawer from "../case/DiscoverCoverDrawer";
import ChangePolicyModal from "./ChangePolicyModal";
import { POLICY_CHANGE_RESET } from "../case/caseStages";
import { formatDate, formatDateTime, formatMoney, humanize } from "../../format.js";
import "../case/policy.css";

const IDENTIFIER_TYPE_LABELS = {
  AbhaNumber: "ABHA number",
  MemberId: "Member ID",
  MobileNo: "Mobile number",
};

const IDENTIFIER_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "AbhaNumber", label: IDENTIFIER_TYPE_LABELS.AbhaNumber },
  { value: "MemberId", label: IDENTIFIER_TYPE_LABELS.MemberId },
  { value: "MobileNo", label: IDENTIFIER_TYPE_LABELS.MobileNo },
];

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

const isUsable = (policy) => !isExpired(policy) && (!policy?.status || isActiveStatus(policy.status));

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

const DISCOVERY_TONE = { waiting: "wait", answered: "ok", failed: "bad" };

const EMPTY_RESULT = { n: 0, policies: [], error: null, foundBy: null, memberIdOnFile: "", searchedMemberId: "" };

export default function PayerPolicy({ ctx }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { patient, caseState, updateCaseState, cashlessCase, resetCase } = ctx;
  const { showTips } = useTips();
  const lock = useCaseLock(ctx, "payer");
  const locked = lock.viewOnly || lock.settled;
  const pane = useCasePane();

  const [selectedPolicy, setSelectedPolicy] = useState(() => casePolicyOf(caseState, cashlessCase));
  const [pendingPolicy, setPendingPolicy] = useState(null);
  const [identifierType, setIdentifierType] = useState("");
  const [memberId, setMemberId] = useState("");
  const [payerFilter, setPayerFilter] = useState(null);
  const [rowNotice, setRowNotice] = useState(null);
  const [query, setQuery] = useState(() => (locked || selectedPolicy || !patient?.child_id ? null : { n: 1, idType: "", memberId: "" }));
  const [result, setResult] = useState(EMPTY_RESULT);
  const [discover, setDiscover] = useState(() => {
    const params = new URLSearchParams(location.search);
    return { open: params.get("discover") === "1", memberId: params.get("member_id") || "", activeId: null };
  });

  const loading = !!query && result.n !== query.n;

  const applyPolicy = (policy) => {
    setSelectedPolicy(policy);
    if (caseState.cashless_case_id) resetCase();
    updateCaseState({ policy, payer: payerFromPolicy(policy), ...POLICY_CHANGE_RESET });
  };

  const latest = useRef({ applyPolicy, selectedPolicy, caseId: caseState.cashless_case_id, admissionId: caseState.admission_id });
  useEffect(() => {
    latest.current = { applyPolicy, selectedPolicy, caseId: caseState.cashless_case_id, admissionId: caseState.admission_id };
  });

  useEffect(() => {
    if (!query || !patient?.child_id) return undefined;
    let cancelled = false;
    const run = async () => {
      try {
        const body = { child_id: patient.child_id };
        if (latest.current.admissionId) body.admission_id = latest.current.admissionId;
        const typed = query.memberId.trim();
        if (typed) body.member_id = typed;
        else if (query.idType) body.identifier_type = query.idType;
        const res = await api.fetchPolicies(body);
        if (cancelled) return;
        const found = res?.data?.policies || [];
        const used = res?.data?.identifier_used;
        setResult({
          n: query.n,
          policies: found,
          error: null,
          foundBy: found.length ? IDENTIFIER_TYPE_LABELS[used?.type] || null : null,
          memberIdOnFile: used?.type === "MemberId" && used.value ? used.value : "",
          searchedMemberId: typed,
        });
        const usable = found.filter(isUsable);
        if (usable.length === 1 && !latest.current.selectedPolicy && !latest.current.caseId) latest.current.applyPolicy(usable[0]);
      } catch (err) {
        if (cancelled) return;
        markHandled(err);
        setResult({ ...EMPTY_RESULT, n: query.n, error: err?.message || "The insurance registry did not answer." });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [query, patient?.child_id]);

  const search = (idType = identifierType, typedMemberId = memberId) => {
    setRowNotice(null);
    setPayerFilter(null);
    setQuery({ n: (query?.n || 0) + 1, idType, memberId: idType === "MemberId" ? typedMemberId : "" });
  };

  const changeIdentifierType = (idType) => {
    setIdentifierType(idType);
    if (idType === "MemberId" && !memberId && result.memberIdOnFile) setMemberId(result.memberIdOnFile);
  };

  const policies = result.policies;
  const selectedNumber = policyNumberOf(selectedPolicy);
  const listedPolicies =
    selectedPolicy && !policies.some((policy) => policyNumberOf(policy) === selectedNumber) ? [selectedPolicy, ...policies] : policies;

  const discoveredPayers = [];
  for (const policy of listedPolicies) {
    const payer = payerFromPolicy(policy);
    if (payer && !discoveredPayers.some((p) => p.code === payer.code)) discoveredPayers.push(payer);
  }
  const visiblePolicies = payerFilter ? listedPolicies.filter((policy) => payerFromPolicy(policy)?.code === payerFilter) : listedPolicies;

  const handlePolicySelect = (policy) => {
    if (locked || policyNumberOf(policy) === selectedNumber) return;
    if (!isUsable(policy)) {
      setRowNotice(
        isExpired(policy)
          ? `${policy.product_name || policy.policy_number} has ended, so the payer will not cover this admission. Pick another one, or ask the insurer.`
          : `${policy.product_name || policy.policy_number} is not active with the payer. Pick another one, or ask the insurer.`,
      );
      return;
    }
    setRowNotice(null);
    if (caseState.cashless_case_id) setPendingPolicy(policy);
    else applyPolicy(policy);
  };

  const effectivePayer = payerFromPolicy(selectedPolicy);
  const searchDone = result.n > 0 && !result.error;
  const typedMemberId = result.searchedMemberId;
  const columns = columnsFor(visiblePolicies);
  const overBill = (sumInsured) => caseState.estimatedBillAmount > 0 && sumInsured > 0 && sumInsured < caseState.estimatedBillAmount;

  const discoveries = caseState.discoveries || [];
  const latestDiscovery = discoveries[0] || null;
  const coverCount = latestDiscovery?.covers?.length || 0;

  const rows = [
    {
      id: "find",
      group: "policy",
      name: "Find the policy",
      ...(loading
        ? { tone: "wait", fact: "Searching" }
        : result.error
          ? { tone: "bad", fact: "Search failed" }
          : policies.length
            ? { tone: "ok", fact: `${policies.length} found` }
            : searchDone
              ? { tone: "warn", fact: "None found" }
              : { tone: "idle", fact: "Not searched" }),
    },
    {
      id: "chosen",
      group: "policy",
      name: "Chosen policy",
      ...(selectedPolicy ? { tone: "ok", fact: selectedPolicy.product_name || selectedNumber } : { tone: "warn", fact: "None", blocks: true }),
    },
    {
      id: "discover",
      group: "more",
      name: "Ask the insurer",
      ...(latestDiscovery
        ? {
            tone: DISCOVERY_TONE[latestDiscovery.status] || "idle",
            fact: latestDiscovery.status === "waiting" ? "Waiting" : latestDiscovery.status === "failed" ? "Refused" : `${coverCount} ${coverCount === 1 ? "cover" : "covers"}`,
          }
        : { tone: "idle", fact: "Not asked" }),
    },
  ].map((row) => (locked ? asRecord(row) : row));

  const checklist = [
    { id: "policy", title: "Policy", rows: rows.filter((r) => r.group === "policy") },
    { id: "more", title: "Not found?", rows: rows.filter((r) => r.group === "more") },
  ];
  const open = pane.picked ?? (selectedPolicy ? "chosen" : "find");

  const openDiscover = (activeId = null) => setDiscover((d) => ({ ...d, open: true, activeId, memberId: identifierType === "MemberId" ? memberId.trim() : d.memberId }));
  const closeDiscover = () => setDiscover((d) => ({ ...d, open: false }));

  const askButton = (label = "Ask the insurer") =>
    !locked && (
      <button type="button" className="cv-btn" onClick={() => openDiscover()}>
        <Radar size={14} aria-hidden="true" /> {label}
      </button>
    );

  const verdict = (
    <Verdict
      ctx={ctx}
      chip={selectedPolicy ? "Policy chosen" : "Choose a policy"}
      chipTone={selectedPolicy ? "todo" : "warn"}
      summary={
        selectedPolicy && effectivePayer ? (
          <>
            <strong>{selectedPolicy.product_name || selectedNumber}</strong> · <PayerName id={selectedPolicy.payer_id} name={selectedPolicy.payer_name} />
          </>
        ) : (
          "Pick the policy that pays for this admission."
        )
      }
      notes={[lock.reason && { tone: "info", text: lock.reason }]}
      primary={{
        label: "Continue to eligibility",
        icon: ArrowRight,
        write: false,
        disabled: !selectedPolicy || !effectivePayer,
        reason: "Choose a policy first.",
        onClick: () => navigate("../prep"),
      }}
    />
  );

  return (
    <>
      <CaseStep ctx={ctx} verdict={verdict} checklist={checklist} open={open} onOpen={pane.openItem} checklistLabel="Policy" paneRef={pane.paneRef}>
        <Pane id="find">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Policies</h2>
              <span className="cv-card-meta">
                {loading ? "Searching the patient's policies…" : result.error ? "Search failed" : result.foundBy ? `Found by ${result.foundBy}` : searchDone ? "Nothing found" : ""}
              </span>
              <InfoTip
                title="How policies are found"
                text="We look for policies an insurer has linked to the patient's ABHA number, member ID or mobile. Pick the one that pays for this admission."
              />
            </div>
            {!locked && (
              <div className="pp-toolbar">
                <span className="pp-toolbar-key">
                  Search by
                  <InfoTip
                    title="Search by"
                    text="Auto tries the ABHA number first, then the mobile number. Choose Member ID to type the number printed on the insurance card; the payer finds the policy fastest that way."
                  />
                </span>
                <div className="pp-searchby-select">
                  <Dropdown compact ariaLabel="Search policies by" value={identifierType} options={IDENTIFIER_OPTIONS} onChange={changeIdentifierType} />
                </div>
                {identifierType === "MemberId" && (
                  <input
                    className="cv-ctl pp-member-input"
                    placeholder="Member ID from the card"
                    aria-label="Member ID"
                    value={memberId}
                    onChange={(e) => setMemberId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && memberId.trim()) search();
                    }}
                  />
                )}
                <button type="button" className="cv-btn" disabled={loading || (identifierType === "MemberId" && !memberId.trim())} onClick={() => search()}>
                  {searchDone || result.error ? <RefreshCw size={14} aria-hidden="true" /> : <Search size={14} aria-hidden="true" />}
                  {searchDone || result.error ? "Search again" : "Search"}
                </button>
                {askButton()}
              </div>
            )}

            {!loading && listedPolicies.length >= PAYER_CHIPS_FROM && discoveredPayers.length > 1 && (
              <div className="pp-payerbar" role="group" aria-label="Payer">
                <button type="button" className="cv-fchip" aria-pressed={payerFilter === null} onClick={() => setPayerFilter(null)}>
                  All ({listedPolicies.length})
                </button>
                {discoveredPayers.map((payer) => (
                  <button
                    type="button"
                    key={payer.code}
                    className="cv-fchip"
                    aria-pressed={payerFilter === payer.code}
                    onClick={() => setPayerFilter(payerFilter === payer.code ? null : payer.code)}
                    title={payer.code}
                  >
                    <PayerName id={payer.code} name={payer.name === payer.code ? undefined : payer.name} /> (
                    {listedPolicies.filter((p) => payerFromPolicy(p)?.code === payer.code).length})
                  </button>
                ))}
              </div>
            )}

            {rowNotice && (
              <div className="cv-notice is-warn pp-notice" role="status">
                <div className="cv-notice-body">{rowNotice}</div>
              </div>
            )}

            {locked && listedPolicies.length === 0 ? (
              <div className="cv-card-body">
                <NextStep tone="info" title={lock.reason}>
                  {lock.viewOnly ? "Looking up a patient's policies asks the payer, which this account cannot do." : "Its policy is not looked up again."}
                </NextStep>
              </div>
            ) : loading ? (
              <div className="pp-list" aria-busy="true">
                {[0, 1].map((i) => (
                  <div key={i} className="pp-row is-skeleton">
                    <span className="skeleton-line pp-skel-dot" />
                    <div className="pp-skel-text">
                      <span className="skeleton-line pp-skel-line" />
                      <span className="skeleton-line pp-skel-line" />
                    </div>
                  </div>
                ))}
              </div>
            ) : result.error ? (
              <NextStep
                tone="bad"
                className="pp-next"
                title="Couldn't reach the insurance registry"
                steps={["Press Search again. A failed lookup is often a short network problem.", "If it keeps failing, ask the insurer directly."]}
                actions={
                  <>
                    <button type="button" className="cv-btn" onClick={() => search()}>
                      Search again
                    </button>
                    {askButton()}
                  </>
                }
              >
                {result.error}
              </NextStep>
            ) : visiblePolicies.length === 0 ? (
              <NextStep
                tone="warn"
                className="pp-next"
                title={`No policy found${
                  typedMemberId ? ` for member ID ${typedMemberId}` : query?.idType ? ` by ${IDENTIFIER_TYPE_LABELS[query.idType]}` : patient?.name ? ` for ${patient.name}` : ""
                }`}
                actions={
                  <>
                    {identifierType !== "MemberId" && (
                      <button type="button" className="cv-btn" onClick={() => changeIdentifierType("MemberId")}>
                        Search by member ID
                      </button>
                    )}
                    {query?.idType && (
                      <button type="button" className="cv-btn" onClick={() => search("", "")}>
                        Try all identifiers
                      </button>
                    )}
                    {askButton()}
                  </>
                }
              >
                {typedMemberId
                  ? "Check the member ID against the card for a typo. If it is right, ask the insurer directly."
                  : "Many policies are not linked to an ABHA or mobile yet, so the patient may still be insured. Ask for the insurance card or e-card; a child's cover is often on a parent's card."}
                {showTips && <div className="pp-next-tip">No insurance at all? Treat them as a cash patient. No cashless case is needed.</div>}
              </NextStep>
            ) : (
              <div className="pp-list" role="radiogroup" aria-label="Policies" style={{ "--pp-cols": columns.template }}>
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
                              {humanize(status)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </div>
                      )}
                      {columns.shown.amount && (
                        <div className={`pp-cell pp-cell-amount${sumInsured ? "" : " is-empty"}`}>{sumInsured ? <span className="pp-amount">{formatMoney(sumInsured)}</span> : "—"}</div>
                      )}
                      {overBill(sumInsured) && (
                        <div className="pp-row-warn">
                          <AlertTriangle size={12} aria-hidden="true" />
                          Estimated bill {formatMoney(caseState.estimatedBillAmount)} is above this sum insured.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </Pane>

        <Pane id="chosen">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Chosen policy</h2>
              {selectedPolicy && !locked && (
                <span className="cv-card-tools">
                  <button type="button" className="cv-link" onClick={() => pane.openItem("find")}>
                    Pick a different policy
                  </button>
                </span>
              )}
            </div>
            <div className="cv-card-body">
              {selectedPolicy ? (
                <>
                  <div className="cv-kv">
                    <span>Policy</span>
                    <span className="cv-mono">{selectedNumber}</span>
                  </div>
                  {selectedPolicy.product_name && selectedPolicy.product_name !== selectedNumber && (
                    <div className="cv-kv">
                      <span>Product</span>
                      <span>{selectedPolicy.product_name}</span>
                    </div>
                  )}
                  <div className="cv-kv">
                    <span>Payer</span>
                    <span>
                      <PayerName id={selectedPolicy.payer_id} name={selectedPolicy.payer_name} />
                    </span>
                  </div>
                  {selectedPolicy.member_id && (
                    <div className="cv-kv">
                      <span>Member ID</span>
                      <span className="cv-mono">{selectedPolicy.member_id}</span>
                    </div>
                  )}
                  {validityOf(selectedPolicy) && (
                    <div className="cv-kv">
                      <span>Valid</span>
                      <span>{validityOf(selectedPolicy)}</span>
                    </div>
                  )}
                  {selectedPolicy.status && (
                    <div className="cv-kv">
                      <span>Status</span>
                      <span>{humanize(selectedPolicy.status)}</span>
                    </div>
                  )}
                  {sumInsuredOf(selectedPolicy) != null && (
                    <div className="cv-kv">
                      <span>Sum insured</span>
                      <span>{formatMoney(sumInsuredOf(selectedPolicy))}</span>
                    </div>
                  )}
                  {overBill(sumInsuredOf(selectedPolicy)) && (
                    <div className="cv-notice is-warn pp-chosen-warn">
                      <div className="cv-notice-body">
                        The estimated bill of {formatMoney(caseState.estimatedBillAmount)} is above this policy's sum insured. The patient may have to pay the difference.
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="cv-card-meta">No policy is on this case yet. Pick one from the list, or ask the insurer.</p>
              )}
            </div>
          </section>
        </Pane>

        <Pane id="discover">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Ask the insurer</h2>
              <InfoTip term="discovery" />
              {!locked && (
                <span className="cv-card-tools">
                  <button type="button" className="cv-btn" onClick={() => openDiscover()}>
                    <Radar size={14} aria-hidden="true" /> Ask the insurer
                  </button>
                </span>
              )}
            </div>
            <div className="cv-card-intro">
              When the lookup finds nothing, an insurer can be asked directly with the numbers on the patient's card. The answer lists everyone on the cover, so the right person can be chosen.
            </div>
            {discoveries.length > 0 && (
              <div className="cv-card-body cd-sent">
                {discoveries.map((d) => (
                  <button type="button" key={d.correlation_id} className="cd-sent-row" onClick={() => openDiscover(d.correlation_id)}>
                    <span className={`cv-chip is-${DISCOVERY_TONE[d.status] === "ok" ? "todo" : DISCOVERY_TONE[d.status] || "todo"}`}>
                      {d.status === "waiting" ? "Waiting" : d.status === "failed" ? "Refused" : "Answered"}
                    </span>
                    <PayerName id={d.payer_id} name={d.payer_name} />
                    <span className="cd-sent-when">{formatDateTime(d.sent_at)}</span>
                    <span className="cd-sent-info">{[d.policy_number && `Policy ${d.policy_number}`, d.member_id && `Member ID ${d.member_id}`].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </Pane>
      </CaseStep>

      <DiscoverCoverDrawer
        open={discover.open}
        onClose={closeDiscover}
        ctx={ctx}
        locked={locked}
        lockReason={lock.reason}
        initialMemberId={discover.memberId || result.memberIdOnFile}
        initialPolicyNumber={selectedNumber || ""}
        initialActiveId={discover.activeId}
        onAdopted={() => {
          closeDiscover();
          navigate("../prep");
        }}
      />

      <ChangePolicyModal
        open={!!pendingPolicy}
        from={selectedPolicy?.product_name || selectedNumber}
        to={pendingPolicy?.product_name || policyNumberOf(pendingPolicy)}
        onCancel={() => setPendingPolicy(null)}
        onConfirm={() => {
          applyPolicy(pendingPolicy);
          setPendingPolicy(null);
        }}
      />
    </>
  );
}
