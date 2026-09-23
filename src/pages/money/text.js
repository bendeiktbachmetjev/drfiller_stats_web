// Words for the Money metric items. The metric returns copy keys with raw values (§4.0); the shared resolver
// (format/items.js) handles nested items and doctors, and every sentence may say "{period}", which the page
// fills with the shared period phrase ("over the last 30 days").
import { PACK_SIZES } from '../../data/constants.js';
import { doctorLabel, getLocale, has, plural, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { itemText } from '../../format/items.js';

/**
 * Euros always with cents ("€108.50"): for amounts that are sums of pack prices, where rounding to whole
 * euros (fmt.eur above €100) would hide the exact figure.
 * @param {number} eur
 */
export const eurCents = (eur) =>
  Number.isFinite(eur) ? `€${new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(eur)}` : fmt.empty;

/**
 * Text of a metric item through the shared resolver; the page-level hint ['eurCents', €] keeps the cents,
 * and `extra` fills the placeholders of the page ({ period }).
 * @param {{ key: string, values?: object } | null | undefined} item
 * @param {Record<string, string>} [extra]
 * @returns {string}
 */
export const textOf = (item, extra = {}) => itemText(item, { extra, hints: { eurCents } });

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
