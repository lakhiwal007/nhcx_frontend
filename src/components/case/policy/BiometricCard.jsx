import { useCallback, useEffect, useId, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Fingerprint, ScanFace, Eye } from "lucide-react";
import { api, markHandled } from "../../../api";
import { usePoll } from "../../../hooks/util/usePoll";
import { toast } from "../../../lib/toast";
import { captureFromDevice, sealAadhaar } from "../../../domain/biometric";
import { formatDateTime } from "../../../lib/format";
import RefreshButton from "../../ui/RefreshButton";
import CopyButton from "../../ui/CopyButton";

const METHODS = [
  { value: "FACE_AUTH", label: "Face", icon: ScanFace, hint: "The patient scans a code with the ABHA app on their phone." },
  { value: "FINGERPRINT", label: "Fingerprint", icon: Fingerprint, hint: "A registered fingerprint device on this machine, or a PID block pasted from another." },
  { value: "IRIS", label: "Iris", icon: Eye, hint: "A registered iris device on this machine, or a PID block pasted from another." },
];
const METHOD_WORD = { FACE_AUTH: "face", FINGERPRINT: "fingerprint", IRIS: "iris" };
const DEVICE_PROMPT = { FINGERPRINT: "Ask the patient to place a finger on the device, then capture.", IRIS: "Ask the patient to look into the device, then capture." };
const TITLES = { Preauth: "Beneficiary verification", Discharge: "Discharge verification" };
const POLL_MS = 4000;

function cardState(card) {
  const held = card?.current;
  if (held) return { label: "Verified", tone: "ok", text: `Verified by ${METHOD_WORD[held.auth_method] || "biometrics"} at ${formatDateTime(held.verified_at)}.` };
  if (card?.latest?.status === "verified") return { label: "Lapsed", tone: "warn", text: "The earlier verification has lapsed. Verify the patient again, or let the signed consent form stand in." };
  return { label: "Not verified", tone: "warn", text: "Until the patient is verified, the signed consent form stands in." };
}

