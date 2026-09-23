import React from 'react';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';

/**
 * One line under the answer on business pages while "Without my and test accounts" hides something (§3.4):
 * "Your own and test accounts are hidden (n). With them, costs would be €…, and the result …".
 *   n          hidden accounts   costEur  total cost with them   resultEur  result with them (null → no result part)
 */
export default function HiddenNote({ n, costEur, resultEur = null, className = '' }) {
  if (!(n > 0)) return null;
  const text =
    resultEur === null || resultEur === undefined
      ? t('common.hiddenNote.noResult', { n: fmt.int(n), cost: fmt.eur(costEur) })
      : t('common.hiddenNote', { n: fmt.int(n), cost: fmt.eur(costEur), result: fmt.eurSigned(resultEur) });
  return <p className={['mb-4 text-sm font-medium text-ink-soft', className].filter(Boolean).join(' ')}>{text}</p>;
}
