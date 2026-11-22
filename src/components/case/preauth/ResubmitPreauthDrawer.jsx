import { useState } from "react";
import { api } from "../../../api";
import { Drawer } from "../../ui/Overlay";
import { DocumentChecklist, LoadingBlock, NextStep } from "../../ui/Common";
import { formatMoney } from "../../../lib/format.js";
import PayerAsks from "../asks/PayerAsks";
import LinesEditor from "../forms/LinesEditor";
import DiagnosesEditor from "../forms/DiagnosesEditor";
import SendGateModal from "../step/SendGateModal";
import { usePreauthDraft } from "../../../hooks/workflow/usePreauthDraft";
import { useSendGate } from "../../../hooks/util/useSendGate";

export default function ResubmitPreauthDrawer({ open, onClose, ctx, preauthRef, notes = [], onSent }) {
  const [tab, setTab] = useState("lines");
  const d = usePreauthDraft(ctx, {
    submit: (body) => api.resubmitPreauth({ ...body, ...(preauthRef ? { preauth_ref: preauthRef } : {}) }),
    onSent: (res) => {
      onSent?.(res);
      onClose();
    },
  });
  const gate = useSendGate({ caseId: d.caseId, waived: d.warnAsks, label: "Pre-auth resubmission", onSend: d.send.run });
  const rows = d.groups.flatMap((g) => g.rows);
  const blockers = rows.filter((r) => r.blocks);
  const canSend = !!d.draft && !d.send.busy && blockers.length === 0 && !d.notInForce;
  const texts = (notes || []).map((n) => (typeof n === "string" ? n : n?.text)).filter(Boolean);

  const TABS = [
    ["lines", "Lines"],
    ["diagnosis", "Diagnosis"],
    ["documents", "Documents"],
  ];

  return (
    <>
      <Drawer
        open={open}
        onClose={d.send.busy ? undefined : onClose}
        title="Resubmit the pre-auth"
        subtitle="Correct what the payer named, then send it again. Everything else is rebuilt from the hospital records."
        width={760}
        footer={
          <>
            <button type="button" className="cv-btn" onClick={onClose} disabled={d.send.busy}>
              Cancel
            </button>
            <button
              type="button"
              className="cv-btn is-primary"
              disabled={!canSend}
              title={!canSend && blockers.length ? `First: ${blockers.map((r) => r.name.toLowerCase()).join(", ")}.` : undefined}
              onClick={gate.request}
            >
              {d.send.busy ? "Sending…" : `Resubmit ${formatMoney(d.effectiveTotal)}`}
            </button>
          </>
        }
      >
        {texts.length > 0 && (
          <NextStep tone="warn" title="What the payer said">
            {texts.map((t, i) => (
              <div key={i}>{t}</div>
            ))}
          </NextStep>
        )}
        {d.send.error && (
          <div className="cv-notice is-bad cv-drawer-note" role="alert">
            <div className="cv-notice-body">{d.send.error}</div>
          </div>
        )}
        {d.loading ? (
          <LoadingBlock compact text="Loading the draft…" />
        ) : d.error ? (
          <div className="cv-notice is-bad">
            <div className="cv-notice-body">{d.error}</div>
            <div className="cv-notice-actions">
              <button type="button" className="cv-btn" onClick={d.reload}>
                Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            {blockers.length > 0 && (
              <div className="cv-notice is-warn cv-drawer-note">
                <div className="cv-notice-body">Before it can go: {blockers.map((r) => `${r.name.toLowerCase()} (${r.fact.toLowerCase()})`).join(", ")}.</div>
              </div>
            )}
            <div className="cv-tabs cv-drawer-tabs" role="tablist" aria-label="Resubmission">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" role="tab" className="cv-tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>
            {tab === "lines" && (
              <section className="cv-card">
                <div className="cv-card-head">
                  <h3 className="cv-card-title">Treatment and cost</h3>
                  {d.edited.items && (
                    <span className="cv-card-tools">
                      <button type="button" className="cv-link" onClick={d.resetItems}>
                        Reset to hospital record
                      </button>
                    </span>
                  )}
                </div>
                <LinesEditor items={d.displayItems} total={d.effectiveTotal} unspecifiedCodes={d.unspecifiedCodes} onChange={d.updateItem} />
              </section>
            )}
            {tab === "diagnosis" && (
              <section className="cv-card">
                <div className="cv-card-head">
                  <h3 className="cv-card-title">Diagnosis</h3>
                  {d.edited.diagnoses && (
                    <span className="cv-card-tools">
                      <button type="button" className="cv-link" onClick={d.resetDiagnoses}>
                        Reset to hospital record
                      </button>
                    </span>
                  )}
                </div>
                <DiagnosesEditor
                  diagnoses={d.displayDiagnoses}
                  onChange={d.updateDiagnosis}
                  onPick={d.pickDiagnosis}
                  onPrimary={d.setPrimaryDiagnosis}
                  onAdd={d.addDiagnosis}
                  onRemove={d.removeDiagnosis}
                  groupName="resubmit-primary-diagnosis"
                />
              </section>
            )}
            {tab === "documents" && (
              <div className="cv-pane-stack">
                <PayerAsks caseId={d.caseId} stage="preauth" asks={d.draft?.payer_asks} documents={d.docs} onAttach={d.documents.attachAsk} onFormsChange={d.setAskForms} reloadKey={d.asksReload} />
                <section className="cv-card">
                  <div className="cv-card-head">
                    <h3 className="cv-card-title">Other files</h3>
                  </div>
                  <div className="cv-card-body">
                    <DocumentChecklist
                      documents={d.otherDocs}
                      onUpload={(doc, uploaded) => d.documents.attach(d.docs.indexOf(doc), uploaded)}
                      onAddDocument={d.documents.addCustom}
                      onRenameDocument={(i, name) => d.documents.rename(d.docs.indexOf(d.otherDocs[i]), name)}
                      onRemoveDocument={(i) => d.documents.remove(d.docs.indexOf(d.otherDocs[i]))}
                      hideSummary
                    />
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </Drawer>
      <SendGateModal gate={gate} busy={d.send.busy} sendLabel="Resubmit anyway" />
    </>
  );
}
