import { DecisionBanner } from "nhcx_cli";

export const Approved = () => (
  <DecisionBanner decision="APPROVED" approvedAmount={48250} message="Settled to the hospital account on 25 Jun 2026." />
);

export const PartiallyApproved = () => (
  <DecisionBanner decision="PARTIALLY_APPROVED" approvedAmount={15000} message="₹5,000 disallowed under room-rent capping." />
);

export const Queried = () => (
  <DecisionBanner decision="QUERIED" message="Payer requests the discharge summary before proceeding." />
);

export const Rejected = () => (
  <DecisionBanner decision="REJECTED" message="Procedure is excluded under this policy's terms." />
);

export const Unknown = () => (
  <DecisionBanner decision={null} outcome="error" />
);
