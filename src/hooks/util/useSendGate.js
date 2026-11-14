import { useCallback, useEffect, useRef, useState } from "react";
import { api, markHandled } from "../../api";

const askName = (ask) => ask.display || ask.name || ask.code || "an item";

export function useSendGate({ caseId, waived = [], label = "Request", onSend }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const latest = useRef({ onSend, waived });

  useEffect(() => {
    latest.current = { onSend, waived };
  });

  const request = useCallback(() => {
    if (!latest.current.waived.length) return latest.current.onSend?.();
    setError(null);
    setOpen(true);
    return Promise.resolve(undefined);
  }, []);

  const cancel = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const proceed = useCallback(async () => {
    const text = reason.trim();
    if (!text) return undefined;
    setSaving(true);
    setError(null);
    if (caseId) {
      try {
        await api.createCaseNote(caseId, {
          category: "general",
          body: `${label} sent without: ${latest.current.waived.map(askName).join(", ")}. Reason: ${text}`,
        });
      } catch (err) {
        markHandled(err);
        setSaving(false);
        setError("Could not record the reason. Nothing was sent.");
        return undefined;
      }
    }
    setSaving(false);
    setOpen(false);
    setReason("");
    return latest.current.onSend?.();
  }, [caseId, label, reason]);

  return { open, request, cancel, proceed, reason, setReason, saving, error, waived };
}
