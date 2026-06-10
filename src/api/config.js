export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

export const BASE_URL =
  import.meta.env.VITE_BASE_URL ||
  "http://localhost:8082/nhcx/backend/api/v1/insurance";

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
