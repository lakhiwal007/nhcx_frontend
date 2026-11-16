import { formatCaseRef } from "../../lib/format.js";

export const OVERDUE_HOURS = 24;
export const WARN_HOURS = 2;

export const taskKey = (task) => String(task.id ?? task.task_id);

export const priorityBucket = (task) => (task.priority === "urgent" || task.priority === "high" ? task.priority : "normal");

export const needsOwnAction = (task) => /^(respond_|submit_|resubmit_|acknowledge_payment$|link_payment_to_claim$)/.test(task.task_type || "");

export const taskRef = (task) =>
  task.cashless_case_id ? formatCaseRef(task.cashless_case_id) : task.claim_id ? `Claim ${task.claim_id}` : null;

export const taskSubject = (task) => {
  const ref = taskRef(task);
  if (task.patient_name && ref) return `${task.patient_name} · ${ref}`;
  return task.patient_name || ref || null;
};

export const ageLabel = (createdAt) => {
  if (!createdAt) return null;
  const hours = (Date.now() - Date.parse(createdAt)) / 3_600_000;
  if (hours >= OVERDUE_HOURS) return { text: `Overdue by ${Math.floor(hours / 24)}d`, tone: "overdue" };
  if (hours >= WARN_HOURS) return { text: `Waiting ${Math.floor(hours)}h`, tone: "waiting" };
  return null;
};

export const describeDocRequirement = (d) => {
  if (d.name) return { label: d.name, code: d.code };
  if (d.display) return { label: d.display, code: d.code };
  const values = d.values || [];
  const category = values.find((v) => v.url === "category");
  const code = values.find((v) => v.url === "code");
  if (category || code) {
    return { label: [category?.display, code?.display].filter(Boolean).join(" — "), code: category?.code };
  }
  return { label: "Document requirement" };
};
