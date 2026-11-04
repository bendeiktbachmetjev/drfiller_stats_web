import { errorText } from '../../ui/index.js';
import { getLocale } from '../../copy/index.js';

/**
 * Why a clinic change failed: the server's own words when it explains a refusal (a bad field, a clinic that
 * is not prepaid, an unknown doctor, too many changes), else the site's text for the kind of error.
 * @param {unknown} err a DataError
 */
export const reasonOf = (err) => {
  const own = err && typeof err === 'object' && err.apiCode && typeof err.message === 'string' ? err.message.trim() : '';
  return own ? `${own.replace(/\.$/, '')}.` : errorText(err);
};

/** The price of one credit as it is written in a contract: '€0.04', '€0.0325'. */
export const priceText = (eur) =>
  `€${new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(eur)}`;
