// Settings page metric (§4.9). Owned by its page package; F0 stub returning EMPTY_RESULT.
import { EMPTY_RESULT } from './shared.js';

/**
 * Pure. No Date.now() (clock = ds.nowMs), no window, no React, no copy strings, no formatting.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('../core/scope.js').Scope} scope
 * @param {object} [opts] page-local, JSON-serialisable
 * @returns {import('./shared.js').AreaResult}
 */
export function computeSettings(ds, period, scope, opts = {}) {
  return EMPTY_RESULT;
}
