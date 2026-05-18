import axios from "axios";

// Single source of truth for the backend URL.
// REACT_APP_API_URL should point to the API base (no trailing slash, no /api suffix).
// In dev this defaults to localhost:5000.
export const API_ORIGIN = process.env.REACT_APP_API_URL || "http://localhost:5000";
export const API = `${API_ORIGIN}/api`;

// Holder for the current session-token getter. Set once by AuthBridge (which lives
// inside ClerkProvider and so can use Clerk hooks). Read by axios's request
// interceptor on every API call.
type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter = async () => null;

export function setTokenGetter(fn: TokenGetter) {
  getToken = fn;
}

axios.interceptors.request.use(async (config) => {
  // Only attach the Bearer token for requests to our own API
  if (typeof config.url === "string" && config.url.startsWith(API_ORIGIN)) {
    try {
      const token = await getToken();
      if (token) {
        config.headers = config.headers || {};
        (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
      }
    } catch {
      // No active session — proceed without a token; backend will 401 if it's required.
    }
  }
  return config;
});
