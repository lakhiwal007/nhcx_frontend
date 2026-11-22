import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, FileJson, ArrowRight } from "lucide-react";
import { DocumentChecklist } from "../ui/Common";
import { formatDate, formatMoney } from "../../lib/format.js";
import PatientDetailsForm from "../case/forms/PatientDetailsForm";
import PayerAsks from "../case/asks/PayerAsks";
import SentFiles from "../case/asks/SentFiles";
import BiometricCard from "../case/policy/BiometricCard";
import FhirBundleModal from "../ui/FhirBundleModal";
import ConfirmModal from "../ui/ConfirmModal";
import SendGateModal from "../case/step/SendGateModal";
import ReviewSendModal from "../case/step/ReviewSendModal";
import DropToAttach from "../case/step/DropToAttach";
import PayerName from "../ui/PayerName";
import { toast } from "../../lib/toast";
import { burst } from "../../lib/confetti";
import LinesEditor from "../case/forms/LinesEditor";
import PackageLines from "../eligibility/PackageLines";
import DiagnosesEditor from "../case/forms/DiagnosesEditor";
import CaseStep, { Pane, Verdict } from "../case/step/CaseStep";
import { useCasePane } from "../case/step/useCasePane";
import { useCaseLock } from "../../hooks/case/useCaseLock";
import { usePreauthDraft } from "../../hooks/workflow/usePreauthDraft";
import { useSendGate } from "../../hooks/util/useSendGate";
import { fieldList, NEWBORN_MISSING } from "../case/forms/fieldLabels";
import { firstPreauthItem } from "../case/preauth/preauthChecklist";

