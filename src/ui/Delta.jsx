import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';

const BASE = 'inline-flex items-center gap-0.5 h-6 px-2 rounded-full text-xs font-bold whitespace-nowrap';

// SimuFlow's calm rule (§5.3.4): good = brand tint, bad = red tint, flat or 'none' = grey.
const TONES = {
  good: 'bg-brand/10 text-brand',
  bad: 'bg-bad-tint text-bad',
  flat: 'bg-line/40 text-ink-soft',
  onAccent: 'bg-white text-brand-strong',
};

const ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };

// "Up 18 percent compared with the previous 30 days" — the pill itself only shows "+18%".
const spokenDelta = (delta, compareLabel) => {
  const compare = compareLabel ? `(${compareLabel})` : '';
  if (delta.dir === 'flat') return t('common.delta.flat', { compare }).trim();
  // A multiple ('×21') is spoken as its percentage, which the unit word expects.
  const amount = fmt.deltaRatio(delta) === null ? fmt.delta(delta).replace(/[^\d.,]/g, '') : fmt.int(Math.abs(delta.value));
  const unit = t(`common.delta.unit.${delta.kind}`);
  return t(delta.dir === 'up' ? 'common.delta.up' : 'common.delta.down', { amount, unit: unit || ' ', compare }).replace(/\s+/g, ' ').trim();
};

// Signed change against the comparison period.
//   delta        { kind: 'pct' | 'pp' | 'abs' | 'eur', value, dir } from makeDelta; null renders nothing
//   goodWhen     'up' (default) | 'down' | 'none' (always grey: volume totals)
//   onAccent     white pill with brand-strong text, for the hero tile (10.6:1)
//   compareLabel 'the previous 30 days' — only used for the accessible name
export default function Delta({ delta, goodWhen = 'up', onAccent = false, compareLabel, className = '' }) {
  if (!delta || typeof delta.value !== 'number' || !Number.isFinite(delta.value)) return null;

  const dir = ICONS[delta.dir] ? delta.dir : 'flat';
  let tone = 'flat';
  if (onAccent) tone = 'onAccent';
  else if (dir !== 'flat' && goodWhen !== 'none') tone = dir === goodWhen ? 'good' : 'bad';

  const Icon = ICONS[dir];
  const title = fmt.deltaRatio(delta) === null ? undefined : `+${fmt.int(delta.value)}%`;

  return (
    <span role="img" title={title} aria-label={spokenDelta({ ...delta, dir }, compareLabel)} className={[BASE, TONES[tone], className].filter(Boolean).join(' ')}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span aria-hidden="true">{fmt.delta({ ...delta, dir })}</span>
    </span>
  );
}
