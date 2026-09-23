// /config → ConfigApi, or null when it failed (the static price table is then used).
import { validate } from '../api/contract.js';

/**
 * @param {object|null} api
 * @returns {{ config: import('../api/contract.js').ConfigApi|null, valid: boolean, errors: string[] }}
 */
export function normalizeConfig(api) {
  if (!api) return { config: null, valid: false, errors: [] };
  const { ok, errors } = validate('config', api);
  return { config: api, valid: ok, errors };
}
