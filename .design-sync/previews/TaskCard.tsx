import { TaskCard } from "nhcx_cli";

export const Urgent = () => (
  <TaskCard
    task={{
      priority: "urgent",
      task_type: "respond_claim_query",
      description: "Payer needs the discharge summary within 24 hours.",
      claim_id: 900,
      created_at: "2026-06-28T09:00:00Z",
    }}
    onClick={() => {}}
  />
);

export const High = () => (
  <TaskCard
    task={{
      priority: "high",
      task_type: "submit_discharge_claim",
      description: "Discharge claim is ready to submit.",
      claim_id: 900,
      created_at: "2026-06-27T14:30:00Z",
    }}
    onClick={() => {}}
  />
);

export const Normal = () => (
  <TaskCard
    task={{
      priority: "normal",
      task_type: "review_communication",
      claim_id: 900,
      created_at: "2026-06-26T11:15:00Z",
    }}
    onClick={() => {}}
  />
);
