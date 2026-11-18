import { useEffect, useState } from "react";
import { api } from "../../api";

export function usePlanPackages(correlationId, { category = "", q = "", procedureType = "", flags = "", limit = 10, offset = 0 } = {}) {
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: null });
  const key = [correlationId, category, q, procedureType, flags, limit, offset].join("|");

  useEffect(() => {
    if (!correlationId) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        api
          .getInsurancePlanBenefits(
            correlationId,
            {
              category: category || undefined,
              q: q || undefined,
              procedure_type: procedureType || undefined,
              flags: flags || undefined,
              limit,
              offset,
            },
            controller.signal,
          )
          .then((res) => setResult({ key, rows: res?.benefits || [], total: res?.total ?? 0, error: null }))
          .catch((err) => err?.name !== "AbortError" && setResult({ key, rows: [], total: 0, error: err?.message || "Could not load the packages." }));
      },
      q ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [correlationId, category, q, procedureType, flags, limit, offset, key]);

  const loading = result.key !== key;
  return { loading, rows: loading ? [] : result.rows, total: result.total, error: loading ? null : result.error };
}
