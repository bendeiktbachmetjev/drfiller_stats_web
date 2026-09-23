// Where the admin API lives. Production: the Railway backend. Dev with the mock: `VITE_API_URL=` (empty →
// same origin → the Vite proxy). `?server=` is honoured only on the dev server (D15): a crafted link must
// never send the admin key elsewhere.
import { DEFAULT_API_URL } from '../data/constants.js';

export function apiBaseUrl() {
  if (import.meta.env.DEV) {
    try {
      const override = new URLSearchParams(window.location.search).get('server');
      if (override && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(override)) return override;
    } catch {
      // No window: fall through.
    }
  }
  const fromEnv = import.meta.env.VITE_API_URL;
  return fromEnv === undefined ? DEFAULT_API_URL : fromEnv;
}