function Steps({ steps, current }) {
  return (
    <ol className="bio-steps" aria-label="Steps">
      {steps.map((label, i) => (
        <li key={label} className={i < current ? "is-done" : i === current ? "is-current" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="bio-step-dot">{i < current ? <CheckCircle2 size={12} aria-hidden="true" /> : i + 1}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function FacePanel({ ids, qrUrl, captured, aadhaar, mobile, setAadhaar, setMobile }) {
  return (
    <>
      <Steps steps={["Scan the code", "Enter Aadhaar and mobile", "Verify"]} current={captured ? 1 : 0} />
      <div className="bio-face">
        <div className="bio-qr">
          <QRCodeSVG value={qrUrl} size={144} />
        </div>
        <div className="bio-face-text">
          <div className="cv-row-title">Ask the patient to scan this with the ABHA app</div>
          <div className={`cv-row-sub bio-wait${captured ? " is-done" : ""}`} role="status">
            {captured ? (
              <>
                <CheckCircle2 size={14} aria-hidden="true" /> Scan finished. Enter the patient's details below.
              </>
            ) : (
              <>
                <span className="spinner bio-spinner" aria-hidden="true" /> Waiting for the scan to finish. This page checks on its own.
              </>
            )}
          </div>
        </div>
      </div>
      {captured && (
        <div className="cv-form-grid">
          <div className="cv-field-stack">
            <label className="cv-field-key" htmlFor={`${ids}-aadhaar`}>
              Aadhaar number
            </label>
            <input id={`${ids}-aadhaar`} className="cv-ctl cv-ctl-fill cv-mono" type="password" inputMode="numeric" autoComplete="off" maxLength={12} placeholder="12 digits" value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ""))} />
            <span className="cv-card-meta">Sealed in this browser before it leaves. Never sent or stored in clear.</span>
          </div>
          <div className="cv-field-stack">
            <label className="cv-field-key" htmlFor={`${ids}-mobile`}>
              Aadhaar-linked mobile
            </label>
            <input id={`${ids}-mobile`} className="cv-ctl cv-ctl-fill cv-mono" inputMode="numeric" autoComplete="off" maxLength={10} placeholder="10 digits" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
      )}
    </>
  );
}

function DevicePanel({ ids, method, pid, setPid, capturing, captured, onDevice }) {
  return (
    <>
      <Steps steps={["Capture", "Verify"]} current={captured ? 1 : 0} />
      <div className="cv-row-title">{DEVICE_PROMPT[method]}</div>
      <div className="bio-device-row">
        <button type="button" className="cv-btn" disabled={capturing} onClick={onDevice}>
          {capturing ? "Looking for the device…" : captured ? "Capture again" : "Capture from the device"}
        </button>
        {capturing && <span className="cv-card-meta">Checking the machine's RD service. This can take up to twenty seconds.</span>}
        {captured && !capturing && (
          <span className="bio-wait is-done" role="status">
            <CheckCircle2 size={14} aria-hidden="true" /> Captured from the device.
          </span>
        )}
        {!capturing && <CopyButton value={pid} label="Copy raw PID" />}
      </div>
      <details className="bio-paste" open={!!pid && !captured}>
        <summary className="cv-link">Paste a PID block from another machine instead</summary>
        <div className="cv-field-stack bio-paste-body">
          <label className="cv-field-key" htmlFor={`${ids}-pid`}>
            PID block from the device
          </label>
          <textarea id={`${ids}-pid`} className="cv-ctl cv-ctl-fill cv-textarea cv-mono bio-pid" rows={5} placeholder="<PidData>…</PidData>" value={pid} onChange={(e) => setPid(e.target.value)} />
        </div>
      </details>
    </>
  );
}

function Card({ caseId, stage, readOnly, onVerified, onCard }) {
  const ids = useId();
  const [card, setCard] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [method, setMethod] = useState("FACE_AUTH");
  const [panel, setPanel] = useState(null);
  const [captured, setCaptured] = useState(false);
  const [deviceCaptured, setDeviceCaptured] = useState(false);
  const [aadhaar, setAadhaar] = useState("");
  const [mobile, setMobile] = useState("");
  const [pid, setPid] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    return api
      .getBiometric(caseId, stage)
      .then((res) => {
        setCard(res);
        setLoadError(null);
        onCard?.(res);
      })
      .catch((err) => {
        markHandled(err);
        setLoadError(err?.message || "The verification could not be read.");
      });
  }, [caseId, stage, onCard]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const attemptId = panel?.attempt?.id;
  const face = panel?.attempt?.auth_method === "FACE_AUTH";
  usePoll(
    (signal) =>
      api
        .captureBiometric(caseId, attemptId)
        .then((res) => !signal.aborted && res?.capture_status === "COMPLETE" && setCaptured(true))
        .catch((err) => {
          if (signal.aborted) return;
          markHandled(err);
          setError(err?.message || "The scan could not be checked. This page keeps trying.");
        }),
    { active: face && !captured ? attemptId : null, intervalMs: POLL_MS, immediate: false },
  );

  const reset = () => {
    setPanel(null);
    setCaptured(false);
    setDeviceCaptured(false);
    setAadhaar("");
    setMobile("");
    setPid("");
    setError(null);
    setFailed(false);
  };

  const start = async () => {
    setBusy("start");
    setError(null);
    try {
      const res = await api.startBiometric(caseId, { stage, auth_method: method });
      setCaptured(false);
      setDeviceCaptured(false);
      setPid("");
      setFailed(false);
      setPanel(res);
    } catch (err) {
      markHandled(err);
      setError(err?.message || "The verification could not be started.");
      load();
    } finally {
      setBusy(null);
    }
  };

  const device = async () => {
    setBusy("device");
    setError(null);
    try {
      setPid(await captureFromDevice(panel.attempt.auth_method));
      setDeviceCaptured(true);
    } catch (err) {
      setDeviceCaptured(false);
      setError(err?.message || "The device did not capture.");
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    setBusy("verify");
    setError(null);
    try {
      const body = face ? { aadhaar_encrypted: await sealAadhaar(panel.abha_public_key, aadhaar), mobile } : { pid };
      await api.verifyBiometric(caseId, panel.attempt.id, body);
      reset();
      await load();
      toast.success("Patient verified");
      onVerified?.();
    } catch (err) {
      markHandled(err);
      setError(err?.message || "The verification failed.");
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  if (loadError && !card) {
    return (
      <section className="cv-card" aria-label={TITLES[stage]}>
        <div className="cv-card-head">
          <h2 className="cv-card-title">{TITLES[stage]}</h2>
        </div>
        <div className="cv-card-body">
          <div className="cv-notice is-warn">
            <div className="cv-notice-body">The verification could not be read: {loadError}</div>
            <div className="cv-notice-actions">
              <button type="button" className="cv-btn" onClick={load}>
                Retry
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }
  if (!card?.required) return null;

  const state = cardState(card);
  const picked = METHODS.find((m) => m.value === method) || METHODS[0];
  const ready = panel ? (face ? captured && /^\d{12}$/.test(aadhaar) && /^\d{10}$/.test(mobile) : pid.trim().length > 0) : false;
  const working = !!busy;

  return (
    <section className="cv-card" aria-label={TITLES[stage]}>
      <div className="cv-card-head">
        <h2 className="cv-card-title">{TITLES[stage]}</h2>
        <span className={`cv-chip is-${state.tone}`}>{state.label}</span>
        <span className="cv-card-meta">{state.text}</span>
        <RefreshButton iconOnly label="Refresh the verification" onClick={load} />
      </div>

      {error && (
        <div className="cv-card-body">
          <div className="cv-notice is-bad" role="alert">
            <div className="cv-notice-body">{error}</div>
          </div>
        </div>
      )}

      {!readOnly && !panel && (
        <div className="cv-card-body bio-start">
          <div className="cv-field-stack">
            <span className="cv-field-key">How to verify</span>
            <div className="bio-methods" role="group" aria-label="Verification method">
              {METHODS.map((m) => (
                <button key={m.value} type="button" className="cv-fchip bio-method" aria-pressed={method === m.value} onClick={() => setMethod(m.value)}>
                  <m.icon size={14} aria-hidden="true" /> {m.label}
                </button>
              ))}
            </div>
            <span className="cv-card-meta">{picked.hint}</span>
          </div>
          <div className="cv-pane-action">
            <button type="button" className="cv-btn" disabled={working} onClick={start}>
              {busy === "start" ? "Starting…" : card.current ? "Verify again" : "Verify the patient"}
            </button>
          </div>
        </div>
      )}

      {panel && (
        <div className="cv-card-body bio-panel">
          <div className="cv-kv bio-method-line">
            <span>Method</span>
            <span>
              <picked.icon size={14} aria-hidden="true" /> {picked.label}
            </span>
          </div>
          {face ? (
            <FacePanel ids={ids} qrUrl={panel.qr_url} captured={captured} aadhaar={aadhaar} mobile={mobile} setAadhaar={setAadhaar} setMobile={setMobile} />
          ) : (
            <DevicePanel ids={ids} method={panel.attempt.auth_method} pid={pid} setPid={setPid} capturing={busy === "device"} captured={deviceCaptured} onDevice={device} />
          )}
          <div className="bio-actions">
            <button type="button" className="cv-btn is-primary" disabled={working || !ready} title={ready ? undefined : face ? "Finish the scan and enter the Aadhaar number and mobile first." : "Capture from the device or paste the PID block first."} onClick={verify}>
              {busy === "verify" ? "Verifying…" : "Verify"}
            </button>
            {failed && (
              <button type="button" className="cv-btn" disabled={working} onClick={start}>
                Start over
              </button>
            )}
            <button type="button" className="cv-btn" disabled={working} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function BiometricCard({ caseId, stage, readOnly, onVerified, onCard }) {
  if (!caseId) return null;
  return <Card key={`${caseId}-${stage}`} caseId={caseId} stage={stage} readOnly={readOnly} onVerified={onVerified} onCard={onCard} />;
}
