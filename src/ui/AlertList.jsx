import React, { useId } from 'react';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import { ALERTS } from '../data/constants.js';
import InsightRow from './InsightRow.jsx';

/**
 * "Needs attention" on Overview (§3.10): only alerts that fired, attention first, at most 3.
 *   items  computeAlerts() output: [{ key, tone, values, link }] (keys under `alerts.*`)
 * Renders nothing when nothing fired.
 */
export default function AlertList({ items = [], className = '' }) {
  const headingId = useId();
  const list = (Array.isArray(items) ? items : []).slice(0, ALERTS.maxShown);
  if (list.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className={['mb-6', className].filter(Boolean).join(' ')}>
      <h2 id={headingId} className="mb-1 text-sm font-bold text-ink">
        {t('common.alerts.title')}
      </h2>
      {list.map((alert) => (
        <InsightRow key={alert.key} tone={alert.tone === 'attention' ? 'attention' : 'quiet'} to={alert.link} parts={[{ t: fmt.textOf({ key: `alerts.${alert.key}`, values: alert.values }) }]} />
      ))}
    </section>
  );
}
