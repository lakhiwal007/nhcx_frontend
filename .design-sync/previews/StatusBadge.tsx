import { StatusBadge } from "nhcx_cli";

export const Complete = () => <StatusBadge status="complete" />;
export const Pending = () => <StatusBadge status="pending" />;
export const Failed = () => <StatusBadge status="failed" />;
export const Partial = () => <StatusBadge status="partially_approved" />;

export const AllStates = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <StatusBadge status="complete" />
    <StatusBadge status="pending" />
    <StatusBadge status="draft" />
    <StatusBadge status="failed" />
    <StatusBadge status="rejected" />
    <StatusBadge status="partial" />
    <StatusBadge status={null} />
  </div>
);
