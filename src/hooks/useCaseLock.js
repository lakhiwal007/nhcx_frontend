import { useReadOnly } from "../readOnly";
import { lockFor } from "../components/case/caseStages";

export function useCaseLock(ctx, stage) {
  const readOnly = useReadOnly();
  return lockFor(ctx?.cashlessCase, stage, { readOnly, closed: !!ctx?.caseClosed });
}
