import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import { COLORS as TOKENS } from '../charts/theme.js';
import { usePrintMode } from '../context/usePrintMode.js';
import useChartTooltip from '../charts/useChartTooltip.jsx';
import Legend from './Legend.jsx';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

// Every row is a grid of its own (label · bar · value). Where the browser supports subgrid the rows
// share the columns of the list instead, so a long value text cannot shorten the bar track of its
// row — bars are only comparable when they all run on the same track.
const LIST_CLASS = 'grid grid-cols-[minmax(88px,140px)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(96px,220px)_minmax(0,1fr)_auto] gap-x-4';
const SUBGRID = 'col-span-3 supports-[grid-template-columns:subgrid]:grid-cols-subgrid';

const ROWS = {
  single: {
    shown:
      'group grid grid-cols-[minmax(88px,140px)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(96px,220px)_minmax(0,1fr)_auto] items-center gap-x-4 px-3 -mx-3 h-10 rounded-[12px] hover:bg-line/15 transition-colors',
    hidden:
      'group hidden print:grid grid-cols-[minmax(88px,140px)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(96px,220px)_minmax(0,1fr)_auto] items-center gap-x-4 px-3 -mx-3 h-10 rounded-[12px]',
  },
  compare: {
    shown:
      'group grid grid-cols-[minmax(88px,140px)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(96px,220px)_minmax(0,1fr)_auto] items-center gap-x-4 px-3 -mx-3 h-12 rounded-[12px] hover:bg-line/15 transition-colors',
    hidden:
      'group hidden print:grid grid-cols-[minmax(88px,140px)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(96px,220px)_minmax(0,1fr)_auto] items-center gap-x-4 px-3 -mx-3 h-12 rounded-[12px]',
  },
};

const LABEL = 'text-sm font-semibold text-ink truncate';
const LABEL_MUTED = 'text-sm font-semibold text-ink-soft truncate';

const BAR =
  'relative h-2.5 min-w-[2px] rounded-r-[4px] bg-brand group-hover:bg-brand-strong transition-[width,background-color] duration-[400ms] ease-out motion-reduce:transition-none';
const BAR_MUTED =
  'relative h-2.5 min-w-[2px] rounded-r-[4px] bg-data-mute transition-[width,background-color] duration-[400ms] ease-out motion-reduce:transition-none';
const BAR_GHOST =
  'absolute inset-y-0 left-0 rounded-r-[4px] bg-line transition-[width] duration-[400ms] ease-out motion-reduce:transition-none';
const BAR_ZERO = 'relative h-2.5 w-[2px] bg-line';

const PAIR_REFERENCE =
  'h-1.5 min-w-[2px] rounded-r-[3px] bg-data-mute transition-[width] duration-[400ms] ease-out motion-reduce:transition-none';
const PAIR_MAIN =
  'h-1.5 min-w-[2px] rounded-r-[3px] bg-brand group-hover:bg-brand-strong transition-[width,background-color] duration-[400ms] ease-out motion-reduce:transition-none';
const PAIR_ZERO = 'h-1.5 w-[2px] bg-line';

