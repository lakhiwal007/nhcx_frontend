import { useEffect, useRef, useState } from "react";
import { Building2, Check, Radar, UserRound } from "lucide-react";
import { api } from "../../../api";
import { Drawer } from "../../ui/Overlay";
import { InfoTip, Tip, NextStep } from "../../ui/Common";
import PayerName from "../../ui/PayerName";
import ChangePolicyModal from "../../wizard/ChangePolicyModal";
import { useSend } from "../../../hooks/util/useSend";
import { useWorkflowStatus } from "../../../hooks/case/useWorkflowStatus";
import { POLICY_CHANGE_RESET } from "../frame/caseStages";
import { formatDate, formatDateTime, formatMoney, humanize, photoSrc } from "../../../lib/format.js";
import "./policy.css";

const POLL_MS = 4000;

const digits = (v) => String(v || "").replace(/[\s-]/g, "");
const mobileDigits = (v) => digits(v).replace(/^\+91/, "");

const DIGIT_RULES = {
  aadhaar: [digits, 12, "An Aadhaar number has 12 digits"],
  mobile: [mobileDigits, 10, "A mobile number has 10 digits"],
  abha_number: [digits, 14, "An ABHA number has 14 digits"],
};

const FIELDS = ["policy_number", "member_id", "aadhaar", "mobile", "abha_number"];

const STATE_TONES = { waiting: "is-info", answered: "is-todo", failed: "is-bad" };
const STATE_WORDS = { waiting: "Waiting", answered: "Answered", failed: "Refused" };

const discoveryState = (status) => (status === "complete" ? "answered" : status === "failed" ? "failed" : "waiting");

const statusError = (res) =>
  (res?.errors || []).map((e) => e?.message || e?.detail || e?.code?.display).find(Boolean) || res?.message || null;

const fieldError = (key, value) => {
  const rule = DIGIT_RULES[key];
  if (!rule) return null;
  const [clean, length, message] = rule;
  const cleaned = clean(value);
  return cleaned && !new RegExp(`^\\d{${length}}$`).test(cleaned) ? message : null;
};

function refusalFor(payer, form) {
  if (!payer) return "Choose the insurer to ask.";
  if (!form.policy_number.trim() && !form.member_id.trim()) return "Enter the policy number or member ID.";
  for (const key of Object.keys(DIGIT_RULES)) {
    const message = fieldError(key, form[key]);
    if (message) return message;
  }
  return null;
}

function groupByPolicy(covers = []) {
  const groups = new Map();
  for (const cover of covers) {
    if (!groups.has(cover.policy_code)) groups.set(cover.policy_code, []);
    groups.get(cover.policy_code).push(cover);
  }
  return [...groups.values()];
}

const personOf = (cover) => [humanize(cover.gender, ""), cover.dob ? `born ${formatDate(cover.dob)}` : ""].filter(Boolean).join(" · ");

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

const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

const fromServer = (row) => {
  const state = discoveryState(row.status);
  return {
    correlation_id: row.correlation_id,
    payer_id: row.payer_id,
    payer_name: row.payer_name || row.payer_id,
    sent_at: row.sent_at,
    status: state,
    covers: row.covers || [],
    error: state === "failed" ? statusError(row) : null,
    policy_number: row.policy_number || null,
    member_id: row.member_id || null,
    mobile: row.mobile || null,
    aadhaar_last4: row.aadhaar_last4 || null,
  };
};

const stripPhoto = (cover) => {
  const { photo, ...rest } = cover;
  return photo ? rest : cover;
};

