// Inside the hospital system's iframe, a browser that blocks third-party
// storage throws on any localStorage access, which would stop the app before
// it renders. Probe once at startup and, if storage is unavailable, stand in
// an in-memory store for this session (nothing persists across reloads then).
function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
    key: (index) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
  };
}

try {
  const probe = "__nhcx_storage_probe__";
  window.localStorage.setItem(probe, "1");
  window.localStorage.removeItem(probe);
} catch {
  try {
    Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
  } catch {
    // Nothing else to fall back to; the calls that need storage will fail loudly.
  }
}
