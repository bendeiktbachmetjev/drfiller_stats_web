// One error type for the whole data layer, so the UI decides what to say from `code` alone.
// Pure file: no React, no window. Messages are English developer text; the UI shows copy keys
// (`common.error.*`) chosen by code, never these messages.

export const ERROR_CODES = Object.freeze([
  'NETWORK',
  'TIMEOUT',
  'AUTH',
  'API_OFF',
  'SERVER',
  'BAD_RANGE',
  'TOO_MANY_ROWS',
  'CONFLICT',
  'SCHEMA',
  'ABORTED',
]);

const DEFAULT_MESSAGES = {
  NETWORK: 'The server could not be reached.',
  TIMEOUT: 'The server took too long to answer.',
  AUTH: 'The admin key was refused.',
  API_OFF: 'The admin API is switched off on the server.',
  SERVER: 'The server answered with an error.',
  BAD_RANGE: 'The server refused the date range.',
  TOO_MANY_ROWS: 'The history is too large for one request.',
  CONFLICT: 'The server refused the change (conflict).',
  SCHEMA: 'The server answered with an unexpected shape.',
  ABORTED: 'Loading was cancelled.',
};

export class DataError extends Error {
  /**
   * @param {string} code one of ERROR_CODES (anything else becomes SERVER)
   * @param {string} [message]
   * @param {{ route?: string|null, status?: number|null, apiCode?: string|null, cause?: unknown }} [info]
   */
  constructor(code, message, { route = null, status = null, apiCode = null, cause = null } = {}) {
    super(message || DEFAULT_MESSAGES[code] || DEFAULT_MESSAGES.SERVER);
    this.name = 'DataError';
    this.code = ERROR_CODES.includes(code) ? code : 'SERVER';
    this.route = route;
    this.status = status;
    /** The envelope's `code` (e.g. 'INVALID_BODY') when the server sent one. */
    this.apiCode = apiCode;
    this.cause = cause;
  }
}

/**
 * HTTP status (+ the envelope's error code) → DataError code.
 * 401 → AUTH, 503 → API_OFF, 409 → CONFLICT, 413 → TOO_MANY_ROWS, 400 BAD_RANGE → BAD_RANGE,
 * 408/504 → TIMEOUT, 0 → NETWORK, anything else → SERVER.
 * @param {number} status
 * @param {string|null} [apiCode]
 * @returns {string}
 */
export function codeForStatus(status, apiCode = null) {
  if (status === 0) return 'NETWORK';
  if (status === 401) return 'AUTH';
  if (status === 503) return 'API_OFF';
  if (status === 409) return 'CONFLICT';
  if (status === 413 || apiCode === 'TOO_MANY_ROWS') return 'TOO_MANY_ROWS';
  if (apiCode === 'BAD_RANGE') return 'BAD_RANGE';
  if (status === 408 || status === 504) return 'TIMEOUT';
  return 'SERVER';
}

const textOf = (err) => [err?.name, err?.message].filter((part) => typeof part === 'string').join(' ');

/**
 * Anything a fetch can throw (TypeError, AbortError, DataError) → DataError.
 * @param {unknown} err
 * @param {{ route?: string|null, status?: number|null }} [info]
 * @returns {DataError}
 */
export function toDataError(err, { route = null, status = null } = {}) {
  if (err instanceof DataError) {
    if (route && !err.route) err.route = route;
    return err;
  }
  const text = textOf(err);
  if (err?.name === 'AbortError' || /\bAbortError\b/.test(text)) {
    return new DataError('ABORTED', null, { route, cause: err });
  }
  if (err?.name === 'TimeoutError' || /timed? ?out/i.test(text)) {
    return new DataError('TIMEOUT', null, { route, cause: err });
  }
  if (status != null) return new DataError(codeForStatus(status), null, { route, status, cause: err });
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|econn|enotfound/i.test(text)) {
    return new DataError('NETWORK', null, { route, cause: err });
  }
  return new DataError('SERVER', null, { route, cause: err });
}

/** Retry once on these (network trouble and 5xx other than API_OFF). */
export const isRetryable = (error) =>
  error instanceof DataError &&
  (error.code === 'NETWORK' || error.code === 'TIMEOUT' || (error.code === 'SERVER' && error.status >= 500));