export default function PreauthDraft({ ctx }) {
  const navigate = useNavigate();
  const { caseState, cashlessCase } = ctx;
  const { cashless_case_id, claim_id } = caseState;
  const lock = useCaseLock(ctx, "review");
  const preauthAlreadyLive = !!(caseState.preauthCorrelationId || caseState.preauthDecision || cashlessCase?.preauth_status || cashlessCase?.preauth?.correlation_id);
  const locked = lock.viewOnly || lock.settled;
  const sentCorrelationId = caseState.preauthCorrelationId || cashlessCase?.preauth?.correlation_id || null;

  const [biometric, setBiometric] = useState(null);
  const d = usePreauthDraft(ctx, {
    locked: locked || preauthAlreadyLive,
    biometric,
    onSent: (res) => {
      burst();
      navigate("../status", { state: { preauthWarnings: res?.warnings || [] } });
    },
  });
  const gate = useSendGate({ caseId: d.caseId, waived: d.warnAsks, label: "Pre-auth", onSend: d.send.run });
  const pane = useCasePane();
  const [confirmResend, setConfirmResend] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [review, setReview] = useState(false);

  useEffect(() => {
    if (!cashless_case_id && !claim_id) navigate("../payer", { replace: true });
  }, [cashless_case_id, claim_id, navigate]);

  const groups = d.groups;
  const rows = groups.flatMap((g) => g.rows);
  const blockers = rows.filter((r) => r.blocks);
  const toLookAt = rows.filter((r) => r.tone === "warn" && !r.his).length;
  const canSubmit = d.missingFields.length === 0 && !d.notInForce && blockers.length === 0 && !d.send.busy;
  const open = pane.picked || firstPreauthItem(groups);
  const mustDo = blockers.length + (d.notInForce ? 1 : 0) + (d.hisBlockers.length + d.newbornMissing.length > 0 ? 1 : 0);

  const chip = d.error
    ? ["Could not build the draft", "warn"]
    : preauthAlreadyLive
    ? ["Sent", "info"]
    : locked
      ? ["Not sent", "todo"]
      : canSubmit || d.send.busy
        ? [toLookAt ? `Ready to send · ${toLookAt} good to check` : "Ready to send", toLookAt ? "warn" : "ok"]
        : [`${mustDo} ${mustDo === 1 ? "thing" : "things"} left before you can send`, "warn"];

  const primary = d.error
    ? { label: "Send pre-auth", icon: Send, disabled: true, reason: "The draft could not be built." }
    : preauthAlreadyLive
    ? { label: "View decision", icon: ArrowRight, write: false, onClick: () => navigate("../status") }
    : locked
      ? null
      : {
          label: d.send.busy ? "Sending…" : "Send pre-auth",
          icon: Send,
          busy: d.send.busy,
          busyLabel: "Sending…",
          disabled: !canSubmit,
          reason: d.notInForce
            ? "The payer says this policy is not active."
            : blockers.length
              ? `First: ${blockers.map((r) => r.name.toLowerCase()).join(", ")}.`
              : d.hisBlockers.length
                ? `The hospital records are missing ${fieldList(d.hisBlockers)}.`
                : "Finish the marked items first.",
          onClick: () => setReview(true),
        };

  const secondary = [
    preauthAlreadyLive && sentCorrelationId && d.caseId && { label: "View what was sent", icon: FileJson, write: false, onClick: () => setShowSent(true) },
  ];
  const more = [
    preauthAlreadyLive && !lock.settled && !lock.viewOnly && { label: "Send a fresh pre-auth…", disabled: !canSubmit, reason: "Finish the marked items first.", onClick: () => setConfirmResend(true) },
  ];

  const notes = [
    d.send.error && { tone: "bad", text: `Not sent: ${d.send.error} Fix what the message names and send again; your draft is kept.` },
    gate.error && { tone: "bad", text: gate.error },
    d.asksError && { tone: "warn", text: `We could not reload what the payer needs, so the list may be out of date: ${d.asksError}` },
    d.notInForce && !preauthAlreadyLive && { tone: "bad", text: "The payer says this policy is not active, so a pre-auth cannot be sent. Choose a renewed or different policy, or treat the patient as cash.", action: { label: "Go to Policy", onClick: () => navigate("../payer") } },
    preauthAlreadyLive && {
      tone: "info",
      text: `A pre-auth has already been sent${lock.movedOnLabel ? ` and the case has moved on to ${lock.movedOnLabel}` : ""}. This form is rebuilt from current records, not what was sent.`,
      action: lock.movedOnTo ? { label: `Go to ${lock.movedOnLabel}`, onClick: () => navigate(`../${lock.movedOnTo}`) } : null,
    },
    lock.viewOnly && { tone: "info", text: lock.reason },
    d.hisBlockers.length > 0 && { tone: "warn", text: `The hospital records are missing ${fieldList(d.hisBlockers)}. Ask the doctor or billing desk to add it, then reload this page.` },
    d.newbornMissing.length > 0 && !preauthAlreadyLive && { tone: "warn", text: `Newborn case: ${d.newbornMissing.map((f) => NEWBORN_MISSING[f] || fieldList([f])).join("; ")}.` },
    d.eligibility && d.eligibility.status !== "complete" && !preauthAlreadyLive && { tone: "warn", text: "The eligibility check is not finished, so the payer's answer may still change." },
    d.memberUnchosen && !preauthAlreadyLive && { tone: "warn", text: `This policy has ${d.cardMembers.length} people on it. Choose the one who is the patient.`, action: { label: "Choose the patient", onClick: () => navigate("../prep") } },
  ];

  const dropFiles = async (files) => {
    const base = d.docs.length;
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const code = d.documents.addCustom();
      d.documents.rename(base + i, file.name);
      const uploaded = await d.documents.attachFile(base + i, file);
      const undo = () => d.documents.setDocuments((docs) => docs.filter((doc) => doc.code !== code));
      if (uploaded) toast.success(`${file.name} attached to Other files`, { duration: 7000, action: { label: "Undo", onClick: undo } });
      else {
        undo();
        toast.error(`${file.name} could not be attached. Check that it is a PDF or a photo and not too large, then try again.`);
      }
    }
  };

  const draft = d.draft;
  const accommodation = draft?.accommodation || {};
  const known = {
    abha: draft?.patient?.abha,
    member_id: draft?.patient?.member_id,
    dob: draft?.patient?.dob,
    admission_date: draft?.admission_date,
    discharge_date: draft?.discharge_date,
    policy_number: draft?.policy_number,
  };
  const resetLink = (edited, onReset) =>
    edited && !locked && !preauthAlreadyLive ? (
      <span className="cv-card-tools">
        <button type="button" className="cv-link" onClick={onReset}>
          Reset to hospital record
        </button>
      </span>
    ) : null;

  return (
    <>
      <CaseStep
        ctx={ctx}
        verdict={
          <Verdict
            ctx={ctx}
            chip={chip[0]}
            chipTone={chip[1]}
            summary={
              draft && (
                <>
                  <strong>{formatMoney(d.effectiveTotal)}</strong> asked for · {d.displayItems.length} {d.displayItems.length === 1 ? "treatment" : "treatments"}
                  {d.edited.items ? " · edited" : ""}
                  {d.editsSaved ? " · edits saved on this browser" : ""}
                </>
              )
            }
            notes={notes}
            primary={primary}
            secondary={secondary}
            more={more}
          />
        }
        checklist={groups}
        open={open}
        onOpen={pane.openItem}
        checklistLabel="Pre-auth checklist"
        loading={d.loading}
        loadingText="Building the pre-auth draft…"
        error={d.error}
        onRetry={d.reload}
        paneRef={pane.paneRef}
        sendStep
      >
        <Pane id="verify">
          <BiometricCard
            caseId={d.caseId}
            stage="Preauth"
            readOnly={locked || preauthAlreadyLive}
            onCard={setBiometric}
            onVerified={() => {
              pane.setPicked("verify");
              d.refreshAsks();
            }}
          />
        </Pane>

        {d.patientContextMissing.length > 0 && (
          <Pane id="details">
            <PatientDetailsForm
              key={d.patientContextMissing.join("|")}
              claimId={draft?.claim_id || claim_id}
              cashlessCaseId={cashless_case_id}
              missingFields={d.patientContextMissing}
              known={known}
              locked={locked || preauthAlreadyLive}
              onResolved={(remaining) => {
                d.setMissingFields(remaining);
                if (remaining.length === 0) d.reload();
              }}
            />
          </Pane>
        )}

        <Pane id="admission">
          <section className="cv-card" aria-label="Admission">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Admission</h2>
              <span className="cv-card-meta">From the hospital records.</span>
            </div>
            <div className="cv-card-body cv-cols">
              <div>
                <div className="cv-kv"><span>Admission</span><span>{draft?.admission_date ? formatDate(draft.admission_date) : "—"}</span></div>
                <div className="cv-kv"><span>Discharge</span><span>{draft?.discharge_date ? formatDate(draft.discharge_date) : "Not discharged"}</span></div>
                <div className="cv-kv"><span>Encounter</span><span>{draft?.inpatient === false ? "Out-patient" : "In-patient"}</span></div>
                <div className="cv-kv"><span>Priority</span><span>{draft?.urgent ? "Urgent" : "Routine"}</span></div>
                <div className="cv-kv"><span>Member ID</span><span className="cv-mono">{draft?.patient?.member_id || "—"}</span></div>
              </div>
              <div>
                <div className="cv-kv"><span>Ward</span><span>{accommodation.ward || "—"}</span></div>
                <div className="cv-kv"><span>Specialty</span><span>{accommodation.specialty || "—"}</span></div>
                <div className="cv-kv"><span>Room</span><span>{accommodation.room || "—"}</span></div>
                <div className="cv-kv"><span>Bed</span><span className="cv-mono">{accommodation.bed_code || "—"}</span></div>
              </div>
            </div>
          </section>
        </Pane>

        <Pane id="diagnosis">
          <section className="cv-card" aria-label="Diagnosis">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Diagnosis</h2>
              <span className="cv-card-meta">From the hospital records; correct it here if needed.</span>
              {resetLink(d.edited.diagnoses, d.resetDiagnoses)}
            </div>
            <DiagnosesEditor
              diagnoses={d.displayDiagnoses}
              locked={locked || preauthAlreadyLive}
              onChange={d.updateDiagnosis}
              onPick={d.pickDiagnosis}
              onPrimary={d.setPrimaryDiagnosis}
              onAdd={d.addDiagnosis}
              onRemove={d.removeDiagnosis}
            />
          </section>
        </Pane>

        <Pane id="justification">
          <section className="cv-card" aria-label="Reason for treatment">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Reason for treatment</h2>
              <span className="cv-card-meta">Fuller notes mean fewer payer queries.</span>
            </div>
            <div className="cv-card-body">
              {d.justification.length ? (
                d.justification.map(([label, codes]) => (
                  <div key={label} className="cv-kv">
                    <span>{label}</span>
                    <span>{codes.map((c) => c.name || c.code).join(", ")}</span>
                  </div>
                ))
              ) : (
                <div className="cv-card-meta">No complaints, findings or tests are coded on the clinical note. Ask the doctor to add them in the hospital system.</div>
              )}
            </div>
          </section>
        </Pane>

        <Pane id="team">
          <section className="cv-card" aria-label="Treating team">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Treating team</h2>
              {d.teamMissingReg > 0 && <span className="cv-chip is-warn">{d.teamMissingReg} without a registration number</span>}
              {resetLink(d.edited.careTeam, d.resetCareTeam)}
            </div>
            {d.displayCareTeam.length > 0 ? (
              <fieldset className="cv-tw cv-in-card cv-plain" disabled={locked || preauthAlreadyLive}>
                <table>
                  <thead>
                    <tr>
                      <th>Doctor</th>
                      <th>Speciality</th>
                      <th>Registration no.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.displayCareTeam.map((doc, i) => (
                      <tr key={doc.doc_id || i}>
                        <td><input className="cv-ctl cv-ctl-fill" aria-label="Doctor name" value={doc.doc_name || ""} onChange={(e) => d.updateCareTeamMember(i, "doc_name", e.target.value)} /></td>
                        <td><input className="cv-ctl cv-ctl-fill" aria-label="Speciality" value={doc.speciality_display || doc.speciality || ""} onChange={(e) => d.updateCareTeamMember(i, "speciality_display", e.target.value)} /></td>
                        <td><input className="cv-ctl cv-ctl-fill cv-mono" aria-label="Registration number" placeholder="Required" value={doc.registration_no || ""} onChange={(e) => d.updateCareTeamMember(i, "registration_no", e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </fieldset>
            ) : (
              <div className="cv-card-intro">No doctor is on record for this admission. Ask the ward to add the treating doctor in the hospital system.</div>
            )}
          </section>
        </Pane>

        {draft?.discharge_summary && (
          <Pane id="discharge">
            <section className="cv-card" aria-label="Discharge summary">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Discharge summary</h2>
              </div>
              <div className="cv-card-body">
                <div className="cv-kv"><span>Condition</span><span>{draft.discharge_summary.condition || "—"}</span></div>
                <div className="cv-kv"><span>Advice</span><span>{draft.discharge_summary.advice || "—"}</span></div>
                <div className="cv-kv"><span>Follow-up</span><span>{draft.discharge_summary.followup_on ? formatDate(draft.discharge_summary.followup_on) : "—"}</span></div>
              </div>
            </section>
          </Pane>
        )}

        <Pane id="lines">
          <section className="cv-card" aria-label="Treatment and cost">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Treatment and cost</h2>
              {d.edited.items && <span className="cv-card-meta">Edited; the amount is recomputed from the lines</span>}
              {resetLink(d.edited.items, d.resetItems)}
            </div>
            {d.unbilledProcedures.length > 0 && (
              <div className="cv-card-intro">Procedures not billed as a line: {d.unbilledProcedures.map((p) => `${p.name}${p.code ? ` (${p.code})` : ""}`).join(", ")}</div>
            )}
            {draft?.treatment?.length > 0 ? (
              <>
                <div className="cv-card-intro">
                  This payer is billed by package at its own plan's rates, so these lines are not edited here.
                  {draft?.hospital_bill_amount != null && ` The hospital bill so far is ${formatMoney(draft.hospital_bill_amount)}, for reference.`}
                  {!locked && !preauthAlreadyLive && (
                    <>
                      {" "}
                      <button type="button" className="cv-pick" onClick={() => navigate("../prep")}>Change packages</button>
                    </>
                  )}
                </div>
                {draft.treatment_missing?.length > 0 && (
                  <div className="cv-notice is-bad">
                    The payer's plan no longer lists {draft.treatment_missing.join(", ")}. Choose the package again on the Eligibility step before sending.
                  </div>
                )}
                <PackageLines lines={draft.treatment} />
              </>
            ) : (
              <LinesEditor items={d.displayItems} total={d.effectiveTotal} unspecifiedCodes={d.unspecifiedCodes} locked={locked || preauthAlreadyLive} onChange={d.updateItem} />
            )}
          </section>
        </Pane>

        <Pane id="plan">
          <section className="cv-card" aria-label="What the plan covers">
            <div className="cv-card-head">
              <h2 className="cv-card-title">What the plan covers</h2>
              <span className="cv-card-meta">Warnings; only a package priced at zero or less stops the send.</span>
            </div>
            <div className="cv-card-body">
              {d.checks.length === 0 && <div className="cv-card-meta">{d.admissibility?.status === "checked" ? "Nothing to look at." : "This draft has not been checked against a plan."}</div>}
              {d.checks.map((c, i) => (
                <div key={i} className={`cv-plan-check is-${c.level}`}>
                  {c.message}
                </div>
              ))}
              {d.admissibility?.exclusions?.length > 0 && <div className="cv-card-meta cv-sub-note-top">Excluded by the plan: {d.admissibility.exclusions.join("; ")}.</div>}
            </div>
          </section>
        </Pane>

        <Pane id="asks">
          <PayerAsks
            caseId={d.caseId}
            stage="preauth"
            asks={draft?.payer_asks}
            documents={d.docs}
            readOnly={locked || preauthAlreadyLive}
            onAttach={d.documents.attachAsk}
            onFormsChange={d.setAskForms}
            reloadKey={d.asksReload}
          />
        </Pane>

        <Pane id="files">
          {(locked || preauthAlreadyLive) && <SentFiles caseId={d.caseId} stage="preauth" />}
          <section className="cv-card" aria-label="Other files">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Other files</h2>
              <span className="cv-card-meta">Sent as supporting information. Attached files stay until sent, but reloading the page drops them.</span>
            </div>
            <div className="cv-card-body">
              <DocumentChecklist
                documents={d.otherDocs}
                onUpload={(doc, uploaded) => d.documents.attach(d.docs.indexOf(doc), uploaded)}
                onAddDocument={d.documents.addCustom}
                onRenameDocument={(i, name) => d.documents.rename(d.docs.indexOf(d.otherDocs[i]), name)}
                onRemoveDocument={(i) => d.documents.remove(d.docs.indexOf(d.otherDocs[i]))}
                onFetchRecord={(i) => d.documents.attachRecord(d.docs.indexOf(d.otherDocs[i]))}
                onDetachRecord={(i) => d.documents.detachRecord(d.docs.indexOf(d.otherDocs[i]))}
                readOnly={locked || preauthAlreadyLive}
                hideSummary
              />
            </div>
          </section>
        </Pane>
      </CaseStep>

      <SendGateModal gate={gate} busy={d.send.busy} />

      <ReviewSendModal
        open={review}
        sendLabel="Send pre-auth"
        facts={[
          ["Patient", ctx.patient?.name],
          ["Payer", (cashlessCase?.payer_id || caseState.payer?.name) && <PayerName id={cashlessCase?.payer_id} name={caseState.payer?.name} />],
          ["Policy", draft?.policy_number],
          ["Treatments", d.displayItems.length],
          ["Asking for", formatMoney(d.effectiveTotal)],
        ]}
        done={rows.filter((r) => r.tone === "ok")}
        stillOpen={toLookAt}
        onCancel={() => setReview(false)}
        onConfirm={() => {
          setReview(false);
          gate.request();
        }}
      />

      <DropToAttach enabled={!locked && !preauthAlreadyLive && !d.loading && !d.error} onFiles={dropFiles} />

      <ConfirmModal
        open={confirmResend}
        title="Send a fresh pre-auth?"
        subtitle="The payer receives a new pre-auth request for this case, built from the current records."
        confirmLabel={`Send ${formatMoney(d.effectiveTotal)} pre-auth`}
        busy={d.send.busy}
        disabled={!canSubmit}
        onCancel={() => setConfirmResend(false)}
        onConfirm={() => {
          setConfirmResend(false);
          gate.request();
        }}
      >
        <p>To answer a query, resubmit after a rejection or raise the approved amount, use the Approval stage instead. A fresh pre-auth starts the payer's review over.</p>
      </ConfirmModal>

      <FhirBundleModal open={showSent} onClose={() => setShowSent(false)} cashlessCaseId={d.caseId} transactionType="preauth" correlationId={sentCorrelationId} />
    </>
  );
}
