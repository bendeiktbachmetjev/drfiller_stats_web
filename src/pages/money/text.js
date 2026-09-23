// Words for the Money metric items. The metric returns copy keys with raw values (§4.0); besides the `fmt`
// hints it nests copy items ({ key, values } — the plan scenario, a sensitivity change), and every
// sentence may say "{period}", which the page fills with the period as a phrase ("in the last 30 days").
import { PACK_SIZES } from '../../data/constants.js';
import { doctorLabel, getLocale, has, plural, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

const isItem = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && typeof value.key === 'string';

/**
 * The selected period inside a sentence: "in the last 30 days", "in September 2026 so far", "since the start".
 * @param {import('../../data/period.js').Period|null} period
 * @returns {string}
 */
export function periodPhrase(period) {
  if (!period) return '';
  switch (period.preset) {
    case 'last7':
      return t('money.period.last7');
    case 'last30':
      return t('money.period.last30');
    case 'month':
      return t(period.isPartial ? 'money.period.monthSoFar' : 'money.period.month', { month: fmt.month(period.from) });
    case 'year':
      return t(period.isPartial ? 'money.period.yearSoFar' : 'money.period.year', { year: period.from.slice(0, 4) });
    case 'allTime':
      return t('money.period.allTime');
    default:
      return t('money.period.custom', { range: fmt.range(period.from, period.to) });
  }
}

/**
 * Euros always with cents ("€108.50"): for amounts that are sums of pack prices, where rounding to whole
 * euros (fmt.eur above €100) would hide the exact figure.
 * @param {number} eur
 */
export const eurCents = (eur) =>
  Number.isFinite(eur) ? `€${new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(eur)}` : fmt.empty;

const isEurCents = (raw) => Array.isArray(raw) && raw[0] === 'eurCents';

/**
 * Text of a metric item: `fmt` hints and plain numbers are formatted, nested items are translated, the
 * page-level hint ['eurCents', €] keeps the cents, and `extra` fills the placeholders of the page ({ period }).
 * @param {{ key: string, values?: object } | null | undefined} item
 * @param {Record<string, string>} [extra]
 * @returns {string}
 */
export function textOf(item, extra = {}) {
  if (!item?.key) return '';
  const values = { ...extra };
  Object.entries(item.values ?? {}).forEach(([name, raw]) => {
    if (isItem(raw)) values[name] = textOf(raw, extra);
    else if (isEurCents(raw)) values[name] = eurCents(raw[1]);
    else values[name] = fmt.values({ [name]: raw })[name];
  });
  return t(item.key, values);
}

/** "Pack 600" (or "Unknown pack"). */
export const packName = (packId) => (PACK_SIZES[packId] ? t('money.pack', { n: PACK_SIZES[packId] }) : t('money.pack.unknown'));

/** How the doctor paid: "Card", "PayPal" … */
export const methodLabel = (method) => (has(`money.method.${method}`) ? t(`money.method.${method}`) : t('money.method.other'));

/** Did the credits arrive after the payment: "✓ arrived", "✗ did not arrive", "waiting for Stripe" … */
export const creditedLabel = (state) => t(`money.credited.${has(`money.credited.${state}`) ? state : 'unknown'}`);

/** "2.5 credits" — keeps one decimal where the visit's credits are not whole (unlike fmt.credits). */
export const creditsText = (n) =>
  Number.isFinite(n) ? (Number.isInteger(n) ? fmt.credits(n) : `${fmt.dec(n)} ${plural(n, 'common.unit.credit')}`) : fmt.empty;

/**
 * The doctor of a payment, as shown everywhere (OVERRIDES O2): the Dataset doctor, or a stand-in for a
 * payment without a known account.
 * @param {{ doctors?: Map<string, object> } | null} ds
 * @param {string|null} pid
 */
export const doctorOf = (ds, pid) => ds?.doctors?.get?.(pid) ?? { email: null, noText: null, code: null };

/** The doctor's display name for sorting and CSV; "—" for a payment that no account can be matched to. */
export const doctorText = (ds, pid) => (pid ? doctorLabel(doctorOf(ds, pid)) : fmt.empty);

/** A tile without a value already says "no data"; its badge would only repeat that. */
export const badgeOf = (value, basis) => (value === null || value === undefined ? undefined : basis);
