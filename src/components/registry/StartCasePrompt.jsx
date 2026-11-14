import { useState } from "react";
import { api, markHandled } from "../../api";
import ConfirmModal from "../ui/ConfirmModal";
import Dropdown from "../ui/Dropdown";
import { CaseStatusChip } from "../ui/caseJourney";
import { CLOSE_REASONS } from "../case/frame/closeReasons.js";
import { formatCaseRef, formatDate } from "../../lib/format.js";
import "../case/frame/case-v2.css";

const QUICK_REASONS = CLOSE_REASONS.filter((r) => r.value !== "other");

export default function StartCasePrompt({ prompt, onCancel, onStart }) {
  const [reason, setReason] = useState("duplicate_case");
  const [rows, setRows] = useState({});

  const close = async (id) => {
    setRows((prev) => ({ ...prev, [id]: { busy: true } }));
    try {
      await api.closeCase(id, { reason });
      setRows((prev) => ({ ...prev, [id]: { closed: true } }));
    } catch (err) {
      markHandled(err);
      setRows((prev) => ({ ...prev, [id]: { error: err?.message || "The case could not be closed." } }));
    }
  };

  const cases = prompt?.cases || [];
  const busy = Object.values(rows).some((r) => r.busy);

  return (
    <ConfirmModal
      open={!!prompt}
      title={cases.length === 1 ? "An older case is still open" : `${cases.length} older cases are still open`}
      subtitle="Close the ones this new case replaces so they leave the work queue. Nothing is sent to the payer, and a closed case can be reopened."
      confirmLabel="Start the new case"
      busy={busy}
      onCancel={onCancel}
      onConfirm={() => onStart(prompt.visit)}
    >
      <div className="cc-close-form">
        <div className="cc-close-field">
          <span className="cc-close-label">Reason for closing</span>
          <Dropdown ariaLabel="Reason for closing" value={reason} options={QUICK_REASONS} onChange={setReason} />
        </div>
        <ul className="cc-close-list">
          {cases.map((c) => {
            const row = rows[c.cashless_case_id] || {};
            return (
              <li key={c.cashless_case_id} className="cc-close-row">
                <span className="cc-close-ref">{formatCaseRef(c.cashless_case_id)}</span>
                <CaseStatusChip claim={c} />
                {c.created_at && <span className="cc-close-when">opened {formatDate(c.created_at)}</span>}
                <span className="cc-close-act">
                  {row.closed ? (
                    <span className="cc-close-done">Closed</span>
                  ) : (
                    <button type="button" className="cv-btn" disabled={row.busy} onClick={() => close(c.cashless_case_id)}>
                      {row.busy ? "Closing…" : "Close"}
                    </button>
                  )}
                </span>
                {row.error && <span className="cc-close-error">{row.error}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </ConfirmModal>
  );
}
