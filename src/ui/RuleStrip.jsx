import React from 'react';
import { t } from '../copy/index.js';

/** Quiet full-width strip with a rule the owner should see (default: how doctors pay, §3.2). */
export default function RuleStrip({ textKey = 'common.billingRule', values, className = '' }) {
  return <p className={['my-4 px-4 py-3 rounded-[16px] bg-line/25 text-sm font-medium text-ink-soft', className].filter(Boolean).join(' ')}>{t(textKey, values)}</p>;
}
