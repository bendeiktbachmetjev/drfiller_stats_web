import React from 'react';
import { Link } from 'react-router-dom';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import { usePrintMode } from '../context/usePrintMode.js';
import Card from './Card.jsx';
import Delta from './Delta.jsx';
import InfoHint from './InfoHint.jsx';
import Meter from './Meter.jsx';
import SourceBadge from './SourceBadge.jsx';
import Sparkline from './Sparkline.jsx';
import useCountUp from './useCountUp.js';
import useReducedMotion from './useReducedMotion.js';

// The label is the link; its ::after covers the whole card, so the tile is one click target
// while the hint button (raised with z-[1]) stays clickable on top of it.
const STRETCHED =
  'after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent';
const STRETCHED_ON_ACCENT =
  'after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-white';

// Phone rules (§3.2): p-4, value 28 px, label ≤ 2 lines, sub-line 1 line (full text in the (i)).
const STYLES = {
  default: {
    padding: 'none',
    card: 'flex flex-col p-4 sm:p-6 min-h-[148px] sm:min-h-[168px] print:min-h-0',
    label: 'text-[13px] font-semibold text-ink-soft line-clamp-2',
    link: STRETCHED,
    value: 'mt-3 sf-kpi-value text-[28px] sm:text-4xl xl:text-[40px] leading-none font-extrabold tracking-[-0.02em] text-ink print:text-[22pt]',
    valueEmpty: 'mt-3 sf-kpi-value text-[28px] sm:text-4xl xl:text-[40px] leading-none font-extrabold tracking-[-0.02em] text-ink-mute print:text-[22pt]',
    unit: 'ml-1 text-base leading-none font-bold text-ink-mute',
    unitTight: 'ml-0.5 text-base leading-none font-bold text-ink-mute',
    deltaRow: 'mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 min-h-[24px]',
    caption: 'text-xs font-medium text-ink-soft',
    sub: 'mt-1 min-h-[16px] text-xs font-medium text-ink-mute truncate',
    foot: 'mt-auto pt-4',
  },
  hero: {
    padding: 'none',
    card: 'flex flex-col p-6 sm:p-8 min-h-0 lg:min-h-[360px] print:min-h-0',
    label: 'text-sm font-semibold text-white/90',
    link: STRETCHED_ON_ACCENT,
    value: 'mt-4 sf-kpi-value text-[44px] lg:text-[56px] xl:text-[64px] leading-none font-extrabold tracking-[-0.03em] text-white print:text-[22pt]',
    valueEmpty: 'mt-4 sf-kpi-value text-[44px] lg:text-[56px] xl:text-[64px] leading-none font-extrabold tracking-[-0.03em] text-white/85 print:text-[22pt]',
    unit: 'ml-1.5 text-xl leading-none font-bold text-white/85',
    unitTight: 'ml-0.5 text-xl leading-none font-bold text-white/85',
    deltaRow: 'mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 min-h-[24px] lg:max-w-[60%] print:max-w-none',
    caption: 'text-xs font-medium text-white/85',
    sub: 'mt-1.5 min-h-[16px] lg:max-w-[60%] text-xs font-medium text-white/85 print:max-w-none',
    foot: 'mt-auto pt-6',
  },
};

