import { BASE_URL } from "./config.js";

const generateRequestId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

const buildUrl = (path, params = {}) => {
  const url = new URL(BASE_URL + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.append(k, v);
    }
  });
  return url.toString();
};

const injectProvider = (data) => {
  if (typeof data !== "object" || data === null) return data;
  const defaultProvider = localStorage.getItem("nhcx_default_provider_id");
  if (defaultProvider && !data.provider_id) {
    return { ...data, provider_id: defaultProvider };
  }
  return data;
};

const dispatchError = (msg) =>
  window.dispatchEvent(new CustomEvent("api-error", { detail: msg }));

/** Wrapper around fetch — auto-injects request_id; throws on non-2xx. */
export const http = {
  get: async (path, params = {}) => {
    const merged = { request_id: generateRequestId(), ...injectProvider(params) };
    try {
      const res = await fetch(buildUrl(path, merged), {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      dispatchError(err.message);
      throw err;
    }
  },

  post: async (path, body = {}) => {
    const merged = injectProvider({ request_id: generateRequestId(), ...body });
    try {
      const res = await fetch(BASE_URL + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });
      if (!res.ok) {
        throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      dispatchError(err.message);
      throw err;
    }
  },

  patch: async (path, body = {}) => {
    const merged = injectProvider({ request_id: generateRequestId(), ...body });
    try {
      const res = await fetch(BASE_URL + path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });
      if (!res.ok) {
        throw new Error(`PATCH ${path} failed: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      dispatchError(err.message);
      throw err;
    }
  },

  put: async (path, body = {}) => {
    const merged = injectProvider({ request_id: generateRequestId(), ...body });
    try {
      const res = await fetch(BASE_URL + path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });
      if (!res.ok) {
        throw new Error(`PUT ${path} failed: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      dispatchError(err.message);
      throw err;
    }
  },

  rawPost: async (fullPath, body = {}) => {
    const merged = { request_id: generateRequestId(), ...body };
    const url = fullPath.startsWith("http")
      ? fullPath
      : window.location.origin + fullPath;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });
      if (!res.ok) {
        throw new Error(`POST ${fullPath} failed: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      dispatchError(err.message);
      throw err;
    }
  },
};
