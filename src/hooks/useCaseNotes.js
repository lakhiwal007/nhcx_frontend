import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

export function useCaseNotes(cashlessCaseId) {
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!cashlessCaseId) return;
    try {
      const res = await api.listCaseNotes(cashlessCaseId);
      setNotes(res?.notes || []);
      setError(null);
    } catch (err) {
      setError(err.message || "Could not load notes.");
    } finally {
      setLoaded(true);
    }
  }, [cashlessCaseId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { notes, loaded, error, refresh };
}
