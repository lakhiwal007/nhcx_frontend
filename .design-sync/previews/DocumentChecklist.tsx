import { DocumentChecklist } from "nhcx_cli";

const mixed = [
  { name: "Discharge Summary", code: "DS-01", category: "clinical", event_date: "2026-06-25", url: "#" },
  { name: "Final Bill", code: "BILL-02", category: "financial" },
  { name: "Investigation Reports", code: "INV-03", category: "clinical", optional: true },
];

const allAttached = [
  { name: "Discharge Summary", code: "DS-01", url: "#" },
  { name: "Final Bill", code: "BILL-02", url: "#" },
];

export const MixedStates = () => (
  <DocumentChecklist documents={mixed} onUpload={() => {}} />
);

export const AllAttached = () => (
  <DocumentChecklist documents={allAttached} onUpload={() => {}} />
);
