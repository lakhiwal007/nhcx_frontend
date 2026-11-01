import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Building2, Radar, AlertTriangle, UserRound } from "lucide-react";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { usePoll } from "../../hooks/usePoll";
import { Button, InfoTip, Tip, NextStep } from "../Common";
import PayerName from "../PayerName";
import { POLICY_CHANGE_RESET } from "../case/caseStages";
import ChangePolicyModal from "./ChangePolicyModal";
import { formatMoney, formatDate, formatDateTime, humanize } from "../../format.js";

const POLL_MS = 4000;

const digits = (v) => String(v || "").replace(/[\s-]/g, "");
const mobileDigits = (v) => digits(v).replace(/^\+91/, "");

const DIGIT_RULES = [
  ["aadhaar", digits, 12, "An Aadhaar number has 12 digits"],
  ["mobile", mobileDigits, 10, "A mobile number has 10 digits"],
  ["abha_number", digits, 14, "An ABHA number has 14 digits"],
];

const STATE_TONES = { waiting: "is-wait", answered: "is-active", failed: "is-error" };

const discoveryState = (status) => (status === "complete" ? "answered" : status === "failed" ? "failed" : "waiting");

const statusError = (res) =>
  (res?.errors || []).map((e) => e?.message || e?.detail || e?.code?.display).find(Boolean) || res?.message || null;

function refusalFor(payer, form) {
  if (!payer) return "Choose the payer to ask";
  if (!form.policy_number.trim() && !form.member_id.trim()) return "Enter the policy number or the member id; at least one is required.";
  for (const [key, clean, length, message] of DIGIT_RULES) {
    const value = clean(form[key]);
    if (value && !new RegExp(`^\\d{${length}}$`).test(value)) return message;
  }
  return null;
}

// A family card comes back as one cover per person. The policy's facts are the
// same for all of them, so they are shown once per policy above its members.
function groupByPolicy(covers = []) {
  const groups = new Map();
  for (const cover of covers) {
    if (!groups.has(cover.policy_code)) groups.set(cover.policy_code, []);
    groups.get(cover.policy_code).push(cover);
  }
  return [...groups.values()];
}

const personOf = (cover) =>
  [humanize(cover.gender, ""), cover.dob ? `born ${formatDate(cover.dob)}` : ""].filter(Boolean).join(" · ");

const memberColumns = (covers) => {
  const shown = {
    relation: covers.some((c) => c.relationship),
    person: covers.some(personOf),
    member: covers.some((c) => c.member_id),
    abha: covers.some((c) => c.abha_number),
  };
  const template = [
    "32px",
    "minmax(0, 2fr)",
    shown.relation && "minmax(0, 1fr)",
    shown.person && "minmax(0, 1.5fr)",
    shown.member && "minmax(0, 1.1fr)",
    shown.abha && "minmax(0, 1.2fr)",
    "84px",
  ];
  return { shown, template: template.filter(Boolean).join(" ") };
};

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function photoSrc(photo) {
  if (!photo) return null;
  if (/^(https?:|data:)/.test(photo)) return photo;
  return `data:image/jpeg;base64,${photo}`;
}