// Stat tile: label · value · signed change against a named period · optional trend.
//   label, value    value is a number (formatted with `format`), a ready string, or null ("—" + "no data")
//   valueText       ready text instead of a number ("1 of 6", ranges, words); the tile then spans 2 columns on phones
//   format          any fmt key ('int', 'eur', 'eurUnit', 'pct', 'sec', 'credits' …)
//   unit            extra word after the number
//   sub             one quiet line under the change (at most one number)
//   delta           makeDelta result; null = "Nothing to compare with"; undefined = the tile has no comparison
//   compareLabel    'the previous 30 days' (accessible name of the delta)
//   goodWhen        'up' | 'down' | 'none' (grey delta, volume totals)
//   badge           basis of the value: 'estimate' | 'inferred' | 'missing' | 'model' (nothing for 'exact');
//                   next to the label from 640 px, in the change row on phones (a half-width tile keeps its label)
//   spark           number[] for the sparkline (pass [] while loading to keep its space)
//   meter           0–1 thin meter instead of the sparkline
//   foot            any node for the foot slot instead of spark / meter (e.g. a ShareBar); it sits above the
//                   tile's link, so its own tooltips stay reachable
//   hintKey         copy key of the (i) (DEFS: short, long); hintValues fills its template
//   to              route; makes the whole tile a link
//   variant         'default' | 'hero' (the one gradient tile of Overview)
//   wide            money or text value: col-span-2 on phones (§3.2); defaults to true for eur/text values
//   firstLoad       true while the first data load runs: "—" in the final layout, no jump afterwards
export default function KpiTile({
  label,
  value,
  valueText,
  format = 'int',
  unit,
  sub,
  delta,
  compareLabel,
  goodWhen = 'up',
  badge,
  spark,
  meter,
  foot,
  hintKey,
  hintValues,
  to,
  variant = 'default',
  wide,
  firstLoad = false,
  className = '',
}) {
  const hero = variant === 'hero';
  const styles = hero ? STYLES.hero : STYLES.default;
  const { printing } = usePrintMode();
  const reduced = useReducedMotion();

  const hasText = typeof valueText === 'string' && valueText !== '';
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const missing = !firstLoad && !hasText && (value == null || value === '' || (typeof value === 'number' && !numeric));
  const counter = useCountUp(numeric && !firstLoad && !hasText ? value : null, { enabled: !reduced && !printing });

  const showValue = !firstLoad && !missing;
  const shown = counter.running ? counter.value : value;
  const parts = showValue ? (hasText ? [{ num: valueText, unit: '' }] : fmt.parts(shown, format, value)) : [];
  const finalText = showValue ? [hasText ? valueText : fmt.value(value, format), unit].filter(Boolean).join(' ') : null;

  let caption = null;
  if (!firstLoad) {
    if (missing) caption = t('common.tile.noData');
    else if (delta === null) caption = t('common.noCompare');
  }

  const spansTwo = wide ?? (hasText || ['eur', 'eurSigned', 'eurUnit', 'text'].includes(format));
  const hasFoot = foot !== undefined && foot !== null;
  const hasMeter = !hasFoot && meter !== undefined;
  const hasSpark = !hasFoot && !hasMeter && spark !== undefined;
  const sparkHeight = hero ? 88 : 36;
  const labelText = typeof label === 'string' ? label : undefined;

  return (
    <Card
      variant={hero ? 'accent' : 'default'}
      padding={styles.padding}
      interactive={!hero}
      className={[styles.card, !hero && spansTwo ? 'col-span-2 sm:col-span-1' : '', className].filter(Boolean).join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        {to ? (
          <Link to={to} className={`${styles.label} ${styles.link}`}>
            {label}
          </Link>
        ) : (
          <p className={styles.label}>{label}</p>
        )}
        <span className="relative z-[1] shrink-0 flex items-center gap-2 print:hidden">
          {!hero && badge && <SourceBadge basis={badge} className="max-sm:hidden" />}
          {hintKey && <InfoHint hintKey={hintKey} values={hintValues} label={labelText} tone={hero ? 'onAccent' : 'default'} />}
        </span>
      </div>

      {showValue ? (
        <p className={counter.running ? `${styles.value} tabular-nums` : styles.value}>
          <span aria-hidden="true">
            {parts.map((part, index) => (
              <React.Fragment key={`${index}-${part.unit}`}>
                {index > 0 && ' '}
                {part.num}
                {part.unit && <span className={part.unit === '%' ? styles.unitTight : styles.unit}>{part.unit}</span>}
              </React.Fragment>
            ))}
            {unit && <span className={styles.unit}>{unit}</span>}
          </span>
          <span className="sr-only">{finalText}</span>
        </p>
      ) : (
        <p className={styles.valueEmpty}>
          <span aria-hidden="true">{fmt.empty}</span>
          <span className="sr-only">{firstLoad ? t('common.tile.loading') : t('common.tile.noValue')}</span>
        </p>
      )}

      <div className={styles.deltaRow}>
        {!firstLoad && !missing && delta && (
          <Delta delta={delta} goodWhen={goodWhen} onAccent={hero} compareLabel={compareLabel} />
        )}
        {caption && <span className={styles.caption}>{caption}</span>}
        {hero && badge && <SourceBadge basis={badge} onAccent />}
        {!hero && badge && <SourceBadge basis={badge} className="sm:hidden" />}
      </div>

      <p className={styles.sub} title={typeof sub === 'string' ? sub : undefined}>
        {firstLoad ? null : sub}
      </p>

      {hasFoot && <div className={`${styles.foot} relative z-[1]`}>{firstLoad ? null : foot}</div>}
      {hasMeter && (
        <div className={styles.foot}>
          {firstLoad || missing ? <div className="h-1.5" /> : <Meter value={meter} size="sm" ariaLabel={labelText} />}
        </div>
      )}
      {hasSpark && (
        <div className={`${styles.foot} print:hidden`}>
          {firstLoad ? (
            <div style={{ height: sparkHeight }} />
          ) : (
            <Sparkline data={spark} height={sparkHeight} tone={hero ? 'onAccent' : 'default'} area={hero} />
          )}
        </div>
      )}
    </Card>
  );
}
