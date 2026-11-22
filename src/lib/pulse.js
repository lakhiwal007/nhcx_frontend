import { createContext, useContext, useEffect, useRef } from "react";

export const PULSE_OFF = { caseId: null, caseStamp: undefined, tasksStamp: undefined, commsStamp: undefined, refresh: () => Promise.resolve() };

export const PulseContext = createContext(PULSE_OFF);

export const usePulse = () => useContext(PulseContext);

export function useOnChange(value, fn) {
  const seen = useRef(undefined);
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (value === undefined) {
      seen.current = undefined;
      return;
    }
    const before = seen.current;
    seen.current = value;
    if (before !== undefined && before !== value) fnRef.current();
  }, [value]);
}

export function useCasePulse(caseId) {
  const pulse = usePulse();
  const follows = caseId != null && String(pulse.caseId) === String(caseId);
  return { follows, stamp: follows ? pulse.caseStamp : undefined };
}
