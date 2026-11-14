import { useNavigate } from "react-router-dom";
import { ArrowRight, RefreshCw, Wallet } from "lucide-react";
import { NextStep, Tip } from "../ui/Common";
import { formatDate, formatDateTime, formatMoney, formatTime } from "../../lib/format.js";
import { stageWord } from "../../domain/paymentEvents.js";
import { useCaseLock } from "../../hooks/case/useCaseLock";
import { usePayment } from "../../hooks/workflow/usePayment";
import { useCasePane } from "../case/step/useCasePane";
import CaseStep, { Pane, Verdict } from "../case/step/CaseStep";
import PaymentsTable from "../case/payment/PaymentsTable";
import TechnicalDetails from "../case/step/TechnicalDetails";
import { buildPaymentChecklist, firstPaymentItem } from "../case/payment/paymentChecklist";

const money = (v) => (v == null ? "—" : formatMoney(v));
const checkedAt = (at) => (at ? `Checked ${formatTime(new Date(at))}` : null);

function Card({ title, meta, chip, children }) {
  return (
    <section className="cv-card" aria-label={title}>
      <div className="cv-card-head">
        <h2 className="cv-card-title">{title}</h2>
        {chip}
        {meta && <span className="cv-card-meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

export default function PaymentReconciliation({ ctx }) {
  const navigate = useNavigate();
  const lock = useCaseLock(ctx, "payment");
  const p = usePayment(ctx);
  const pane = useCasePane();

  const canRetry = (pay) => !lock.viewOnly && !!(pay.payment_reference || pay.notice_identifier);
  const failed = p.failedPayments;
  const onlyFailed = failed.length === 1 ? failed[0] : null;
  const latestStage = p.data?.latest_stage;
  const checkAgain = { label: "Check again", icon: RefreshCw, write: false, busy: p.status.checking, busyLabel: "Checking…", onClick: p.status.refresh };
  const waiting = !p.error && (p.isNotFound || !p.allSettled);

  const groups = p.isNotFound || !p.data
    ? []
    : buildPaymentChecklist({
        allSettled: p.allSettled,
        shortBy: p.shortBy,
        net: p.net,
        utr: p.latestUtr,
        missingUtr: p.missingUtr,
        payments: p.payments.length,
        ackFailed: failed.length,
        ackPending: p.ackPending,
      });
  const open = firstPaymentItem(groups, pane.picked);

  const chip = p.error && !p.data
    ? ["Not loaded", "warn"]
    : p.noPayment
      ? ["No payment due", "todo"]
      : p.isNotFound
        ? ["Awaiting payment", "info"]
        : failed.length
          ? ["Acknowledgement failed", "bad"]
          : p.allSettled
            ? p.shortBy
              ? ["Settled short", "warn"]
              : ["Settled", "ok"]
            : p.settledPayments.length
              ? [`${p.settledPayments.length} of ${p.payments.length} settled`, "info"]
              : [`Payment ${(stageWord(latestStage) || "in progress").toLowerCase()}`, "info"];

  const primary = !lock.viewOnly && failed.length > 1
    ? { label: "Open acknowledgements", onClick: () => pane.openItem("acks") }
    : onlyFailed && canRetry(onlyFailed)
      ? { label: "Retry acknowledgement", busy: !!p.acking[onlyFailed.group_key], busyLabel: "Retrying…", onClick: () => p.acknowledge(onlyFailed) }
      : p.shortBy && !lock.viewOnly
        ? { label: "Ask for the balance", icon: Wallet, write: false, onClick: () => navigate("../claim", { state: { openAction: "request_claim_release", releaseAmount: p.shortBy, claim_id: p.claimId, cashless_case_id: p.caseId } }) }
        : p.noPayment
          ? { label: p.noPayment.label, icon: ArrowRight, write: false, onClick: () => navigate(p.noPayment.to) }
          : null;

  const secondary = [!p.noPayment && checkAgain];
  const ago = checkedAt(p.status.lastCheckedAt);

  const notes = [
    p.error && { tone: "warn", text: `The last check failed, and this page keeps trying: ${p.error}` },
    lock.viewOnly && { tone: "info", text: lock.reason },
    failed.length > 0 && { tone: "bad", text: "The payer has not been told this payment arrived. Retry the acknowledgement; until it goes through the payer may chase the hospital." },
    p.shortBy && { tone: "warn", text: `Paid ${formatMoney(p.shortBy)} less than approved. If TDS or a deduction you agree with does not explain it, ask for the balance.` },
    p.missingUtr && !failed.length && { tone: "warn", text: "The payer has not sent a UTR, so this payment cannot be matched to the bank statement yet." },
    p.isNotFound && !p.noPayment && { tone: "info", text: "A payment that arrived without a claim reference waits on the Payments list until it is linked to this case.", action: { label: "See unlinked payments", onClick: () => navigate("/payments?view=unlinked") } },
  ];
  const tipText = p.isNotFound && !p.noPayment
    ? "Payers send payment notices on their own schedule, usually hours to days after approval. This page checks by itself; you can leave it."
    : p.allSettled && !p.shortBy && !failed.length && !p.missingUtr
      ? "Match the UTR with the hospital's bank statement. Nothing else is needed for this case."
      : waiting && p.data && !p.isNotFound
        ? "More notices may follow. Each is acknowledged automatically and this page updates by itself."
        : null;

  const summary = p.isNotFound || !p.data ? (
    ago
  ) : (
    <>
      {p.net != null ? <><strong>{formatMoney(p.net)}</strong> credited</> : "Nothing credited yet"}
      {p.inProgress != null ? ` · ${formatMoney(p.inProgress)} in progress` : ""}
      {p.latestUtr && <span className="cv-mono cv-card-meta cv-bar-ref">{p.latestUtr}</span>}
      {ago && <span className="cv-card-meta cv-bar-ref">{ago}</span>}
    </>
  );

  const verdict = (
    <Verdict ctx={ctx} chip={chip[0]} chipTone={chip[1]} summary={summary} notes={notes} primary={primary} secondary={secondary}>
      {tipText && <Tip className="cv-verdict-note">{tipText}</Tip>}
    </Verdict>
  );

  if (!p.claimId) {
    return (
      <CaseStep ctx={ctx} verdict={<Verdict ctx={ctx} chip="No claim" chipTone="todo" />} checklist={[]} open="none" onOpen={() => {}}>
        <Pane id="none">
          <NextStep
            tone="info"
            title="No claim on this case yet"
            actions={
              <button type="button" className="cv-btn" onClick={() => navigate("../claim")}>
                Back to claim
              </button>
            }
          >
            Payment follows an approved final claim.
          </NextStep>
        </Pane>
      </CaseStep>
    );
  }

  if (p.error && !p.data) {
    return <CaseStep ctx={ctx} verdict={verdict} checklist={[]} open="none" onOpen={() => {}} error={`The payment status could not be read: ${p.error}`} onRetry={p.status.refresh} />;
  }

  if (p.noPayment || p.isNotFound || !p.data) {
    return (
      <CaseStep ctx={ctx} verdict={verdict} checklist={[]} open="state" onOpen={() => {}} loading={p.loading} loadingText="Reading the payment notices…">
        <Pane id="state">
          {p.noPayment ? (
            <NextStep tone="info" title={p.noPayment.title}>
              {p.noPayment.text}
            </NextStep>
          ) : (
            <Card title="No payment notice yet" meta="The payer's first notice usually says the payment is initiated; the settled notice carries the UTR.">
              <div className="cv-card-body">
                <div className="cv-kv"><span>Approved by payer</span><span className="money">{money(p.approved)}</span></div>
                {p.toCollect > 0 && <div className="cv-kv"><span>Patient payable</span><span className="money">{formatMoney(p.toCollect)}</span></div>}
                <div className="cv-kv"><span>Last checked</span><span>{p.status.lastCheckedAt ? formatDateTime(new Date(p.status.lastCheckedAt)) : "checking now"}</span></div>
                <TechnicalDetails ids={[{ label: "Claim id", value: p.claimId }]} />
              </div>
            </Card>
          )}
        </Pane>
      </CaseStep>
    );
  }

  const statement = [
    ["Approved by payer", p.approved],
    ["Gross paid", p.gross],
    ["TDS deducted", p.tds > 0 ? -p.tds : null],
    ["Net credited", p.net],
    ["In progress", p.inProgress],
    ["Short of approved amount", p.shortBy],
    [p.ledger.patient_payable?.formula ? `Patient payable (${p.ledger.patient_payable.formula})` : "Patient payable", p.toCollect > 0 ? p.toCollect : null],
  ].filter(([, value]) => value != null);

  return (
    <CaseStep ctx={ctx} verdict={verdict} checklist={groups} open={open} onOpen={pane.openItem} checklistLabel="Payment checklist" paneRef={pane.paneRef}>
      <Pane id="amounts">
        <Card title="Amounts" meta="TDS is tax the payer deducts and deposits for the hospital.">
          <div className="cv-card-body">
            {statement.map(([label, value]) => (
              <div key={label} className={`cv-kv${label === "Net credited" ? " is-total" : ""}`}>
                <span>{label}</span>
                <span className="money">{value < 0 ? `− ${formatMoney(-value)}` : formatMoney(value)}</span>
              </div>
            ))}
          </div>
        </Card>
      </Pane>

      <Pane id="utr">
        <Card title="UTR against the bank statement" meta="The UTR is the bank's transfer reference. Match it with the hospital's statement.">
          <div className="cv-tw cv-in-card">
            <table>
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>UTR</th>
                  <th>Transfer type</th>
                  <th>Paid on</th>
                  <th className="is-num">Net</th>
                </tr>
              </thead>
              <tbody>
                {p.payments.map((pay) => (
                  <tr key={pay.group_key}>
                    <td className="cv-mono">{pay.payment_reference || "—"}</td>
                    <td className="cv-mono">{pay.utr || (pay.settled ? "Not sent by the payer" : "Not yet")}</td>
                    <td>{pay.utr_type || "—"}</td>
                    <td>{pay.payment_date ? formatDate(pay.payment_date) : "—"}</td>
                    <td className="is-num">{money(pay.net_payment_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Pane>

      <Pane id="payments">
        <Card title="Payments" meta="One row per payment; open a row for its notices, breakdown and references.">
          <PaymentsTable payments={p.payments} ackOf={p.ackOf} acking={p.acking} results={p.results} onRetry={p.acknowledge} canRetry={canRetry} />
        </Card>
      </Pane>

      <Pane id="acks">
        <Card title="Acknowledgements" meta="Each notice is acknowledged to the payer automatically. Retry only when one fails.">
          <PaymentsTable payments={p.payments} ackOf={p.ackOf} acking={p.acking} results={p.results} onRetry={p.acknowledge} canRetry={canRetry} expandFailed />
        </Card>
      </Pane>
    </CaseStep>
  );
}
