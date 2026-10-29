import { useEffect, useState } from "react";
import { api } from "../api";

export function usePlanForms(correlationId, formCount) {
  const [forms, setForms] = useState({ key: null, rows: [] });
  useEffect(() => {
    if (!correlationId || !formCount) return;
    let live = true;
    api
      .getInsurancePlanForms(correlationId)
      .then((res) => live && setForms({ key: correlationId, rows: res?.forms || [] }))
      .catch(() => live && setForms({ key: correlationId, rows: [] }));
    return () => {
      live = false;
    };
  }, [correlationId, formCount]);
  return forms.key === correlationId ? forms.rows : [];
}

export function useCoverBenefits(correlationId) {
  const [cover, setCover] = useState({ key: null, rows: [] });
  useEffect(() => {
    if (!correlationId) return;
    let live = true;
    api
      .getInsurancePlanBenefits(correlationId, { kind: "Benefit", limit: 100 })
      .then((res) => live && setCover({ key: correlationId, rows: res?.benefits || [] }))
      .catch(() => live && setCover({ key: correlationId, rows: [] }));
    return () => {
      live = false;
    };
  }, [correlationId]);
  return cover.key === correlationId ? cover.rows : null;
}
