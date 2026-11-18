import BackButton from "../ui/BackButton";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { DocumentChecklist, NextStep } from "../ui/Common";
import { formatDate, formatMoney } from "../../lib/format.js";
import PatientDetailsForm from "../case/forms/PatientDetailsForm";
import SendGateModal from "../case/step/SendGateModal";
import CaseStep, { Pane, Verdict } from "../case/step/CaseStep";
import { useCasePane } from "../case/step/useCasePane";
import { useCaseLock } from "../../hooks/case/useCaseLock";
import { useEnhancement } from "../../hooks/workflow/useEnhancement";
import PackageLines from "../eligibility/PackageLines";
import PackagePicker from "../eligibility/PackagePicker";
import { useSendGate } from "../../hooks/util/useSendGate";
import { fieldList } from "../case/forms/fieldLabels";
import { buildEnhancementChecklist, firstEnhancementItem } from "../case/preauth/enhancementChecklist";

export default function PreauthEnhancement({ ctx }) {
  const navigate = useNavigate();
  const { caseState } = ctx;
  const { cashless_case_id, claim_id } = caseState;
  const lock = useCaseLock(ctx, "enhancement");
  const locked = lock.viewOnly || lock.settled;
  const back = () => navigate("../status");
  const e = useEnhancement(ctx, { onSent: back });
  const gate = useSendGate({ caseId: cashless_case_id, waived: e.waivedDocs, label: "Enhancement", onSend: e.send.run });
  const pane = useCasePane();

  const preview = e.preview;
  const notEnhanceable = preview && (preview.status === "not_found" || !preview.enhanceable);
  const blockedReason = e.unavailable || (notEnhanceable ? preview.reason || "Nothing new to ask for" : null);

  const authorizedItems = preview?.authorized?.items || [];
  const authorizedTotal = preview?.authorized?.total_amount;
  const approvedSoFar = preview?.authorized?.approved_amount;

  const groups = buildEnhancementChecklist({
    patientMissing: e.patientMissing.length,
    hisMissing: e.hisBlockers.length,
    procedures: e.newProcedures.length,
    proceduresKept: e.newProcedures.filter(e.procedureKept).length,
    lines: e.newItems.length,
    linesKept: e.newItems.filter((it) => !e.excludedItem(it)).length,
    delta: e.revisedDelta,
    authorised: authorizedItems.length,
    missingDocs: e.missingDocs.length,
    waivedDocs: e.waivedDocs.length,
    attachedDocs: e.docs.filter((d) => d.url || d.attachment).length,
    locked,
  });
  const blockers = groups.flatMap((g) => g.rows).filter((r) => r.blocks);
  const canSubmit = !locked && !blockedReason && !e.send.busy && e.missingFields.length === 0 && e.missingDocs.length === 0 && (e.revisedDelta ?? 0) > 0;
  const open = pane.picked || firstEnhancementItem(groups);

  const chip = e.error
    ? ["Not loaded", "warn"]
    : blockedReason
      ? ["Not available", "todo"]
      : locked
        ? ["Not sent", "todo"]
        : blockers.length > 0
          ? [`${blockers.length} must be done`, "warn"]
          : ["Ready to send", "ok"];

  const primary = blockedReason || e.error
    ? null
    : {
        label: "Send enhancement",
        icon: Send,
        busy: e.send.busy,
        busyLabel: "Sending…",
        disabled: !canSubmit,
        reason: blockers.length ? `First: ${blockers.map((r) => r.name.toLowerCase()).join(", ")}.` : lock.reason || "Nothing new to send.",
        onClick: gate.request,
      };
  const secondary = [{ label: "Back to approval", icon: ArrowLeft, write: false, onClick: back }];

  const notes = [
    e.send.error && { tone: "bad", text: `Not sent: ${e.send.error} Fix what the message names and send again.` },
    gate.error && { tone: "bad", text: gate.error },
    lock.viewOnly && { tone: "info", text: lock.reason },
    e.hisBlockers.length > 0 && { tone: "warn", text: `The hospital records are missing ${fieldList(e.hisBlockers)}. Complete them in the hospital system, then open this again.` },
    e.scopeChanged && !locked && { tone: "info", text: "The amount is recomputed from what is kept.", action: { label: "Reset to the hospital record", onClick: e.resetScope } },
    ...(preview?.warnings || []).map((text) => ({ tone: "warn", text })),
  ];

  const summary =
    preview && !blockedReason ? (
      <>
        <strong>{formatMoney(e.revisedTotal)}</strong> revised
        {e.revisedDelta != null ? ` · ${e.revisedDelta >= 0 ? "+" : "−"} ${formatMoney(Math.abs(e.revisedDelta))}` : ""}
        {preview.preauth_ref ? <span className="cv-mono cv-card-meta cv-bar-ref"> {preview.preauth_ref}</span> : null}
      </>
    ) : blockedReason ? (
      "An enhancement cannot be sent right now."
    ) : null;

  const verdict = <Verdict ctx={ctx} chip={chip[0]} chipTone={chip[1]} summary={summary} notes={notes} primary={primary} secondary={secondary} />;

  if (blockedReason && !e.loading) {
    return (
      <CaseStep ctx={ctx} verdict={verdict} checklist={[]} open="blocked" onOpen={() => {}}>
        <Pane id="blocked">
          <NextStep
            tone={e.unavailable ? "warn" : "info"}
            title={e.unavailable ? "Enhancement not available" : preview?.status === "not_found" ? "No pre-auth to enhance yet" : preview?.reason || "Nothing new to ask for"}
            actions={
              preview?.status === "not_found" ? (
                <button type="button" className="cv-btn is-primary" onClick={() => navigate("../review")}>
                  Open the pre-auth draft
                </button>
              ) : (
                <BackButton onClick={back}>Back to approval</BackButton>
              )
            }
          >
            {e.unavailable ||
              (preview?.status === "not_found"
                ? "Send a pre-auth first; an enhancement adds to one the payer has approved."
                : "An enhancement needs something new to justify it: a new procedure, or bills above the approved amount. Ask the doctor to record the new procedure or the billing desk to add the charges in the hospital system, then open this again.")}
          </NextStep>
        </Pane>
      </CaseStep>
    );
  }

  return (
    <>
      <CaseStep
        ctx={ctx}
        verdict={verdict}
        checklist={groups}
        open={open}
        onOpen={pane.openItem}
        checklistLabel="Enhancement checklist"
        loading={e.loading}
        loadingText="Working out what is new since the pre-auth…"
        error={e.error}
        onRetry={e.reload}
        paneRef={pane.paneRef}
      >
        {e.patientMissing.length > 0 && (
          <Pane id="details">
            <PatientDetailsForm
              key={e.patientMissing.join("|")}
              claimId={claim_id}
              cashlessCaseId={cashless_case_id}
              missingFields={e.patientMissing}
              locked={locked}
              onResolved={(remaining) => {
                e.setMissingFields(remaining);
                if (remaining.length === 0) e.reload();
              }}
            />
          </Pane>
        )}

        <Pane id="procedures">
          <section className="cv-card" aria-label="New procedures">
            <div className="cv-card-head">
              <h2 className="cv-card-title">New procedures</h2>
              <span className="cv-card-meta">{e.treatment ? "Packages from the payer's plan, at its rates." : "Untick a procedure to leave it and its lines out."}</span>
            </div>
            {e.treatment ? (
              <>
                <div className="cv-card-intro">
                  Approved packages stay as they are. Add the new package from the payer's plan; it goes for approval at the plan's rate.
                  {e.setPackages.error && ` ${e.setPackages.error}`}
                </div>
                <PackageLines lines={e.treatment} onRemove={locked ? undefined : e.removePackage} busy={e.setPackages.busy} />
              </>
            ) : e.newProcedures.length === 0 ? (
              <div className="cv-card-intro">No new procedure is recorded since the pre-auth.</div>
            ) : (
              <ul className="en-procs">
                {e.newProcedures.map((proc, i) => (
                  <li key={proc.code ?? i}>
                    <label>
                      <input type="checkbox" checked={e.procedureKept(proc, i)} disabled={locked} onChange={(ev) => e.toggleProcedure(proc, i, ev.target.checked)} />
                      <span>
                        <span className="cv-strong-block">{proc.name}</span>
                        <span className="cv-card-meta">{[proc.code, proc.date && formatDate(proc.date)].filter(Boolean).join(" · ")}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {e.treatment && !locked && (
            <div className="cv-pane-action">
              <PackagePicker
                correlationId={e.planCorrelationId}
                plan={ctx.caseRecord?.insurance_plan}
                chosenCodes={new Set(e.treatment.filter((line) => line.status !== "rejected").map((line) => String(line.code)))}
                onChoose={e.addPackage}
                onBrowse={() => navigate("../prep")}
              />
            </div>
          )}
        </Pane>

        <Pane id="lines">
          <section className="cv-card" aria-label="New line items">
            <div className="cv-card-head">
              <h2 className="cv-card-title">New line items</h2>
              <span className="cv-card-meta">Untick a line to leave it out, or correct its quantity and price.</span>
            </div>
            {e.hisBlockers.length > 0 ? (
              <div className="cv-card-intro">The hospital records are missing {fieldList(e.hisBlockers)}, so the new lines cannot be built yet.</div>
            ) : e.newItems.length === 0 ? (
              <div className="cv-card-intro">No new billing since the pre-auth.</div>
            ) : (
              <div className="cv-tw cv-in-card">
                <table>
                  <thead>
                    <tr>
                      <th className="cv-col-check" aria-label="Include" />
                      <th>Service</th>
                      <th className="cv-col-qty">Qty</th>
                      <th className="cv-col-price">Unit price</th>
                      <th className="is-num cv-col-price">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.newItems.map((item) => {
                      const key = e.itemKey(item);
                      const line = e.lineOf(item);
                      const excluded = e.excludedItem(item);
                      return (
                        <tr key={key} className={excluded ? "en-excluded" : undefined}>
                          <td>
                            <input type="checkbox" aria-label={`Include ${item.service_name}`} checked={!e.leftOutLines[key]} disabled={locked || !!e.treatment} onChange={(ev) => e.toggleLine(item, ev.target.checked)} />
                          </td>
                          <td>
                            <strong>{item.service_name}</strong>
                            <div className="cv-card-meta">{[item.service_code, item.category, excluded && "left out"].filter(Boolean).join(" · ")}</div>
                          </td>
                          <td>
                            <input className="cv-ctl cv-ctl-fill cv-mono" type="number" min="1" aria-label="Quantity" value={line.quantity ?? ""} disabled={locked || excluded || !!e.treatment} onChange={(ev) => e.editLine(item, "quantity", ev.target.value)} />
                          </td>
                          <td>
                            <input className="cv-ctl cv-ctl-fill cv-mono" type="number" min="0" aria-label="Unit price" value={line.unit_price ?? ""} disabled={locked || excluded || !!e.treatment} onChange={(ev) => e.editLine(item, "unit_price", ev.target.value)} />
                          </td>
                          <td className="is-num cv-strong">{formatMoney(line.net_amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </Pane>

        <Pane id="revised">
          <section className="cv-card" aria-label="Revised amount">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Revised amount</h2>
              <span className="cv-card-meta">What you are asking for on top of the earlier request.</span>
            </div>
            <div className="cv-card-body">
              <div className="cv-kv"><span>Previously requested</span><span>{formatMoney(authorizedTotal)}</span></div>
              {approvedSoFar != null && <div className="cv-kv"><span>Approved so far</span><span>{formatMoney(approvedSoFar)}</span></div>}
              {e.revisedDelta != null && (
                <div className="cv-kv">
                  <span>New scope</span>
                  <span>
                    {e.revisedDelta >= 0 ? "+ " : "− "}
                    {formatMoney(Math.abs(e.revisedDelta))}
                  </span>
                </div>
              )}
              <div className="cv-kv is-total"><span>Revised request</span><span>{formatMoney(e.revisedTotal)}</span></div>
            </div>
          </section>
        </Pane>

        <Pane id="authorised">
          <section className="cv-card" aria-label="Already authorised">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Already authorised</h2>
            </div>
            <div className="cv-tw cv-in-card">
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th className="is-num">Qty</th>
                    <th className="is-num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {authorizedItems.map((item) => (
                    <tr key={e.itemKey(item)}>
                      <td>
                        <strong>{item.service_name}</strong>
                        <div className="cv-card-meta">{item.service_code}</div>
                      </td>
                      <td className="is-num">{item.quantity}</td>
                      <td className="is-num">{formatMoney(item.net_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </Pane>

        <Pane id="documents">
          <section className="cv-card" aria-label="Documents">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Documents sent with it</h2>
              <span className="cv-card-meta">A revised estimate helps the payer. Attached files stay until sent, but reloading the page drops them.</span>
            </div>
            <div className="cv-card-body">
              <DocumentChecklist
                documents={e.docs}
                onUpload={(doc, uploaded) => e.documents.attach(e.docs.indexOf(doc), uploaded)}
                onAddDocument={e.documents.addCustom}
                onRenameDocument={(i, name) => e.documents.rename(i, name)}
                onRemoveDocument={(i) => e.documents.remove(i)}
                readOnly={locked}
                hideSummary
              />
            </div>
          </section>
        </Pane>
      </CaseStep>

      <SendGateModal gate={gate} busy={e.send.busy} title="Send without a revised estimate?" subtitle="The payer may ask for it before deciding." sendLabel="Send anyway" />
    </>
  );
}
