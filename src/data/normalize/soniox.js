// /soniox-usage → SonioxApi, or null when off/failed. Days are Vilnius days already (server side).

/**
 * @param {import('../api/contract.js').SonioxApi|null} api
 * @returns {import('../api/contract.js').SonioxApi|null}
 */
export function normalizeSoniox(api) {
  if (!api || typeof api !== 'object') return null;
  return {
    ...api,
    days: Array.isArray(api.days) ? [...api.days].sort((a, b) => a.day.localeCompare(b.day)) : [],
    liveSessions: Array.isArray(api.liveSessions) ? [...api.liveSessions].sort((a, b) => a.endedAt - b.endedAt) : [],
  };
}
