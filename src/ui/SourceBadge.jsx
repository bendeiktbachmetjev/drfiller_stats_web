import React from 'react';
import { t } from '../copy/index.js';

// Style §3.9: text-xs semibold ink-soft on line/40 (≥ 5.7:1). `exact` shows nothing.
const BADGE = 'inline-flex items-center text-xs font-semibold text-ink-soft bg-line/40 rounded-full px-2 py-0.5 whitespace-nowrap';
const BADGE_ON_ACCENT = 'inline-flex items-center text-xs font-semibold text-brand-strong bg-white rounded-full px-2 py-0.5 whitespace-nowrap';

/**
 * How sure a number is: 'estimate' → "estimate", 'inferred' → "indirect", 'missing' → "no data",
 * 'model' → "forecast"; 'exact' (and anything else) renders nothing.
 * @param {{ basis: 'exact'|'estimate'|'inferred'|'missing'|'model'|null|undefined, onAccent?: boolean }} props
 */
export default function SourceBadge({ basis, onAccent = false, className = '' }) {
  if (!['estimate', 'inferred', 'missing', 'model'].includes(basis)) return null;
  return <span className={[onAccent ? BADGE_ON_ACCENT : BADGE, className].filter(Boolean).join(' ')}>{t(`common.badge.${basis}`)}</span>;
}
