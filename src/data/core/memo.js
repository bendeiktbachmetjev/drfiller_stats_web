// Per-dataset memo for core results. A dataset is frozen and rebuilt on every load, so a WeakMap keyed
// by the dataset drops old results with it. Results are deep-frozen: every page reads the same object.

const memo = new WeakMap();
const MEMO_LIMIT = 64;

/** Freezes plain objects and arrays all the way down (shared results must never be mutated). */
export const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/**
 * Per-dataset memo (FIFO, ≤ 64 entries per dataset). Results are deep-frozen.
 * @template T
 * @param {object} ds
 * @param {string} key
 * @param {() => T} compute
 * @returns {T}
 */
export const remember = (ds, key, compute) => {
  let cache = memo.get(ds);
  if (!cache) {
    cache = new Map();
    memo.set(ds, cache);
  }
  if (cache.has(key)) return cache.get(key);
  const value = deepFreeze(compute());
  if (cache.size >= MEMO_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
};

