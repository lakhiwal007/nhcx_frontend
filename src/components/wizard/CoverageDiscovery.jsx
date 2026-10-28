import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Building2, Radar, AlertTriangle, UserRound } from "lucide-react";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { Button } from "../Common";
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
  const { patient, updateCaseState, caseClosed } = ctx;
  const childId = patient?.child_id;

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

  useEffect(() => {
    if (!waiting || !activeId) return undefined;
    const timer = setInterval(async () => {
      try {
        const res = await api.getCoverageEligibilityStatus(activeId);
        setPollError(null);
        const status = discoveryState(res?.status);
        patchDiscovery(activeId, { status, covers: res?.covers || [], error: status === "failed" ? statusError(res) : null });
        if (status !== "waiting") setWaiting(false);
      } catch (err) {
        setPollError(err.message);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, activeId]);

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

  const handleChoose = async (discovery, cover) => {
    setAdopting(`${cover.policy_code}|${cover.member_id || ""}`);
    setAdoptError(null);
    try {
      const res = await api.adoptDiscoveredCover(discovery.correlation_id, {
        policy_code: cover.policy_code,
        member_id: cover.member_id,
      });
      const policy = res.policy;
      updateCaseState({
        policy,
        payer: { code: policy.payer_id, name: policy.payer_name || policy.payer_id },
        cashless_case_id: null,
        claim_id: null,
        eligibility_correlation_id: null,
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

  return (
    <div className="wizard-step">
      <div className="pp-panel">
        <div className="pp-head">
          <div className="pp-head-text">
            <h2 className="pp-title">Discover a policy</h2>
            <div className="pp-subtitle">
              Ask a payer directly who {patient?.name || "this patient"} is to it, when the policy lookup does not find the cover.
            </div>
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
            <section className="cd-section">
              <div className="cd-section-title">Payer</div>
              {payer ? (
                <div className="cd-payer">
                  <Building2 size={14} />
                  <span className="cd-payer-name">{payer.name}</span>
                  <code className="pp-lookup-code">{payer.code}</code>
                  {payer.scheme_type && <span className="pp-status">{payer.scheme_type}</span>}
                  <button
                    type="button"
                    className="pp-link"
                    onClick={() => {
                      setPayer(null);
                      setPayerQuery("");
                    }}
                  >
                    Change payer
                  </button>
                </div>
              ) : (
                <div className="cd-typeahead">
                  <input
                    className="input-modern pp-input"
                    placeholder="Type a name or a participant code"
                    aria-label="Payer"
                    value={payerQuery}
                    onChange={(e) => setPayerQuery(e.target.value)}
                  />
                  <div className="pp-muted cd-help">Every payer on the exchange, government and private.</div>
                  {searchingPayers && payerQueryReady ? (
                    <div className="pp-muted cd-help">Searching…</div>
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
                  ) : payerQueryReady ? (
                    <div className="pp-muted cd-help">No payers found.</div>
                  ) : null}
                </div>
              )}
            </section>

            <section className="cd-section">
              <div className="cd-section-title">The policy</div>
              <div className="pp-muted">Name the policy by its number or by the member id on the card, whichever the person has.</div>
              <div className="cd-grid cd-grid-2">
                <label className="cd-field">
                  <span>Policy number</span>
                  <input className="input-modern pp-input" value={values.policy_number} onChange={setField("policy_number")} />
                </label>
                <label className="cd-field">
                  <span>Member ID</span>
                  <input className="input-modern pp-input" value={values.member_id} onChange={setField("member_id")} />
                </label>
              </div>
              <div className="pp-muted">Enter the policy number, the member id, or both. At least one is required.</div>
            </section>

            <section className="cd-section">
              <div className="cd-section-title">Additional information</div>
              <div className="pp-muted">Sent with the discovery so the payer has more than one handle to match on. All optional.</div>
              <div className="cd-grid cd-grid-3">
                <label className="cd-field">
                  <span>Aadhaar number</span>
                  <input className="input-modern pp-input" inputMode="numeric" value={values.aadhaar} onChange={setField("aadhaar")} />
                </label>
                <label className="cd-field">
                  <span>Mobile number</span>
                  <input className="input-modern pp-input" inputMode="numeric" value={values.mobile} onChange={setField("mobile")} />
                </label>
                <label className="cd-field">
                  <span>ABHA number</span>
                  <input className="input-modern pp-input" inputMode="numeric" value={values.abha_number} onChange={setField("abha_number")} />
                </label>
              </div>
            </section>

            {refusal && (
              <div className="pp-state is-error cd-refusal">
                <AlertTriangle size={16} />
                <div>{refusal}</div>
              </div>
            )}

            <div className="cd-actions">
              {waiting ? (
                <>
                  <span className="pp-muted">
                    <span className="spinner cd-spinner" /> Waiting for {active?.payer_id || payer?.code} to answer
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
          <section className="cd-section cd-covers">
            <div className="cd-section-title">Cover returned</div>
            {active.status === "failed" ? (
              <div className="pp-state is-error">
                <AlertTriangle size={16} />
                <div>{active.error || "The payer refused the discovery."}</div>
              </div>
            ) : (active.covers || []).length === 0 ? (
              <div className="pp-muted">
                The payer answered with no cover for this person. Check the identifiers and ask again, or ask another payer.
              </div>
            ) : (
              <div className="cd-tiles">
                {active.covers.map((cover) => {
                  const key = `${cover.policy_code}|${cover.member_id || ""}`;
                  const src = photoSrc(cover.photo);
                  return (
                    <button
                      type="button"
                      key={key}
                      className="cd-tile"
                      disabled={!!adopting || locked}
                      onClick={() => handleChoose(active, cover)}
                    >
                      <div className="cd-tile-person">
                        {src ? <img className="cd-avatar" src={src} alt="" /> : <span className="cd-avatar">{initials(cover.name)}</span>}
                        <div>
                          <div className="cd-tile-name">{cover.name || "Unnamed member"}</div>
                          <div className="pp-muted">
                            {[humanize(cover.gender, ""), cover.dob ? `born ${formatDate(cover.dob)}` : "", cover.relationship]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          <div className="pp-muted">
                            {[cover.member_id && `Member ${cover.member_id}`, cover.abha_number && `ABHA ${cover.abha_number}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          {cover.address && <div className="pp-muted">{cover.address}</div>}
                        </div>
                      </div>
                      <div className="cd-tile-policy">
                        <span className="pp-product">{cover.plan_name || active.payer_id}</span>
                        <span className="pp-mono">{cover.policy_code}</span>
                        {cover.members_on_cover > 1 && <span className="pp-muted">{cover.members_on_cover} members on this cover</span>}
                      </div>
                      <div className="cd-figures">
                        <div>
                          <span className="pp-amount-key">Sum insured</span>
                          <span className="pp-amount">{formatMoney(cover.sum_insured)}</span>
                        </div>
                        <div>
                          <span className="pp-amount-key">Valid until</span>
                          <span>{formatDate(cover.valid_until)}</span>
                        </div>
                        <div>
                          <span className="pp-amount-key">Status</span>
                          <span className={`pp-status${/active|in.?force/i.test(cover.status || "") ? " is-active" : ""}`}>
                            {humanize(cover.status)}
                          </span>
                        </div>
                      </div>
                      {adopting === key && <div className="pp-muted">Selecting…</div>}
                    </button>
                  );
                })}
              </div>
            )}
            {adoptError && (
              <div className="pp-state is-error">
                <AlertTriangle size={16} />
                <div>{adoptError}</div>
              </div>
            )}
          </section>
        )}
        {pollError && <div className="pp-muted cd-help cd-poll-error">Could not poll the gateway: {pollError}</div>}

        {discoveries.length > 0 && (
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
                  <span className="cd-sent-title">Discovery</span>
                  <span className={`cd-chip ${STATE_TONES[d.status] || ""}`}>{d.status}</span>
                  <code className="pp-lookup-code">{d.payer_id}</code>
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
    </div>
  );
}
