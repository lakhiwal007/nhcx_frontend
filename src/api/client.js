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


const getProviderHeader = () => {
  const code = localStorage.getItem("nhcx_default_provider_id");
  return code ? { "X-Provider-Id": code } : {};
};

const dispatchError = (msg) =>
  window.dispatchEvent(new CustomEvent("api-error", { detail: msg }));

/** Wrapper around fetch — auto-injects request_id and X-Provider-Id; throws on non-2xx. */
export const http = {
  get: async (path, params = {}, signal) => {
    const merged = { request_id: generateRequestId(), ...params };
    try {
      const res = await fetch(buildUrl(path, merged), {
        headers: { "Content-Type": "application/json", ...getProviderHeader() },
        signal,
      });
      if (!res.ok) {
        throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      // Aborted polls (tab hidden, navigation, superseded request) are expected —
      // don't surface them as a global API error. Rethrow so the caller can swallow it.
      if (err.name === "AbortError") throw err;
      dispatchError(err.message);
      throw err;
    }
  },

  post: async (path, body = {}) => {
    const merged = { request_id: generateRequestId(), ...body };
    try {
      const res = await fetch(BASE_URL + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getProviderHeader() },
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
    const merged = { request_id: generateRequestId(), ...body };
    try {
      const res = await fetch(BASE_URL + path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getProviderHeader() },
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
    const merged = { request_id: generateRequestId(), ...body };
    try {
      const res = await fetch(BASE_URL + path, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getProviderHeader() },
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
        headers: { "Content-Type": "application/json", ...getProviderHeader() },
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
