import { useEffect, useMemo, useState } from "react";
import { api, markHandled } from "../../api";
import { useSend } from "../util/useSend";
import { useCaseDocuments } from "../case/useCaseDocuments";
import { CLAIM_WITH_PAYER } from "../../components/case/frame/caseStages";

const HIS_BLOCKERS = new Set(["diagnoses", "items", "preauth_ref"]);
export const REVISED_ESTIMATE = { category: "revised_estimate", name: "Revised estimate", code: "REVISED_ESTIMATE", optional: true };

const itemKey = (item) => item.service_code ?? item.service_name;

export function unavailableReason(legs) {
  if (CLAIM_WITH_PAYER.includes(legs?.claim)) return "The claim has gone to the payer, so the pre-auth can no longer be enhanced.";
  if (legs?.preauth === "queried") return "The payer has an open query on this pre-auth. Answer it on Approval first.";
  if (legs?.preauth === "submitting" || legs?.preauth === "cancelling") return "The payer is still working on this pre-auth. Wait for its answer on Approval.";
  if (legs?.preauth === "cancelled") return "This pre-auth was cancelled, so it cannot be enhanced.";
  return null;
}

export function useEnhancement(ctx, { onSent } = {}) {
  const { caseState, updateCaseState, cashlessCase, setDraftFiles } = ctx;
  const { cashless_case_id, claim_id } = caseState;
  const anchor = cashless_case_id || claim_id || null;
  const filesKey = anchor ? `${anchor}:enhancement` : null;

  const [state, setState] = useState({ key: null, preview: null, missingFields: [], error: null, attempt: 0 });
  const loadKey = `${anchor || ""}|${state.attempt}`;
  const loading = !!anchor && state.key !== loadKey;

  useEffect(() => {
    if (!anchor) return undefined;
    let cancelled = false;
    api
      .preparePreauthEnhancement(cashless_case_id ? { cashless_case_id } : { claim_id })
      .then((res) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, key: loadKey, preview: res, missingFields: res.missing_fields ?? [], error: null }));
      })
      .catch((err) => {
        if (cancelled) return;
        markHandled(err);
        setState((prev) => ({ ...prev, key: loadKey, preview: null, missingFields: [], error: err?.message || "The enhancement could not be loaded." }));
      });
    return () => {
      cancelled = true;
    };
  }, [anchor, cashless_case_id, claim_id, loadKey]);

  const reload = () => setState((prev) => ({ ...prev, attempt: prev.attempt + 1 }));
  const preview = state.key === loadKey ? state.preview : null;
  const missingFields = state.key === loadKey ? state.missingFields : [];
  const setMissingFields = (next) => setState((prev) => ({ ...prev, missingFields: next }));

  const seed = useMemo(() => {
    if (!preview) return null;
    const docs = [...(preview.supporting_documents || [])];
    if (!docs.some((d) => d.code === REVISED_ESTIMATE.code)) docs.push(REVISED_ESTIMATE);
    return docs;
  }, [preview]);
  const documents = useCaseDocuments(ctx, { key: filesKey, seed });

  const [leftOutLines, setLeftOutLines] = useState({});
  const [lineEdits, setLineEdits] = useState({});
  const [uncheckedProcedures, setUncheckedProcedures] = useState({});

  const newProcedures = preview?.new_procedures || [];
  const newItems = preview?.new_items || [];
  const procedureKept = (proc, i) => !uncheckedProcedures[i] && !leftOutLines[proc.code ?? proc.name];
  const uncheckedProcKeys = new Set(newProcedures.map((p, i) => (procedureKept(p, i) ? null : (p.code ?? p.name))).filter((k) => k != null));
  const lineOf = (item) => {
    const edit = lineEdits[itemKey(item)];
    if (!edit) return item;
    const next = { ...item, ...edit };
    return { ...next, net_amount: (Number(next.quantity) || 0) * (Number(next.unit_price) || 0) };
  };
  const excludedItem = (it) => uncheckedProcKeys.has(it.service_code) || uncheckedProcKeys.has(it.service_name) || !!leftOutLines[itemKey(it)];
  const submittedItems = (preview?.suggested_request?.items || []).filter((it) => !excludedItem(it)).map(lineOf);
  const scopeChanged = uncheckedProcKeys.size > 0 || Object.values(leftOutLines).some(Boolean) || Object.keys(lineEdits).length > 0;
  const revisedTotal = scopeChanged ? submittedItems.reduce((s, it) => s + (Number(it.net_amount) || 0), 0) : preview?.current?.total_amount;
  const revisedDelta = revisedTotal != null && preview?.authorized?.total_amount != null ? revisedTotal - preview.authorized.total_amount : preview?.delta_amount;
  const hisBlockers = missingFields.filter((f) => HIS_BLOCKERS.has(f.toLowerCase()));
  const patientMissing = missingFields.filter((f) => !HIS_BLOCKERS.has(f.toLowerCase()));
  const docs = documents.documents;
  const missingDocs = docs.filter((d) => !d.optional && !d.url && !d.attachment);
  const waivedDocs = docs.filter((d) => d.optional && d.code === REVISED_ESTIMATE.code && !d.url && !d.attachment);
  const unavailable = unavailableReason(cashlessCase?.legs);

  const toggleProcedure = (proc, i, checked) => {
    setUncheckedProcedures((p) => ({ ...p, [i]: !checked }));
    setLeftOutLines((p) => ({ ...p, [proc.code ?? proc.name]: false }));
  };
  const toggleLine = (item, included) => setLeftOutLines((p) => ({ ...p, [itemKey(item)]: !included }));
  const editLine = (item, field, value) => setLineEdits((p) => ({ ...p, [itemKey(item)]: { ...p[itemKey(item)], [field]: Number(value) } }));
  const resetScope = () => {
    setLeftOutLines({});
    setLineEdits({});
    setUncheckedProcedures({});
  };

  const treatment = preview?.treatment?.length ? preview.treatment : null;
  const liveLines = (treatment || []).filter((line) => line.status !== "rejected");
  const lineRow = (line) => ({
    code: line.code,
    name: line.display,
    ...(line.category_code ? { category: line.category_code } : {}),
    ...(line.modifier_code ? { modifier_code: line.modifier_code } : {}),
    ...(Number(line.quantity) > 1 ? { quantity: line.quantity } : {}),
    ...((line.unspecified || line.kind === "Implant") && line.unit_price != null ? { amount: line.unit_price } : {}),
  });
  const setPackages = useSend(
    async (rows) => {
      const res = await api.sendEligibility({ cashless_case_id, procedures: rows });
      reload();
      return res;
    },
    { success: "Packages updated and checked with the payer again" },
  );
  const addPackage = (benefit) => setPackages.run([...liveLines.map(lineRow), { code: benefit.code, name: benefit.display || benefit.code, ...(benefit.category_code ? { category: benefit.category_code } : {}) }]);
  const removePackage = (line) => setPackages.run(liveLines.filter((held) => held.line_no !== line.line_no).map(lineRow));

  const send = useSend(
    async () => {
      const selectedProcs = newProcedures.filter(procedureKept);
      const res = await api.submitPreauthEnhancement({
        ...(cashless_case_id ? { cashless_case_id } : { claim_id }),
        total_amount: revisedTotal,
        items: submittedItems,
        ...(selectedProcs.length > 0 && { procedures: selectedProcs }),
        supporting_documents: docs.filter((d) => d.url),
      });
      if (filesKey) setDraftFiles(filesKey, []);
      updateCaseState({ preauthCorrelationId: res.correlation_id, preauthDecision: null });
      return res;
    },
    { success: "Enhancement sent to the payer", onDone: onSent },
  );

  return {
    preview,
    loading,
    error: state.key === loadKey ? state.error : null,
    reload,
    missingFields,
    setMissingFields,
    hisBlockers,
    patientMissing,
    documents,
    docs,
    missingDocs,
    waivedDocs,
    unavailable,
    newProcedures,
    newItems,
    procedureKept,
    excludedItem,
    lineOf,
    leftOutLines,
    toggleProcedure,
    toggleLine,
    editLine,
    resetScope,
    scopeChanged,
    submittedItems,
    revisedTotal,
    revisedDelta,
    send,
    itemKey,
    treatment,
    planCorrelationId: preview?.plan_correlation_id || null,
    setPackages,
    addPackage,
    removePackage,
  };
}
