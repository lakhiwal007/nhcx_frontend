import { NeedsYouPanel } from "./NeedsYou";
import { stageAmounts } from "./caseStages";
import { formatMoney, formatDateTime } from "../../../lib/format.js";

function MoneyRow({ label, value, due = false, note }) {
  return (
    <div className="cv-rkv">
      <span>
        {label}
        {note && <small> {note}</small>}
      </span>
      <b className={value != null && due ? "is-due" : undefined}>{value != null ? formatMoney(value) : "—"}</b>
    </div>
  );
}

export default function CaseRail({ moneyLedger, effectiveCase, asks, events = [], notes = [], onOpenNotes, onOpenHistory }) {
  const amounts = stageAmounts({ moneyLedger, effectiveCase });
  const requested = amounts.review;
  const approved = amounts.claim || amounts.status;
  const payable = moneyLedger?.reconciliation?.to_collect_from_patient ?? moneyLedger?.patient_payable?.value;
  const estimate = payable != null && moneyLedger?.patient_payable?.confidence === "estimated";
  const recent = [...events].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0)).slice(0, 3);
  const latestNote = notes[0] || null;

  return (
    <aside className="cv-rail" aria-label="Money, messages, history and notes">
      <section className="cv-rcard">
        <h3>Money</h3>
        <MoneyRow label={requested?.word === "billed" ? "Billed" : "Requested"} value={requested?.value} />
        <MoneyRow label={approved?.word === "approved" ? "Approved" : "Authorised"} value={approved?.value} />
        <MoneyRow label="Patient pays" value={payable} due={payable > 0} note={estimate ? "(estimate)" : null} />
      </section>

      {asks.items.length > 0 && <NeedsYouPanel {...asks} />}

      {recent.length > 0 && (
        <section className="cv-rcard">
          <h3>History</h3>
          <ol className="cv-rev">
            {recent.map((e) => (
              <li key={e.id ?? e.seq}>
                <b>{e.title}</b>
                <small>{[e.summary, formatDateTime(e.ts, null)].filter(Boolean).join(" · ")}</small>
              </li>
            ))}
          </ol>
          {onOpenHistory && (
            <button type="button" className="cv-rlink" onClick={onOpenHistory}>
              Full history
            </button>
          )}
        </section>
      )}

      {onOpenNotes && (
        <section className="cv-rcard">
          <h3>Notes{notes.length ? ` (${notes.length})` : ""}</h3>
          {latestNote ? (
            <>
              <p className="cv-rnote">{latestNote.body}</p>
              <small className="cv-rby">{[latestNote.author_name, formatDateTime(latestNote.created_at, null)].filter(Boolean).join(" · ")}</small>
            </>
          ) : (
            <p className="cv-rby">No notes yet.</p>
          )}
          <button type="button" className="cv-rlink" onClick={onOpenNotes}>
            {notes.length ? "All notes" : "Add a note"}
          </button>
        </section>
      )}
    </aside>
  );
}