export default function CoverageDiscovery({ ctx }) {
  const navigate = useNavigate();
  const location = useLocation();
  const readOnly = useReadOnly();
  const { patient, caseState, updateCaseState, caseClosed, cashlessCase, setCashlessCase } = ctx;
  const childId = patient?.child_id;
  const [pendingChoice, setPendingChoice] = useState(null);
  const answerRef = useRef(null);

  const [payerQuery, setPayerQuery] = useState("");
  const [payerResults, setPayerResults] = useState([]);
  const [searchingPayers, setSearchingPayers] = useState(false);
  const [payer, setPayer] = useState(null);

  const [form, setForm] = useState(() => ({
    policy_number: "",
    member_id: new URLSearchParams(location.search).get("member_id") || "",
    aadhaar: "",
    mobile: null,
    abha_number: null,
  }));
  const [refusal, setRefusal] = useState(null);
  const [sending, setSending] = useState(false);

  const [discoveries, setDiscoveries] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [pollError, setPollError] = useState(null);
  const [adopting, setAdopting] = useState(null);
  const [adoptError, setAdoptError] = useState(null);

  const values = {
    ...form,
    mobile: form.mobile ?? patient?.mobile ?? "",
    abha_number: form.abha_number ?? patient?.abha_number ?? "",
  };

  const patchDiscovery = (correlationId, patch) =>
    setDiscoveries((list) => list.map((d) => (d.correlation_id === correlationId ? { ...d, ...patch } : d)));

  const payerQueryReady = !payer && payerQuery.trim().length >= 2;
  const visiblePayers = payerQueryReady ? payerResults : [];

  useEffect(() => {
    const query = payerQuery.trim();
    if (payer || query.length < 2) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingPayers(true);
      try {
        const res = await api.searchPayers({ name: query });
        if (!cancelled) setPayerResults(Array.isArray(res) ? res : res?.payers || []);
      } catch {
        if (!cancelled) setPayerResults([]);
      } finally {
        if (!cancelled) setSearchingPayers(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [payerQuery, payer]);

  usePoll(
    async (signal) => {
      try {
        const res = await api.getCoverageEligibilityStatus(activeId, signal);
        setPollError(null);
        const status = discoveryState(res?.status);
        patchDiscovery(activeId, { status, covers: res?.covers || [], error: status === "failed" ? statusError(res) : null });
        if (status !== "waiting") setWaiting(false);
      } catch (err) {
        if (!signal.aborted) setPollError(err.message);
      }
    },
    { active: waiting ? activeId : null, intervalMs: POLL_MS, immediate: false },
  );

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleDiscover = async () => {
    const reason = refusalFor(payer, values);
    setRefusal(reason);
    if (reason) return;
    setSending(true);
    setAdoptError(null);
    try {
      const res = await api.discoverCoverage({
        child_id: childId,
        payer_id: payer.code,
        policy_number: values.policy_number.trim() || undefined,
        member_id: values.member_id.trim() || undefined,
        aadhaar: digits(values.aadhaar) || undefined,
        mobile: mobileDigits(values.mobile) || undefined,
        abha_number: digits(values.abha_number) || undefined,
      });
      if (res?.status === "failed") {
        setRefusal(res.message || "The payer could not be asked.");
        return;
      }
      const aadhaar = digits(values.aadhaar);
      setDiscoveries((list) => [
        {
          correlation_id: res.correlation_id,
          payer_id: payer.code,
          payer_name: payer.name,
          sent_at: new Date().toISOString(),
          status: "waiting",
          covers: [],
          policy_number: values.policy_number.trim() || null,
          member_id: values.member_id.trim() || null,
          mobile: mobileDigits(values.mobile) || null,
          aadhaar_last4: aadhaar ? aadhaar.slice(-4) : null,
        },
        ...list,
      ]);
      setActiveId(res.correlation_id);
      setWaiting(true);
      setPollError(null);
    } catch (err) {
      setRefusal(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleChoose = (discovery, cover) => {
    if (caseState.cashless_case_id) setPendingChoice({ discovery, cover });
    else adoptCover(discovery, cover);
  };

  const adoptCover = async (discovery, cover) => {
    setAdopting(`${cover.policy_code}|${cover.member_id || ""}`);
    setAdoptError(null);
    try {
      const res = await api.adoptDiscoveredCover(discovery.correlation_id, {
        policy_code: cover.policy_code,
        member_id: cover.member_id,
      });
      const policy = res.policy;
      if (caseState.cashless_case_id) setCashlessCase(null);
      updateCaseState({
        policy,
        payer: { code: policy.payer_id, name: policy.payer_name || policy.payer_id },
        ...POLICY_CHANGE_RESET,
      });
      navigate("../prep");
    } catch (err) {
      setAdoptError(err.message);
    } finally {
      setAdopting(null);
    }
  };

  const active = discoveries.find((d) => d.correlation_id === activeId);
  const locked = readOnly || caseClosed;
  const answerKey = active && active.status !== "waiting" ? `${active.correlation_id}:${active.status}` : null;

  // The answer lands under the form, so bring it into view instead of leaving
  // staff to find it by scrolling.
  useEffect(() => {
    if (answerKey) answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [answerKey]);

  return (
    <div className="wizard-step">
      <div className="pp-panel cd-panel">
        <div className="pp-head">
          <div className="pp-head-line">
            <h2 className="pp-title">Ask an insurer</h2>
            <span className="pp-muted">whether it covers {patient?.name || "this patient"}</span>
            <InfoTip term="discovery" />
          </div>
          <button type="button" className="pp-btn" onClick={() => navigate("../payer")}>
            <ArrowLeft size={14} /> Back to policies
          </button>
        </div>

        {locked ? (
          <div className="pp-state">
            <div>
              <div className="pp-state-title">{readOnly ? "View only" : "Case settled"}</div>
              <div className="pp-muted">
                {readOnly ? "Discovery asks the payer, which this account cannot do." : "The case is settled; its policy can't be changed."}
              </div>
            </div>
          </div>
        ) : (
          <div className="cd-form">
            <Tip className="cd-form-tip">
              Copy these from the insurance card. The policy number or member ID is required; the rest helps the insurer find the
              patient.
            </Tip>
            <div className="cd-grid">
              <div className="cd-field">
                <span>
                  Insurer
                  <InfoTip term="payer" />
                </span>
                {payer ? (
                  <div className="cd-payer" title={payer.code}>
                    <Building2 size={14} />
                    <span className="cd-payer-name">{payer.name}</span>
                    {payer.scheme_type && <span className="pp-status">{payer.scheme_type}</span>}
                    <button
                      type="button"
                      className="pp-link"
                      onClick={() => {
                        setPayer(null);
                        setPayerQuery("");
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="cd-typeahead">
                    <input
                      className="input-modern pp-input"
                      placeholder="Name on the card, at least 2 letters"
                      aria-label="Payer"
                      value={payerQuery}
                      onChange={(e) => setPayerQuery(e.target.value)}
                    />
                    {payerQueryReady && (
                      <div className="cd-payer-menu">
                        {searchingPayers ? (
                          <div className="pp-muted cd-payer-note">Searching…</div>
                        ) : visiblePayers.length > 0 ? (
                          <div className="pp-lookup-results">
                            {visiblePayers.map((p) => (
                              <button type="button" key={p.code} className="pp-lookup-row" onClick={() => setPayer(p)}>
                                <Building2 size={14} />
                                <span className="pp-lookup-name">{p.name}</span>
                                {p.scheme_type && <span className="pp-muted">{p.scheme_type}</span>}
                                <code className="pp-lookup-code">{p.code}</code>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="pp-muted cd-payer-note">No insurer matches that name. Try a shorter part of it.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <label className="cd-field">
                <span>
                  Policy number
                  <InfoTip term="policy_number" />
                </span>
                <input className="input-modern pp-input" value={values.policy_number} onChange={setField("policy_number")} />
              </label>
              <label className="cd-field">
                <span>
                  Member ID
                  <InfoTip term="member_id" />
                </span>
                <input className="input-modern pp-input" value={values.member_id} onChange={setField("member_id")} />
              </label>
              <label className="cd-field">
                <span>
                  Aadhaar number
                  <InfoTip term="aadhaar" />
                </span>
                <input className="input-modern pp-input" inputMode="numeric" value={values.aadhaar} onChange={setField("aadhaar")} />
              </label>
              <label className="cd-field">
                <span>Mobile number</span>
                <input className="input-modern pp-input" inputMode="numeric" value={values.mobile} onChange={setField("mobile")} />
              </label>
              <label className="cd-field">
                <span>
                  ABHA number
                  <InfoTip term="abha" />
                </span>
                <input className="input-modern pp-input" inputMode="numeric" value={values.abha_number} onChange={setField("abha_number")} />
              </label>
            </div>

            {refusal && (
              <NextStep tone="bad" className="cd-refusal" title="Not sent yet">
                {refusal}
              </NextStep>
            )}

            <div className="cd-actions">
              {waiting ? (
                <>
                  <span className="pp-muted">
                    <span className="spinner cd-spinner" /> Waiting for <PayerName id={active?.payer_id} name={active?.payer_name} /> to answer. This usually takes
                    under a minute; keep this page open.
                  </span>
                  <button type="button" className="pp-btn" onClick={() => setWaiting(false)}>
                    Stop waiting
                  </button>
                </>
              ) : (
                <Button variant="primary" size="small" disabled={sending || !childId} onClick={handleDiscover}>
                  <Radar size={14} />
                  {sending ? "Sending…" : "Discover"}
                </Button>
              )}
            </div>
          </div>
        )}

        {active && active.status !== "waiting" && (
          <section className="cd-section cd-covers" ref={answerRef}>
            <div className="cd-section-title">Cover returned</div>
            {active.status === "failed" ? (
              <NextStep
                tone="bad"
                title="The insurer could not answer"
                steps={[
                  "Check the policy number and member ID against the card, then press Discover again.",
                  "If it fails again, the insurer's system may be down. Try again later or call the insurer's helpdesk.",
                ]}
              >
                {active.error || "The insurer refused the request."}
              </NextStep>
            ) : (active.covers || []).length === 0 ? (
              <NextStep tone="warn" title="This insurer has no cover for these details">
                Check the numbers for typos and that this is the insurer named on the card. If the card names a TPA, try the TPA instead
                of the insurer, or the other way round.
                <Tip>No luck at all? Treat the patient as cash for now; a policy can be added to the case later.</Tip>
              </NextStep>
            ) : (
              active.covers.length > 1 && (
                <Tip>Choose the person being admitted. A family card lists everyone on it, so check the name, age and relationship.</Tip>
              )
            )}
            {active.status !== "failed" &&
              groupByPolicy(active.covers).map((covers) => {
                const policy = covers[0];
                const columns = memberColumns(covers);
                return (
                  <div className="cd-cover" key={policy.policy_code}>
                    <dl className="cd-strip">
                      <div>
                        <dt>Plan</dt>
                        <dd>{policy.plan_name || "Not given"}</dd>
                      </div>
                      <div>
                        <dt>Policy number</dt>
                        <dd className="pp-mono">{policy.policy_code}</dd>
                      </div>
                      <div>
                        <dt>Sum insured</dt>
                        <dd className="pp-amount">{formatMoney(policy.sum_insured)}</dd>
                      </div>
                      <div>
                        <dt>Valid until</dt>
                        <dd>{formatDate(policy.valid_until)}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>
                          <span className={`pp-status${/^(active|in.?force)/i.test(policy.status || "") ? " is-active" : ""}`}>
                            {humanize(policy.status)}
                          </span>
                        </dd>
                      </div>
                      {policy.members_on_cover > 1 && (
                        <div>
                          <dt>On this cover</dt>
                          <dd>{policy.members_on_cover} members</dd>
                        </div>
                      )}
                    </dl>
                    <div className="cd-members" style={{ "--cd-cols": columns.template }}>
                      <div className="cd-member-head" aria-hidden="true">
                        <span />
                        <span>Name</span>
                        {columns.shown.relation && <span>Relation</span>}
                        {columns.shown.person && <span>Gender and birth</span>}
                        {columns.shown.member && <span>Member ID</span>}
                        {columns.shown.abha && <span>ABHA</span>}
                        <span />
                      </div>
                      {covers.map((cover) => {
                        const key = `${cover.policy_code}|${cover.member_id || ""}`;
                        const src = photoSrc(cover.photo);
                        return (
                          <div className="cd-member" key={key}>
                            {src ? <img className="cd-avatar" src={src} alt="" /> : <span className="cd-avatar">{initials(cover.name)}</span>}
                            <div className="cd-member-name">
                              <span className="pp-product" title={cover.name}>
                                {cover.name || "Unnamed member"}
                              </span>
                              {cover.address && (
                                <span className="pp-cell-sub" title={cover.address}>
                                  {cover.address}
                                </span>
                              )}
                            </div>
                            {columns.shown.relation && (
                              <div className={`pp-cell${cover.relationship ? "" : " is-empty"}`}>{cover.relationship || "—"}</div>
                            )}
                            {columns.shown.person && (
                              <div className={`pp-cell${personOf(cover) ? "" : " is-empty"}`}>{personOf(cover) || "—"}</div>
                            )}
                            {columns.shown.member && (
                              <div className={`pp-cell pp-mono${cover.member_id ? "" : " is-empty"}`}>{cover.member_id || "—"}</div>
                            )}
                            {columns.shown.abha && (
                              <div className={`pp-cell pp-mono${cover.abha_number ? "" : " is-empty"}`}>{cover.abha_number || "—"}</div>
                            )}
                            <button
                              type="button"
                              className="pp-btn cd-select"
                              disabled={!!adopting || locked}
                              onClick={() => handleChoose(active, cover)}
                            >
                              {adopting === key ? "Selecting…" : "Select"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            {adoptError && (
              <div className="pp-state is-error">
                <AlertTriangle size={16} />
                <div>{adoptError}</div>
              </div>
            )}
          </section>
        )}
        {pollError && <div className="pp-muted cd-poll-error">Could not poll the gateway: {pollError}</div>}

        {discoveries.length > 1 && (
          <section className="cd-section">
            <div className="cd-section-title">Discoveries sent on this visit</div>
            <div className="cd-sent">
              {discoveries.map((d) => (
                <button
                  type="button"
                  key={d.correlation_id}
                  className={`cd-sent-row${d.correlation_id === activeId ? " is-on" : ""}`}
                  onClick={() => {
                    setActiveId(d.correlation_id);
                    setWaiting(d.status === "waiting");
                  }}
                >
                  <UserRound size={14} />
                  <span className={`cd-chip ${STATE_TONES[d.status] || ""}`}>{d.status}</span>
                  <PayerName id={d.payer_id} name={d.payer_name} />
                  <span className="pp-muted">{formatDateTime(d.sent_at)}</span>
                  <span className="pp-muted cd-sent-info">
                    {[
                      d.policy_number && `Policy ${d.policy_number}`,
                      d.member_id && `Member ID ${d.member_id}`,
                      d.aadhaar_last4 && `Aadhaar XXXX XXXX ${d.aadhaar_last4}`,
                      d.mobile && `Mobile ${d.mobile}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {d.status === "failed" && d.error && <span className="cd-sent-error">{d.error}</span>}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <ChangePolicyModal
        open={!!pendingChoice}
        from={caseState.policy?.product_name || caseState.policy?.policy_number || cashlessCase?.policy_number}
        to={pendingChoice?.cover.plan_name || pendingChoice?.cover.policy_code}
        onCancel={() => setPendingChoice(null)}
        onConfirm={() => {
          const { discovery, cover } = pendingChoice;
          setPendingChoice(null);
          adoptCover(discovery, cover);
        }}
      />
    </div>
  );
}
