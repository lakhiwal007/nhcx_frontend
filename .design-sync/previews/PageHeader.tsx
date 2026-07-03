import { PageHeader } from "nhcx_cli";

export const Default = () => <PageHeader title="Payment Reconciliation" />;

export const WithSubtitle = () => (
  <PageHeader
    title="Cashless Cases"
    subtitle="Overview of all active and past claims"
  />
);

export const WithBackAction = () => (
  <PageHeader
    title="Case #501"
    subtitle="Aarav Mehta - Star Health Insurance"
    backAction={() => {}}
  />
);
