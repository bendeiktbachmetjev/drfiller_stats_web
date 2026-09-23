// The only network code of the data layer (§5.3.7). Sends the admin key as `x-admin-secret`,
// unwraps the envelope, maps failures to DataError. No window, no storage: the key comes from getKey().
import { API_PREFIX, REQUEST_TIMEOUT_MS } from '../constants.js';
import { DataError, codeForStatus, toDataError } from '../errors.js';
import { SCHEMA_VERSION } from './contract.js';

const queryString = (query) => {
  if (!query) return '';
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `?${params.join('&')}` : '';
};

// One signal that aborts on the caller's signal or after the timeout.
const withTimeout = (signal, timeoutMs) => {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
    },
  };
};

/**
 * @typedef {{
 *   get: (route: string, query?: object, options?: { signal?: AbortSignal }) => Promise<any>,
 *   put: (route: string, body: object, options?: { signal?: AbortSignal }) => Promise<any>,
 *   getEnvelope: (route: string, query?: object, options?: { signal?: AbortSignal }) => Promise<import('./contract.js').Ok<any>>
 * }} ApiClient
 */

/**
 * Admin API v2 client.
 * @param {{ baseUrl: string, getKey: () => string|null, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 *   baseUrl '' = same origin (the Vite dev proxy); routes are relative to '/api/admin/v2'
 * @returns {ApiClient} `get`/`put` return `envelope.data`; `getEnvelope` the whole envelope (cache age, notes).
 *   Throws DataError: 401 → AUTH, 503 → API_OFF, 409 → CONFLICT, 413 → TOO_MANY_ROWS, 400 BAD_RANGE → BAD_RANGE,
 *   bad envelope → SCHEMA, network → NETWORK, timeout → TIMEOUT, abort → ABORTED.
 */
export function createClient({ baseUrl = '', getKey, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const base = String(baseUrl ?? '').replace(/\/+$/, '');

  async function request(method, route, { query, body, signal } = {}) {
    const url = `${base}${API_PREFIX}${route}${queryString(query)}`;
    const timer = withTimeout(signal, timeoutMs);
    let response;
    try {
      const headers = { Accept: 'application/json', 'x-admin-secret': getKey?.() ?? '' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timer.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch (err) {
      timer.done();
      if (timer.timedOut()) throw new DataError('TIMEOUT', null, { route, cause: err });
      throw toDataError(err, { route });
    }

    let json = null;
    try {
      json = await response.json();
    } catch (err) {
      timer.done();
      if (timer.timedOut()) throw new DataError('TIMEOUT', null, { route, cause: err });
      if (!response.ok) throw new DataError(codeForStatus(response.status), null, { route, status: response.status, cause: err });
      throw new DataError('SCHEMA', 'Response is not JSON.', { route, status: response.status, cause: err });
    }
    timer.done();

    if (!response.ok || json?.success === false) {
      const apiCode = typeof json?.code === 'string' ? json.code : null;
      const status = response.ok ? 500 : response.status;
      throw new DataError(codeForStatus(status, apiCode), typeof json?.error === 'string' ? json.error : null, { route, status, apiCode });
    }
    if (json?.success !== true || json.schemaVersion !== SCHEMA_VERSION || !('data' in json)) {
      throw new DataError('SCHEMA', `Unexpected envelope (schemaVersion ${json?.schemaVersion}).`, { route, status: response.status });
    }
    return json;
  }

  return {
    getEnvelope: (route, query, options = {}) => request('GET', route, { query, signal: options.signal }),
    get: async (route, query, options = {}) => (await request('GET', route, { query, signal: options.signal })).data,
    put: async (route, body, options = {}) => (await request('PUT', route, { body, signal: options.signal })).data,
  };
}
