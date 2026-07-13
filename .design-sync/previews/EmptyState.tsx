import { CreditCard, CheckCircle2, Building2, Plus } from "lucide-react";
import { EmptyState, Button } from "nhcx_cli";

export const Default = () => (
  <EmptyState
    icon={CreditCard}
    iconOpacity={0.5}
    title="No Payments Found"
    description="No matching payment records."
  />
);

export const SuccessTone = () => (
  <EmptyState
    icon={CheckCircle2}
    iconOpacity={0.4}
    iconColor="var(--success)"
    title="All Caught Up!"
    description="No pending tasks match your filters."
  />
);

export const WithAction = () => (
  <EmptyState
    icon={Building2}
    iconSize={52}
    iconOpacity={0.25}
    title="No Facilities Registered"
    description="Register your hospital's HCX facility to enable preauth, claims, and eligibility workflows."
  >
    <Button variant="primary" icon={Plus} onClick={() => {}} style={{ marginTop: "var(--space-5)" }}>
      Register First Facility
    </Button>
  </EmptyState>
);
