import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readFileAsAttachment } from "../../lib/files";

const up = (v) => String(v || "").trim().toUpperCase();
const isAttached = (d) => !!(d?.url || d?.attachment);

const keyOf = (d) => (d.record_id ? `HR-${d.record_id}` : up(d.code));
const NO_RECORD = "The hospital system did not return this record.";

const merge = (seed, stored) => {
  const base = seed || [];
  if (!stored?.length) return base;
  const byCode = new Map(stored.filter((d) => d.code).map((d) => [keyOf(d), d]));
  const merged = base.map((d) => {
    const kept = d.code ? byCode.get(keyOf(d)) : null;
    return kept && isAttached(kept) ? { ...d, ...kept } : d;
  });
  const extra = stored.filter((d) => d.custom && !merged.some((m) => up(m.code) === up(d.code)));
  return [...merged, ...extra];
};

const EMPTY = [];

export function useCaseDocuments(ctx, { key, seed, records, fetchRecord, maxBytes } = {}) {
  const base = useMemo(() => (records?.length ? [...(seed || EMPTY), ...records.map((r) => ({ ...r, optional: true }))] : seed || EMPTY), [seed, records]);
  const stored = ctx?.draftFiles?.[key];
  const [state, setState] = useState(() => ({ seed: base, documents: merge(base, stored) }));
  const [error, setError] = useState(null);
  const counter = useRef(0);

  if (state.seed !== base) setState({ seed: base, documents: merge(base, stored) });

  const documents = state.documents;
  const setDocuments = useCallback((updater) => {
    setState((prev) => ({ ...prev, documents: typeof updater === "function" ? updater(prev.documents) : updater }));
  }, []);

  const setDraftFiles = ctx?.setDraftFiles;
  useEffect(() => {
    if (key && setDraftFiles) setDraftFiles(key, documents);
  }, [key, documents, setDraftFiles]);

  const attachFile = useCallback(
    async (index, file) => {
      setError(null);
      try {
        const uploaded = await readFileAsAttachment(file, maxBytes ? { maxBytes } : {});
        setDocuments((docs) => docs.map((d, i) => (i === index ? { ...d, ...uploaded } : d)));
        return uploaded;
      } catch (err) {
        setError(err?.message || "The file could not be read.");
        return null;
      }
    },
    [maxBytes, setDocuments],
  );

  const attach = useCallback(
    (index, uploaded) => {
      setDocuments((docs) => docs.map((d, i) => (i === index ? { ...d, ...uploaded } : d)));
    },
    [setDocuments],
  );

  const attachRecord = useCallback(
    async (index) => {
      const recordId = documents[index]?.record_id;
      if (!recordId || !fetchRecord) return;
      const patch = (changes) => setDocuments((docs) => docs.map((d) => (d.record_id === recordId ? { ...d, ...changes } : d)));
      patch({ fetching: true, error: null });
      try {
        const row = await fetchRecord(recordId);
        const data = row?.attachment?.data;
        if (data) patch({ fetching: false, attachment: row.attachment, url: `data:${row.attachment.contentType};base64,${data}` });
        else patch({ fetching: false, error: row?.error || NO_RECORD });
      } catch (err) {
        if (err) err.handled = true;
        patch({ fetching: false, error: err?.message || NO_RECORD });
      }
    },
    [documents, fetchRecord, setDocuments],
  );

  const detachRecord = useCallback(
    (index) => setDocuments((docs) => docs.map((d, i) => (i === index ? { ...d, attachment: undefined, url: undefined, error: null } : d))),
    [setDocuments],
  );

  const attachAsk = useCallback(
    (row, uploaded) => {
      setDocuments((docs) => {
        const idx = docs.findIndex((d) => !d.record_id && up(d.code) === up(row.code));
        const entry = { code: row.code, category: row.category || null, name: row.display || row.name, optional: false, ...uploaded };
        return idx >= 0 ? docs.map((d, i) => (i === idx ? { ...d, ...entry } : d)) : [...docs, entry];
      });
    },
    [setDocuments],
  );

  const addCustom = useCallback(() => {
    counter.current += 1;
    const code = `CUSTOM-${Date.now()}-${counter.current}`;
    setDocuments((docs) => [...docs, { code, name: "", category: "attachment", optional: true, custom: true }]);
    return code;
  }, [setDocuments]);

  const rename = useCallback((index, name) => setDocuments((docs) => docs.map((d, i) => (i === index ? { ...d, name } : d))), [setDocuments]);

  const remove = useCallback((index) => setDocuments((docs) => docs.filter((_, i) => i !== index)), [setDocuments]);

  const partition = useCallback(
    (askCodes = []) => {
      const codes = new Set(askCodes.map(up));
      return {
        askDocs: documents.filter((d) => codes.has(up(d.code))),
        otherDocs: documents.filter((d) => !codes.has(up(d.code))),
      };
    },
    [documents],
  );

  const attached = useMemo(() => documents.filter(isAttached), [documents]);
  const missingRequired = useMemo(() => documents.filter((d) => !d.optional && !isAttached(d)), [documents]);

  return {
    documents,
    setDocuments,
    attach,
    attachFile,
    attachAsk,
    attachRecord,
    detachRecord,
    addCustom,
    rename,
    remove,
    partition,
    attached,
    attachedCount: attached.length,
    missingRequired,
    error,
    clearError: () => setError(null),
  };
}
