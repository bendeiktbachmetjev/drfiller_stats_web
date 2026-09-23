// Where the admin API lives. Production: the Railway backend. Dev with the mock: `VITE_API_URL=` (empty →
// same origin → the Vite proxy). `?server=` is honoured only on the dev server (D15): a crafted link must
// never send the admin key elsewhere.
import { DEFAULT_API_URL } from '../data/constants.js';

const LOCAL_SERVER = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Pure rule behind apiBaseUrl (tested): a local `?server=` wins on the dev server only; then the build's
 * VITE_API_URL (an empty string = same origin); then the default.
 * @param {{ dev: boolean, search?: string, envUrl?: string, defaultUrl?: string }} input
 * @returns {string}
 */
export function resolveApiBase({ dev, search = '', envUrl, defaultUrl = DEFAULT_API_URL }) {
  if (dev) {
    const override = new URLSearchParams(search).get('server');
    if (override && LOCAL_SERVER.test(override)) return override;
  }
  return envUrl === undefined ? defaultUrl : envUrl;
}

/** The API base of this page (reads the build flags and the address bar). */
export function apiBaseUrl() {
  let search = '';
  try {
    search = window.location.search;
  } catch {
    // No window: no override.
  }
  return resolveApiBase({ dev: Boolean(import.meta.env.DEV), search, envUrl: import.meta.env.VITE_API_URL });
}
