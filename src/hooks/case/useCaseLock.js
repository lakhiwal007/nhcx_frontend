import { useReadOnly } from "../../lib/readOnly";
import { lockFor } from "../../components/case/frame/caseStages";

export function useCaseLock(ctx, stage) {
  const readOnly = useReadOnly();
  return lockFor(ctx?.cashlessCase, stage, { readOnly, closed: !!ctx?.caseClosed });
}
