// Binomial distribution for the Soniox stream limit (D22): how many of N doctors record at once in the
// busiest hour. Log-space pmf, so N up to 10,000 neither underflows nor overflows.

const logFactorials = [0];
const logFactorial = (n) => {
  for (let k = logFactorials.length; k <= n; k += 1) logFactorials[k] = logFactorials[k - 1] + Math.log(k);
  return logFactorials[n];
};

/**
 * P(X = k) for X ~ Binomial(n, p).
 * @param {number} n
 * @param {number} p
 * @param {number} k
 * @returns {number}
 */
export function binomialPmf(n, p, k) {
  if (k < 0 || k > n) return 0;
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  const logC = logFactorial(n) - logFactorial(k) - logFactorial(n - k);
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log1p(-p));
}

/**
 * P(X ≤ k).
 * @param {number} n
 * @param {number} p
 * @param {number} k
 * @returns {number}
 */
export function binomialCdf(n, p, k) {
  if (k < 0) return 0;
  if (k >= n) return 1;
  let sum = 0;
  for (let j = 0; j <= k; j += 1) sum += binomialPmf(n, p, j);
  return Math.min(1, sum);
}

/**
 * The smallest k with P(X ≤ k) ≥ q (q = 0.95: "19 of 20 peak hours stay at or below k").
 * @param {number} n
 * @param {number} p
 * @param {number} q
 * @returns {number}
 */
export function binomialQuantile(n, p, q) {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  let sum = 0;
  for (let k = 0; k <= n; k += 1) {
    sum += binomialPmf(n, p, k);
    if (sum >= q - 1e-12) return k;
  }
  return n;
}

/**
 * The largest N with P(X > limit) ≤ risk, searched up to `maxN` (tail risk grows with N).
 * @param {number} p chance that one doctor records in the busiest hour
 * @param {number} limit streams at once
 * @param {{ risk?: number, maxN?: number }} [options]
 * @returns {number}
 */
export function largestSafeN(p, limit, { risk = 0.05, maxN = 10000 } = {}) {
  if (p <= 0) return maxN;
  const safe = (n) => 1 - binomialCdf(n, p, limit) <= risk + 1e-12;
  let lo = Math.min(limit, maxN); // n ≤ limit can never exceed the limit
  if (!safe(lo)) return lo;
  let hi = maxN;
  if (safe(hi)) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (safe(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
