// "All accounts | Without my and test accounts" (§3.4). Business numbers follow the scope; service
// numbers (summarizeHealth, unitCosts, summarizeToday) never do.

/**
 * @typedef {{ excludeInternal: boolean, vatPayer: boolean, internalPids: string[], planning: import('../api/contract.js').Planning }} Scope
 */

/**
 * Builds the scope object from the switch and the server settings.
 * @param {{ excludeInternal?: boolean, settings?: import('../api/contract.js').Settings|null }} input
 * @returns {Scope}
 */
export function makeScope({ excludeInternal = true, settings = null } = {}) {
  return {
    excludeInternal: Boolean(excludeInternal),
    vatPayer: Boolean(settings?.vatPayer),
    internalPids: [...(settings?.internalPids ?? [])].sort(),
    planning: settings?.planning ?? null,
  };
}

/**
 * Stable memo key of a scope (part of useMetric's memo key).
 * @param {Scope} scope
 * @returns {string}
 */
export function scopeKey(scope) {
  if (!scope) return '-';
  return JSON.stringify([scope.excludeInternal ? 1 : 0, scope.vatPayer ? 1 : 0, scope.internalPids ?? [], scope.planning ?? null]);
}

/**
 * Is this pid one of "my and test" accounts? The server merges env, profile and settings marks into
 * `DoctorApi.internal`.
 * @param {string} pid
 * @param {{ doctors?: Map<string, { internal?: boolean }> }} ds
 */
export const isInternal = (pid, ds) => Boolean(ds?.doctors?.get?.(pid)?.internal);

/** @param {{ doctorList?: Array<{ internal?: boolean }> }} ds @returns {number} internal accounts known */
export const internalCount = (ds) => (ds?.doctorList ?? []).filter((doctor) => doctor.internal).length;

/** The switch has an effect only when at least one account is internal. */
export const hidesInternal = (ds, scope) => Boolean(scope?.excludeInternal) && internalCount(ds) > 0;

/**
 * Rows of the business scope.
 * @template {{ pid: string }} R
 * @param {R[]} rows
 * @param {object} ds
 * @param {Scope} scope
 * @returns {R[]}
 */
export function scopedRows(rows, ds, scope) {
  if (!hidesInternal(ds, scope)) return rows ?? [];
  return (rows ?? []).filter((row) => !isInternal(row.pid, ds));
}

/**
 * Doctors of the business scope.
 * @param {{ doctorList?: object[] }} ds
 * @param {Scope} scope
 */
export function scopedDoctors(ds, scope) {
  const list = ds?.doctorList ?? [];
  return hidesInternal(ds, scope) ? list.filter((doctor) => !doctor.internal) : list;
}
