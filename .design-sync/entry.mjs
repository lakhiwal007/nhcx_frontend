// Hand-authored barrel for claude.ai/design sync. Common.jsx exports the
// app's shared component set alongside page-level components in the same
// src/components/ directory — this barrel picks out only the reusable
// design-system pieces, so the converter's bundle doesn't pull in
// Dashboard/WorkQueue/Settings/etc. Never edited by the converter.
export {
  Card,
  Button,
  StatusBadge,
  Input,
  PageHeader,
  MissingFieldsAlert,
  DocumentChecklist,
  DecisionBanner,
  SkeletonTable,
  AmountGrid,
  TaskCard,
  PatientCard,
} from "../src/components/Common.jsx";
