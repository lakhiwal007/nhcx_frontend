import { useState } from "react";
import { api } from "../../../api";

export default function GiveUpPreauth({ caseId, onDone }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const giveUp = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.giveUpPreauth(caseId);
      setAsking(false);
      await onDone?.();
    } catch (e) {
      setError(e?.message || "The request could not be given up. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cv-notice is-warn cv-sub-note-top">
      <div className="cv-notice-body">
        <div>
          No answer from the payer. Give up to resend, change the package or close the case.
        </div>
        {error && <div className="cv-sub-note-top">{error}</div>}
        <div className="cv-sub-note-top">
          {asking ? (
            <>
              <button type="button" className="cv-btn is-primary" disabled={busy} onClick={giveUp}>
                {busy ? "Giving up…" : "Yes, give up on it"}
              </button>{" "}
              <button type="button" className="cv-btn" disabled={busy} onClick={() => setAsking(false)}>
                Keep waiting
              </button>
            </>
          ) : (
            <button type="button" className="cv-btn" onClick={() => setAsking(true)}>
              Give up on this request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
