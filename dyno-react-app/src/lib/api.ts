// Single source of truth for the backend URL.
// REACT_APP_API_URL should point to the API base (no trailing slash, no /api suffix).
// In dev this defaults to localhost:5000.
export const API_ORIGIN = process.env.REACT_APP_API_URL || "http://localhost:5000";
export const API = `${API_ORIGIN}/api`;
