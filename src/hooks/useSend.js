import { useCallback, useEffect, useRef, useState } from "react";
import { markHandled } from "../api";
import { toast } from "../toast";

export function useSend(fn, { confirm = false, success, onDone } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [pendingArgs, setPendingArgs] = useState(null);
  const alive = useRef(true);
  const latest = useRef({ fn, success, onDone });

  useEffect(() => {
    latest.current = { fn, success, onDone };
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (...args) => {
    setBusy(true);
    setError(null);
    try {
      const res = await latest.current.fn(...args);
      if (!alive.current) return res;
      setResult(res);
      const message = typeof latest.current.success === "function" ? latest.current.success(res) : latest.current.success;
      if (message) toast.success(message);
      latest.current.onDone?.(res);
      return res;
    } catch (err) {
      markHandled(err);
      if (alive.current) setError(err?.message || "Something went wrong.");
      return undefined;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const request = useCallback(
    (...args) => {
      if (!confirm) return run(...args);
      setPendingArgs(args);
      return Promise.resolve(undefined);
    },
    [confirm, run],
  );

  const proceed = useCallback(() => {
    const args = pendingArgs || [];
    setPendingArgs(null);
    return run(...args);
  }, [pendingArgs, run]);

  const cancel = useCallback(() => setPendingArgs(null), []);

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
    setPendingArgs(null);
  }, []);

  return { request, run, proceed, cancel, reset, busy, error, result, confirming: pendingArgs !== null, pendingArgs };
}