const waitedText = (ms) => {
  if (ms == null) return null;
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export default function DiscoverCoverDrawer({ open, onClose, ctx, locked = false, lockReason, initialMemberId = "", initialPolicyNumber = "", initialActiveId = null, onAdopted }) {
  const { patient, caseState, updateCaseState, cashlessCase, resetCase } = ctx;
  const childId = patient?.child_id;
  const discoveries = caseState.discoveries || [];
  const answerRef = useRef(null);

  const [payerQuery, setPayerQuery] = useState("");
  const [payerResults, setPayerResults] = useState([]);
  const [searchingPayers, setSearchingPayers] = useState(false);
  const [payer, setPayer] = useState(null);
  const [form, setForm] = useState(() => ({
    policy_number: initialPolicyNumber || "",
    member_id: initialMemberId || "",
    aadhaar: "",
    mobile: null,
    abha_number: null,
  }));
  const [touched, setTouched] = useState({});
  const [refusal, setRefusal] = useState(null);
  const [activeId, setActiveId] = useState(initialActiveId || discoveries[0]?.correlation_id || null);
  const [paused, setPaused] = useState(false);
  const [pendingChoice, setPendingChoice] = useState(null);
  const [adoptingKey, setAdoptingKey] = useState(null);

  const values = {
    ...form,
    mobile: form.mobile ?? patient?.mobile ?? "",
    abha_number: form.abha_number ?? patient?.abha_number ?? "",
  };

  const latest = useRef({ discoveries, updateCaseState });
  useEffect(() => {
    latest.current = { discoveries, updateCaseState };
  });

  const saveDiscoveries = (next) => latest.current.updateCaseState({ discoveries: next });
  const patchDiscovery = (id, patch) =>
    saveDiscoveries(latest.current.discoveries.map((d) => (d.correlation_id === id ? { ...d, ...patch } : d)));

  const payerQueryReady = !payer && payerQuery.trim().length >= 2;

  useEffect(() => {
    if (!open || !childId) return undefined;
    let live = true;
    api
      .listDiscoveries(childId)
      .then((res) => {
        if (!live) return;
        const held = latest.current.discoveries;
        const known = new Set(held.map((d) => d.correlation_id));
        const older = (res?.discoveries || []).filter((row) => !known.has(row.correlation_id)).map(fromServer);
        if (older.length === 0) return;
        const merged = [...held, ...older].sort((a, b) => (Date.parse(b.sent_at) || 0) - (Date.parse(a.sent_at) || 0));
        saveDiscoveries(merged);
        setActiveId((current) => current || merged[0]?.correlation_id || null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, childId]);

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

  const active = discoveries.find((d) => d.correlation_id === activeId) || null;
  const polling = open && active && active.status === "waiting" && !paused ? activeId : null;

  const status = useWorkflowStatus((signal) => api.getCoverageEligibilityStatus(activeId, signal), {
    key: polling,
    intervalMs: POLL_MS,
    isTerminal: (res) => res?.status === "complete" || res?.status === "failed",
    onTerminal: (res) => {
      const state = discoveryState(res?.status);
      patchDiscovery(activeId, {
        status: state,
        covers: (res?.covers || []).map(stripPhoto),
        error: state === "failed" ? statusError(res) : null,
      });
    },
  });

  const waited = active?.sent_at && status.lastCheckedAt ? waitedText(status.lastCheckedAt - Date.parse(active.sent_at)) : null;

  const discover = useSend(
    async () => {
      const res = await api.discoverCoverage({
        child_id: childId,
        payer_id: payer.code,
        policy_number: values.policy_number.trim() || undefined,
        member_id: values.member_id.trim() || undefined,
        aadhaar: digits(values.aadhaar) || undefined,
        mobile: mobileDigits(values.mobile) || undefined,
        abha_number: digits(values.abha_number) || undefined,
      });
      const aadhaar = digits(values.aadhaar);
      const entry = {
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
      };
      saveDiscoveries([entry, ...latest.current.discoveries]);
      setActiveId(res.correlation_id);
      setPaused(false);
      return res;
    },
    { success: "Asked the insurer. The answer usually takes under a minute." },
  );

  const ask = () => {
    const reason = refusalFor(payer, values);
    setTouched(Object.fromEntries(FIELDS.map((k) => [k, true])));
    setRefusal(reason);
    if (reason) return;
    discover.run();
  };

  const adopt = useSend(
    async ({ discovery, cover }) => {
      const res = await api.adoptDiscoveredCover(discovery.correlation_id, { policy_code: cover.policy_code, member_id: cover.member_id });
      const policy = res.policy;
      if (caseState.cashless_case_id) resetCase();
      updateCaseState({
        policy,
        payer: { code: policy.payer_id, name: policy.payer_name || policy.payer_id },
        ...POLICY_CHANGE_RESET,
      });
      return policy;
    },
    { success: "Policy added to the case", onDone: (policy) => onAdopted?.(policy) },
  );

  const choose = (discovery, cover) => {
    setAdoptingKey(`${cover.policy_code}|${cover.member_id || ""}`);
    if (caseState.cashless_case_id) setPendingChoice({ discovery, cover });
    else adopt.run({ discovery, cover });
  };

  const answerKey = active && active.status !== "waiting" ? `${active.correlation_id}:${active.status}` : null;
  useEffect(() => {
    if (answerKey) answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [answerKey]);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const blur = (key) => () => setTouched((t) => ({ ...t, [key]: true }));
  const errorOf = (key) => (touched[key] ? fieldError(key, values[key]) : null);

  const field = (key, label, term, extra = {}) => (
    <label className="cd-field" key={key}>
      <span>
        {label}
        {term && <InfoTip term={term} />}
      </span>
      <input className="cv-ctl" value={values[key]} onChange={setField(key)} onBlur={blur(key)} {...extra} />
      {errorOf(key) && <span className="cd-field-error">{errorOf(key)}</span>}
    </label>
  );

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title="Ask an insurer"
        subtitle={`Whether it covers ${patient?.name || "this patient"}`}
        width={760}
        footer={
          <>
            <button type="button" className="cv-btn" onClick={onClose}>
              Close
            </button>
            {!locked && (
              <button type="button" className="cv-btn is-primary" disabled={discover.busy || !childId} onClick={ask}>
                <Radar size={14} aria-hidden="true" />
                {discover.busy ? "Asking…" : "Ask the insurer"}
              </button>
            )}
          </>
        }
      >
        {locked ? (
          <NextStep tone="info" title={lockReason || "This case cannot be changed."}>
            Not available on this account.
          </NextStep>
        ) : (
          <>
            <Tip className="cd-form-tip">
              Copy from the insurance card. Policy number or member ID is needed.
            </Tip>
            <div className="cd-grid">
              <div className="cd-field is-wide">
                <span>
                  Insurer
                  <InfoTip term="payer" />
                </span>
                {payer ? (
                  <div className="cd-payer" title={payer.code}>
                    <Building2 size={14} aria-hidden="true" />
                    <span className="cd-payer-name">{payer.name}</span>
                    {payer.scheme_type && <span className="pp-status">{payer.scheme_type}</span>}
                    <button
                      type="button"
                      className="cv-link"
                      onClick={() => {
                        setPayer(null);
                        setPayerQuery("");
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : null}
                {payer?.in_network && (
                  <div className="cd-payer-note cd-in-network">
                    <Check size={14} aria-hidden="true" />
                    In network: this hospital has fetched an insurance plan from {payer.name}.
                  </div>
                )}
                {payer ? null : (
                  <div className="cd-typeahead">
                    <input
                      className="cv-ctl"
                      placeholder="Name on the card, at least 2 letters"
                      aria-label="Insurer"
                      value={payerQuery}
                      onChange={(e) => setPayerQuery(e.target.value)}
                    />
                    {payerQueryReady && (
                      <div className="cd-payer-menu">
                        {searchingPayers ? (
                          <div className="cd-payer-note">Searching…</div>
                        ) : payerResults.length > 0 ? (
                          <div className="pp-lookup-results">
                            {payerResults.map((p) => (
                              <button type="button" key={p.code} className="pp-lookup-row" onClick={() => setPayer(p)}>
                                <Building2 size={14} aria-hidden="true" />
                                <span className="pp-lookup-name">{p.name}</span>
                                {p.scheme_type && <span className="cd-payer-note">{p.scheme_type}</span>}
                                <span className="pp-lookup-code">{p.code}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="cd-payer-note">No insurer matches that name. Try a shorter part of it.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {field("policy_number", "Policy number", "policy_number")}
              {field("member_id", "Member ID", "member_id")}
              {field("aadhaar", "Aadhaar number", "aadhaar", { inputMode: "numeric" })}
              {field("mobile", "Mobile number", null, { inputMode: "numeric" })}
              {field("abha_number", "ABHA number", "abha", { inputMode: "numeric" })}
            </div>

            {(refusal || discover.error) && (
              <NextStep tone="warn" className="cd-refusal" title="Not sent yet">
                {refusal || discover.error}
              </NextStep>
            )}

            {active && active.status === "waiting" && (
              <div className="cd-wait" role="status">
                {!paused && <span className="spinner cd-spinner" aria-hidden="true" />}
                <span>
                  {paused ? "Not checking. " : "Waiting for "}
                  <PayerName id={active.payer_id} name={active.payer_name} />
                  {waited ? ` · ${waited}` : ""}
                  {paused ? "" : " · usually under a minute"}
                </span>
                {status.error && <span className="cd-field-error">Could not check: {status.error}</span>}
                <button type="button" className="cv-btn" onClick={() => (paused ? setPaused(false) : setPaused(true))}>
                  {paused ? "Check again" : "Stop waiting"}
                </button>
              </div>
            )}
          </>
        )}

        {active && active.status !== "waiting" && (
          <section className="cd-section" ref={answerRef}>
            <div className="cd-section-title">
              Answer from <PayerName id={active.payer_id} name={active.payer_name} />
            </div>
            {active.status === "failed" ? (
              <NextStep
                tone="bad"
                title="The insurer could not answer"
                steps={[
                  "Check the numbers on the card and try again.",
                  "Still failing? Try later or call the payer.",
                ]}
              >
                {active.error || "The insurer refused the request."}
              </NextStep>
            ) : (active.covers || []).length === 0 ? (
              <NextStep tone="warn" title="No cover found for these details">
                Check the numbers. If the card names a TPA, try the TPA.
                <Tip>No luck? Treat as cash. Add a policy later.</Tip>
              </NextStep>
            ) : (
              active.covers.length > 1 && <Tip>Choose who is admitted. Check name and age.</Tip>
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
                          <span className={`pp-status${/^(active|in.?force)/i.test(policy.status || "") ? " is-active" : ""}`}>{humanize(policy.status)}</span>
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
                            {columns.shown.relation && <div className={`pp-cell${cover.relationship ? "" : " is-empty"}`}>{cover.relationship || "—"}</div>}
                            {columns.shown.person && <div className={`pp-cell${personOf(cover) ? "" : " is-empty"}`}>{personOf(cover) || "—"}</div>}
                            {columns.shown.member && <div className={`pp-cell pp-mono${cover.member_id ? "" : " is-empty"}`}>{cover.member_id || "—"}</div>}
                            {columns.shown.abha && <div className={`pp-cell pp-mono${cover.abha_number ? "" : " is-empty"}`}>{cover.abha_number || "—"}</div>}
                            <button type="button" className="cv-btn cd-select" disabled={adopt.busy || locked} onClick={() => choose(active, cover)}>
                              {adopt.busy && adoptingKey === key ? "Adding…" : "Select"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            {adopt.error && (
              <div className="cv-notice is-bad" role="alert">
                <div className="cv-notice-body">{adopt.error}</div>
              </div>
            )}
          </section>
        )}

        {discoveries.length > 0 && (
          <section className="cd-section">
            <div className="cd-section-title">Asked for this patient</div>
            <div className="cd-sent">
              {discoveries.map((d) => (
                <button
                  type="button"
                  key={d.correlation_id}
                  className={`cd-sent-row${d.correlation_id === activeId ? " is-on" : ""}`}
                  onClick={() => {
                    setActiveId(d.correlation_id);
                    setPaused(false);
                  }}
                >
                  <UserRound size={14} aria-hidden="true" />
                  <span className={`cv-chip ${STATE_TONES[d.status] || "is-todo"}`}>{STATE_WORDS[d.status] || humanize(d.status)}</span>
                  <PayerName id={d.payer_id} name={d.payer_name} />
                  <span className="cd-sent-when">{formatDateTime(d.sent_at)}</span>
                  <span className="cd-sent-info">
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
      </Drawer>

      <ChangePolicyModal
        open={!!pendingChoice}
        from={caseState.policy?.product_name || caseState.policy?.policy_number || cashlessCase?.policy_number}
        to={pendingChoice?.cover.plan_name || pendingChoice?.cover.policy_code}
        onCancel={() => setPendingChoice(null)}
        onConfirm={() => {
          const choice = pendingChoice;
          setPendingChoice(null);
          adopt.run(choice);
        }}
      />
    </>
  );
}
