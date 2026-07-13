import { MissingFieldsAlert } from "nhcx_cli";

export const Default = () => (
  <MissingFieldsAlert
    fields={["Admission Date", "ABHA Number", "Primary Doctor"]}
    onResolve={() => {}}
  />
);

export const WithoutAction = () => (
  <MissingFieldsAlert fields={["Discharge Date"]} />
);
