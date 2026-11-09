import { AlertCircle, FileText } from "lucide-react";
import { api } from "../../api";
import { taskHelp, taskLabel, taskScreen } from "../../tasks";
import { Button, NextStep } from "../Common";
import { Drawer } from "../Overlay";
import ConfirmModal from "../ConfirmModal";
import PayerName from "../PayerName";
import TechnicalDetails from "../case/TechnicalDetails";
import { useSend } from "../../hooks/useSend";
import { formatCaseRef, formatDateTime, humanize, priorityLabel } from "../../format.js";
import { describeDocRequirement, needsOwnAction, taskSubject } from "./taskUtil";

const openLabel = (task) => {
  const screen = taskScreen(task.task_type, task.child_id, task.workflow) || "";
  if (screen.startsWith("/communications")) return "Open the message";
  if (screen.startsWith("/payments")) return "Open payments";
  return "Open the case";
};

function Detail({ label, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="wq-detail">
      <span className="wq-detail-label">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export default function TaskDrawer({ task, open, onClose, onDone, allFacilitiesMode, onNavigate, retryAck }) {
  const taskId = task?.id ?? task?.task_id;
  const type = task?.task_type;
  const isCallbackFailure = type === "review_callback_failure";
  const isSupersededCancel = type === "cancel_superseded_preauth";
  const isAckFailure = type === "review_payment_ack_failure";
  const paymentRef = task?.action?.payload_hint?.payment_reference;

  const retry = useSend(
    async () => {
      const res = await api.reprocessCallback(task.correlation_id);
      if (res?.status !== "reprocessed" && res?.status !== "already_complete") {
        throw new Error(res?.message || "The payer response still could not be read.");
      }
    },
    { success: "The payer's answer was read", onDone },
  );

  const withdraw = useSend(
    async () => {
      const res = await api.cancelPreauth({
        cashless_case_id: task.cashless_case_id,
        reason: "payer-changed",
        description: "Case moved to a different payer.",
      });
      if (!(res?.correlation_id || res?.status === "submitted")) throw new Error(res?.message || "Could not withdraw the pre-auth.");
      await api.completeTask(taskId, { note: "Withdrawn with the previous payer" });
    },
    { success: "Pre-auth withdrawn with the previous payer", onDone },
  );

  const complete = useSend(() => api.completeTask(taskId, { note: "Actioned from Work Queue" }), {
    confirm: true,
    success: "Task marked done",
    onDone,
  });

  const busy = retry.busy || withdraw.busy || complete.busy || !!retryAck?.busy;
  const error = retry.error || withdraw.error || complete.error || retryAck?.error;
  const help = taskHelp(type);
  const label = taskLabel(type);
  const canClose = task && !needsOwnAction(task);

  const openCase = () => {
    onClose();
    onNavigate(task);
  };

  const primary = isCallbackFailure ? (
    <Button
      write
      variant="primary"
      disabled={busy || allFacilitiesMode || task.metadata?.retryable === false}
      disabledReason={
        task.metadata?.retryable === false
          ? "This failure predates payload capture, so it cannot be replayed. Confirm the outcome with the payer."
          : undefined
      }
      onClick={retry.run}
    >
      {retry.busy ? "Retrying…" : "Retry the payer's answer"}
    </Button>
  ) : isSupersededCancel ? (
    <Button write variant="primary" disabled={busy || allFacilitiesMode} onClick={withdraw.run}>
      {withdraw.busy ? "Withdrawing…" : "Withdraw with the previous payer"}
    </Button>
  ) : (
    <Button variant="primary" disabled={allFacilitiesMode} disabledReason={allFacilitiesMode ? "This account can view only" : undefined} onClick={openCase}>
      {openLabel(task || {})}
    </Button>
  );

  return (
    <>
      <Drawer
        open={open && !!task}
        onClose={onClose}
        width={560}
        title={label}
        subtitle={
          task &&
          [task.priority && `${priorityLabel(task.priority)} priority`, taskSubject(task), task.facility_name].filter(Boolean).join(" · ")
        }
        stack
        footer={
          task && (
            <>
              {(isCallbackFailure || isSupersededCancel) && (
                <Button variant="outline" disabled={allFacilitiesMode} onClick={openCase}>
                  {openLabel(task)}
                </Button>
              )}
              {canClose && (
                <Button write variant="outline" disabled={busy || allFacilitiesMode} onClick={complete.request}>
                  Mark done
                </Button>
              )}
              {primary}
            </>
          )
        }
      >
        {task && (
          <>
            {help && (
              <NextStep tone="info" title="What to do">
                {help}
              </NextStep>
            )}
            {task.title && task.title !== label && <p className="wq-drawer-title">{task.title}</p>}
            {task.description && <p className="wq-drawer-text">{task.description}</p>}

            {error && (
              <div className="inline-error-banner" role="alert">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {isAckFailure && paymentRef && (
              <NextStep
                tone="bad"
                title="Our confirmation didn't reach the payer"
                actions={
                  <Button write variant="outline" size="small" disabled={busy || allFacilitiesMode} onClick={() => retryAck.run(task)}>
                    {retryAck.busy ? "Sending…" : "Send it again"}
                  </Button>
                }
              >
                Payment {paymentRef}. Sending the confirmation again usually fixes it.
              </NextStep>
            )}

            {task.metadata?.payer_notes && (
              <NextStep tone="info" title="Payer's note">
                {task.metadata.payer_notes}
              </NextStep>
            )}

            {task.required_documents?.length > 0 && (
              <div className="wq-docs">
                <div className="wq-docs-title">Documents the payer asks for ({task.required_documents.length})</div>
                {task.required_documents.map((doc, i) => {
                  const { label: name, code } = describeDocRequirement(doc);
                  return (
                    <div key={i} className="wq-doc">
                      <FileText size={14} aria-hidden="true" />
                      <span className="wq-doc-name">{name}</span>
                      {code && <span className="wq-doc-code">{code}</span>}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="wq-details">
              <div className="wq-details-title">Details</div>
              <div className="wq-details-grid">
                <Detail label="Patient">{task.patient_name || (task.child_id ? `#${task.child_id}` : null)}</Detail>
                <Detail label="Payer">{task.payer_id || task.payer_name ? <PayerName id={task.payer_id} name={task.payer_name} /> : null}</Detail>
                <Detail label="Case">{task.cashless_case_id ? formatCaseRef(task.cashless_case_id) : null}</Detail>
                <Detail label="Claim">{task.claim_id}</Detail>
                <Detail label="Stage">{task.case_stage ? humanize(task.case_stage) : null}</Detail>
                <Detail label="Raised">{formatDateTime(task.created_at)}</Detail>
              </div>
            </div>

            <TechnicalDetails
              ids={[
                { label: "Task id", value: taskId },
                { label: "Correlation id", value: task.correlation_id },
                { label: "Workflow id", value: task.metadata?.workflow_id },
                { label: "Sender", value: task.metadata?.sender_code },
                { label: "Error", value: task.metadata?.error_class },
              ]}
              raw={task.metadata?.error_message}
            />
          </>
        )}
      </Drawer>

      <ConfirmModal
        open={complete.confirming}
        title="Mark this task done?"
        subtitle="It leaves the queue. Nothing is sent to the payer."
        confirmLabel="Mark done"
        busy={complete.busy}
        onCancel={complete.cancel}
        onConfirm={complete.proceed}
      />
    </>
  );
}