const COLORS = { main: TOKENS.brand, reference: TOKENS['data-mute'], ghost: TOKENS.line };
const DEFAULT_SERIES = {
  single: [{ key: 'ghost', label: '' }, { key: 'value', label: '' }],
  compare: [{ key: 'ghost', label: '' }, { key: 'value', label: '' }],
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const widthOf = (v, max) => `${max > 0 ? Math.min(100, (v / max) * 100) : 0}%`;
const shareOf = (v, total) => {
  if (!(total > 0) || v == null) return '';
  const share = (v / total) * 100;
  return share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`;
};

// Ranking as HTML bars (no chart library): label · bar · value.
//   items     [{ key, label, value, sub?, to?, muted?, ghost?, valueLabel?, color? }]
//             color = identity colour of the bar (charts/theme.js#SERIES), never by rank
//             ghost = reference number (planned, booked) drawn in gray; valueLabel replaces the value text
//   format    fmt key or function for the numbers
//   maxRows   rows shown before "Show all N" (the rest stays in the DOM for print)
//   variant   'single' — one bar (brand, or the item's identity colour), `ghost` drawn behind it at its own width,
//             value "9 of 11"
//             'compare' — two thin bars per row, reference (grey) over main (brand), value "3 h / 12 h",
//                         with its legend above the list
//   series    [{ key, label }, { key, label }] = [reference, main]: legend and tooltip names. A number is read
//             from item[key] when the item has that field, else from item.ghost / item.value.
//   showShare adds each row's share of the total
//   unit      word after the value in the tooltip ("forms")
// Bars share one scale (the largest value or ghost of ALL items), so hidden rows do not rescale the list.
export default function BarList({
  items = [],
  format = 'int',
  maxRows = 6,
  variant = 'single',
  series,
  showShare = false,
  emptyText,
  unit,
  className = '',
}) {
  const [expanded, setExpanded] = useState(false);
  const { printing } = usePrintMode();
  const tip = useChartTooltip();

  const compare = variant === 'compare';
  const rowClass = compare ? ROWS.compare : ROWS.single;
  const [referenceSeries, mainSeries] =
    Array.isArray(series) && series.length === 2 ? series : DEFAULT_SERIES[compare ? 'compare' : 'single'];

  if (!Array.isArray(items) || items.length === 0) {
    return <p className="py-6 text-sm font-medium text-ink-mute">{emptyText ?? t('common.list.empty')}</p>;
  }

  const rows = items.map((item) => ({
    item,
    main: num(item[mainSeries.key] ?? item.value),
    reference: num(item[referenceSeries.key] ?? item.ghost),
  }));
  const max = Math.max(0, ...rows.flatMap((row) => [row.main ?? 0, row.reference ?? 0]));
  const total = rows.reduce((sum, row) => sum + (row.main ?? 0), 0);
  const text = (v) => fmt.value(v, format);

  const collapsible = items.length > maxRows;
  const showAll = expanded || printing || !collapsible;

  const tooltipOf = ({ item, main, reference }) => () => {
    const share = showShare ? shareOf(main, total) : '';
    const footer = [item.sub, share && t('common.list.shareOfTotal', { share })];
    if (reference == null) {
      return { title: item.label, rows: [{ value: item.valueLabel ?? text(main), name: unit }], footer };
    }
    return {
      title: item.label,
      rows: [
        { key: 'main', value: text(main), name: mainSeries.label || unit, color: item.muted ? COLORS.reference : item.color ?? COLORS.main },
        { key: 'reference', value: text(reference), name: referenceSeries.label, color: compare ? COLORS.reference : COLORS.ghost },
      ],
      footer,
    };
  };

  const renderBars = ({ item, main, reference }) => {
    if (compare) {
      return (
        <div className="flex flex-col gap-0.5">
          {reference > 0 ? <div className={PAIR_REFERENCE} style={{ width: widthOf(reference, max) }} /> : <div className={PAIR_ZERO} />}
          {main > 0 ? <div className={PAIR_MAIN} style={{ width: widthOf(main, max) }} /> : <div className={PAIR_ZERO} />}
        </div>
      );
    }
    return (
      <div className="relative h-2.5">
        {reference > 0 && <div className={BAR_GHOST} style={{ width: widthOf(reference, max) }} />}
        {main > 0 ? (
          <div className={item.muted ? BAR_MUTED : BAR} style={{ width: widthOf(main, max), ...(item.color && !item.muted ? { background: item.color } : null) }} />
        ) : (
          <div className={BAR_ZERO} />
        )}
      </div>
    );
  };

  const valueTextOf = ({ item, main, reference }) => {
    if (compare) return `${text(main)} / ${text(reference)}`;
    return item.valueLabel ?? (reference != null ? t('common.unit.of', { n: text(main), total: text(reference) }) : text(main));
  };
  // One width for every value, so the numbers form a right-aligned column whatever follows them.
  const valueWidth = `${Math.max(...rows.map((row) => String(valueTextOf(row)).length))}ch`;

  const renderValue = (row) => {
    if (compare) {
      return (
        <span className="text-sm text-right tabular-nums whitespace-nowrap" style={{ minWidth: valueWidth }}>
          <span className="font-bold text-ink">{text(row.main)}</span>
          <span className="font-medium text-ink-soft"> / {text(row.reference)}</span>
        </span>
      );
    }
    return (
      <span className="text-sm font-bold text-ink tabular-nums text-right whitespace-nowrap" style={{ minWidth: valueWidth }}>
        {valueTextOf(row)}
      </span>
    );
  };

  return (
    <div className={className}>
      {compare && (
        <Legend
          className="mb-3"
          items={[
            { key: 'reference', label: referenceSeries.label, color: COLORS.reference, shape: 'rect' },
            { key: 'main', label: mainSeries.label, color: COLORS.main, shape: 'rect' },
          ]}
        />
      )}

      <ul role="list" className={LIST_CLASS}>
        {rows.map((row, index) => {
          const { item } = row;
          const visible = showAll || index < maxRows;
          const classes = `${visible ? rowClass.shown : rowClass.hidden} ${SUBGRID}`;
          const cells = (
            <>
              <span className={item.muted ? LABEL_MUTED : LABEL}>{item.label}</span>
              {renderBars(row)}
              <span className="flex items-baseline">
                {renderValue(row)}
                {item.sub && (
                  <span className="hidden sm:inline ml-2 text-xs font-medium text-ink-soft whitespace-nowrap">
                    {item.sub}
                  </span>
                )}
                {showShare && (
                  <span className="ml-auto pl-2 w-10 box-content text-right text-xs font-medium text-ink-soft tabular-nums">
                    {shareOf(row.main, total)}
                  </span>
                )}
              </span>
            </>
          );

          return (
            <li key={item.key ?? item.label} className="contents">
              {item.to ? (
                <Link to={item.to} className={`${classes} ${RING}`} {...tip.bind(tooltipOf(row))}>
                  {cells}
                </Link>
              ) : (
                <div className={classes} {...tip.bind(tooltipOf(row))}>
                  {cells}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {collapsible && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className={`mt-2 rounded-[6px] text-xs font-bold text-brand hover:text-brand-strong transition-colors ${RING}`}
        >
          {expanded ? t('common.list.showFewer') : t('common.list.showAll', { n: items.length })}
        </button>
      )}

      {tip.tooltip}
    </div>
  );
}
