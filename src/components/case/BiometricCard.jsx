import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../api";
import { usePoll } from "../../hooks/usePoll";
import { captureFromDevice, sealAadhaar } from "../../biometric";
import { formatDateTime } from "../../format";

const METHODS = [
  ["FACE_AUTH", "Face"],
  ["FINGERPRINT", "Fingerprint"],
  ["IRIS", "Iris"],
];
const METHOD_WORD = { FACE_AUTH: "face", FINGERPRINT: "fingerprint", IRIS: "iris" };
const DEVICE_PROMPT = { FINGERPRINT: "Place the finger on the device.", IRIS: "Hold the eye to the device." };
const TITLES = { Preauth: "Beneficiary verification", Discharge: "Discharge verification" };
const POLL_MS = 4000;

function cardState(card) {
  const held = card?.current;
  if (held) {
    const when = formatDateTime(held.verified_at);
    return { label: "Verified", tone: "is-ok", text: `By ${METHOD_WORD[held.auth_method]} at ${when}.` };
  }
  if (card?.latest?.status === "verified") return { label: "Verification lapsed", tone: "is-warn", text: "Verify the patient again, or fill the consent form." };
  return { label: "Not verified", tone: "is-warn", text: "Until the patient is verified, the signed consent form stands in." };
}

function Panel({ attempt, qrUrl, captured, aadhaar, mobile, pid, busy, setAadhaar, setMobile, setPid, onDevice, onVerify, onCancel }) {
  const face = attempt.auth_method === "FACE_AUTH";
  const ready = face ? captured && /^\d{12}$/.test(aadhaar) && /^\d{10}$/.test(mobile) : pid.trim().length > 0;
  return (
    <div className="cv-card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {face && (
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ background: "#fff", padding: 8, borderRadius: 8, lineHeight: 0 }}>
            <QRCodeSVG value={qrUrl} size={144} />
          </div>
          <div>
            <div className="cv-row-title">Ask the patient to scan the code with the ABHA app</div>
            <div className="cv-row-sub" role="status">{captured ? "Scan finished. Enter the details below." : "Waiting for the scan to finish…"}</div>
          </div>
        </div>
      )}
      {face && captured && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 200px" }}>
            <span className="cv-row-title">Aadhaar number</span>
            <input className="cv-ctl" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ""))} />
            <span className="cv-row-sub">Sealed on this page. Never sent or stored in clear.</span>
          </label>
          <label style={{ flex: "1 1 200px" }}>
            <span className="cv-row-title">Aadhaar-linked mobile</span>
            <input className="cv-ctl" inputMode="numeric" autoComplete="off" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} />
          </label>
        </div>
      )}
      {!face && (
        <>
          <div className="cv-row-title">{DEVICE_PROMPT[attempt.auth_method]}</div>
          <div><button type="button" className="cv-btn" disabled={busy} onClick={onDevice}>Capture from the device</button></div>
          <label>
            <span className="cv-row-title">PID block from the device</span>
            <textarea className="cv-ctl" rows={4} value={pid} onChange={(e) => setPid(e.target.value)} />
            <span className="cv-row-sub">Paste it here when the device is on another machine.</span>
          </label>
        </>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="cv-btn is-primary" disabled={busy || !ready} onClick={onVerify}>Verify</button>
        <button type="button" className="cv-btn" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Card({ caseId, stage, readOnly, onVerified, onCard }) {
  const [card, setCard] = useState(null);
  const [method, setMethod] = useState("FACE_AUTH");
  const [panel, setPanel] = useState(null);
  const [captured, setCaptured] = useState(false);
  const [aadhaar, setAadhaar] = useState("");
  const [mobile, setMobile] = useState("");
  const [pid, setPid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    return api
      .getBiometric(caseId, stage)
      .then((res) => {
        setCard(res);
        onCard?.(res);
      })
      .catch((err) => setError(err?.message || "Could not read the verification."));
  }, [caseId, stage, onCard]);

  useEffect(() => {
    load();
  }, [load]);

  const attemptId = panel?.attempt?.id;
  const polling = panel?.attempt?.auth_method === "FACE_AUTH" && !captured;
  usePoll(
    (signal) =>
      api
        .captureBiometric(caseId, attemptId)
        .then((res) => !signal.aborted && res?.capture_status === "COMPLETE" && setCaptured(true))
        .catch((err) => {
          if (signal.aborted) return;
          setError(err?.message || "Could not read the scan.");
          setPanel(null);
        }),
    { active: polling ? attemptId : null, intervalMs: POLL_MS, immediate: false },
  );

  const closePanel = () => {
    setPanel(null);
    setCaptured(false);
    setAadhaar("");
    setMobile("");
    setPid("");
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    closePanel();
    try {
      setPanel(await api.startBiometric(caseId, { stage, auth_method: method }));
    } catch (err) {
      setError(err?.message || "Could not start the verification.");
      load();
    } finally {
      setBusy(false);
    }
  };

  const device = async () => {
    setBusy(true);
    setError(null);
    try {
      setPid(await captureFromDevice(panel.attempt.auth_method));
    } catch (err) {
      setError(err?.message || "The device did not capture.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const face = panel.attempt.auth_method === "FACE_AUTH";
      const body = face ? { aadhaar_encrypted: await sealAadhaar(panel.abha_public_key, aadhaar), mobile } : { pid };
      await api.verifyBiometric(caseId, panel.attempt.id, body);
      closePanel();
      await load();
      onVerified?.();
    } catch (err) {
      setError(err?.message || "The verification failed.");
      closePanel();
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!card?.required) return null;
  const state = cardState(card);
  return (
    <section className="cv-card" aria-label={TITLES[stage]}>
      <div className="cv-card-head">
        <h2 className="cv-card-title">{TITLES[stage]}</h2>
        <span className={`cv-chip ${state.tone}`}>{state.label}</span>
      </div>
      <div className="cv-card-intro">{state.text}</div>
      {error && <div className="cv-card-body"><div className="cv-notice is-bad"><div className="cv-notice-body">{error}</div></div></div>}
      {!readOnly && !panel && (
        <div className="cv-card-body" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {METHODS.map(([value, label]) => (
            <button key={value} type="button" className={`cv-btn${method === value ? " is-primary" : ""}`} aria-pressed={method === value} onClick={() => setMethod(value)}>
              {label}
            </button>
          ))}
          <button type="button" className="cv-btn" style={{ marginLeft: "auto" }} disabled={busy} onClick={start}>
            {card?.current ? "Verify again" : "Verify the patient"}
          </button>
        </div>
      )}
      {panel && (
        <Panel
          attempt={panel.attempt}
          qrUrl={panel.qr_url}
          captured={captured}
          aadhaar={aadhaar}
          mobile={mobile}
          pid={pid}
          busy={busy}
          setAadhaar={setAadhaar}
          setMobile={setMobile}
          setPid={setPid}
          onDevice={device}
          onVerify={verify}
          onCancel={closePanel}
        />
      )}
    </section>
  );
}

export default function BiometricCard({ caseId, stage, readOnly, onVerified, onCard }) {
  if (!caseId) return null;
  return <Card key={`${caseId}-${stage}`} caseId={caseId} stage={stage} readOnly={readOnly} onVerified={onVerified} onCard={onCard} />;
}
