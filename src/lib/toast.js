const MAX_TOASTS = 4;
const DURATION = { success: 5000, info: 5000, error: 8000 };

let toasts = [];
let seq = 0;
const listeners = new Set();
const timers = new Map();

const notify = () => listeners.forEach((listener) => listener());

const dismiss = (id) => {
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  notify();
};

const push = (tone, message, { duration, action } = {}) => {
  const text = String(message || "").trim();
  if (!text) return null;
  const ms = duration ?? DURATION[tone] ?? 5000;
  const existing = action ? null : toasts.find((t) => t.tone === tone && t.message === text && !t.action);
  let id;
  if (existing) {
    id = existing.id;
    toasts = toasts.map((t) => (t.id === id ? { ...t, count: t.count + 1 } : t));
  } else {
    id = ++seq;
    toasts = [...toasts, { id, tone, message: text, count: 1, action: action || null }].slice(-MAX_TOASTS);
  }
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => dismiss(id), ms));
  notify();
  return id;
};

export const toast = {
  success: (message, options) => push("success", message, options),
  info: (message, options) => push("info", message, options),
  error: (message, options) => push("error", message, options),
  dismiss,
  clear: () => {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    toasts = [];
    notify();
  },
};

export const subscribeToasts = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getToasts = () => toasts;
