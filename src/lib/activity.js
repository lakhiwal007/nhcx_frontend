const IDLE_AFTER_MS = 5 * 60_000;
const EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];

let lastActive = Date.now();
const wakers = new Set();

const noteActivity = () => {
  const wasIdle = Date.now() - lastActive > IDLE_AFTER_MS;
  lastActive = Date.now();
  if (wasIdle) wakers.forEach((fn) => fn());
};

if (typeof window !== "undefined") {
  EVENTS.forEach((name) => window.addEventListener(name, noteActivity, { passive: true, capture: true }));
}

export const isIdle = () => Date.now() - lastActive > IDLE_AFTER_MS;

export const onWake = (fn) => {
  wakers.add(fn);
  return () => wakers.delete(fn);
};
