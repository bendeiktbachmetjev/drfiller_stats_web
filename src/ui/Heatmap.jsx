import React, { useRef, useState } from 'react';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import useChartTooltip from '../charts/useChartTooltip.jsx';

const CELL =
  'h-10 rounded-[6px] flex items-center justify-center text-xs font-bold tabular-nums transition-shadow duration-150 hover:shadow-[inset_0_0_0_2px_var(--color-ink)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)]';

// One hue, stepped relative to the busiest cell (§5.3.4: ink on /10–/35, white on /90 and full).
// The printed number is always the true value.
const STEPS = [
  'bg-line/25',
  'bg-brand/10 text-ink',
  'bg-brand/20 text-ink',
  'bg-brand/35 text-ink',
  'bg-brand/90 text-white',
  'bg-brand text-white',
];

const SWATCH = 'w-4 h-2.5 rounded-[3px]';

const stepOf = (v, max) => {
  if (!(v > 0) || !(max > 0)) return 0;
  return Math.min(5, Math.max(1, Math.ceil((v / max) * 5)));
};

const MOVES = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

// Rows × columns grid of shaded cells (forms by weekday × hour).
//   rowLabels, colLabels  string[]
//   values                (number | null)[][] — values[row][col]; null = no data for that cell
//   format                fmt key or function for the number printed in a cell
//   cellLabel(r, c, v)    full accessible sentence for a cell; defaults to "Tue, 10:00: 12"
//   legendText            what the colour means
//   valueName             words after the value in the tooltip
//   transposed            phone mode (§3.2): rows and columns swap (hours down, weekdays across) and
//                         numbers show only on tap (tooltip); pass the desktop orientation, the grid flips itself
// Keyboard: the grid is one tab stop; arrow keys, Home and End move between cells.
export default function Heatmap({
  rowLabels: rowLabelsIn = [],
  colLabels: colLabelsIn = [],
  values: valuesIn = [],
  transposed = false,
  format = 'pct',
  cellLabel,
  legendText,
  valueName,
  ariaLabel,
  className = '',
}) {
  const rowLabels = transposed ? colLabelsIn : rowLabelsIn;
  const colLabels = transposed ? rowLabelsIn : colLabelsIn;
  const values = transposed ? colLabelsIn.map((_, c) => rowLabelsIn.map((__, r) => valuesIn[r]?.[c] ?? null)) : valuesIn;
  const [active, setActive] = useState([0, 0]);
  const gridRef = useRef(null);
  const tip = useChartTooltip();

  const rowCount = rowLabels.length;
  const colCount = colLabels.length;
  const valueAt = (r, c) => {
    const v = values[r]?.[c];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  let max = 0;
  for (let r = 0; r < rowCount; r += 1) {
    for (let c = 0; c < colCount; c += 1) max = Math.max(max, valueAt(r, c) ?? 0);
  }

  const activeRow = Math.min(active[0], Math.max(0, rowCount - 1));
  const activeCol = Math.min(active[1], Math.max(0, colCount - 1));

  const focusCell = (r, c) => {
    setActive([r, c]);
    gridRef.current?.querySelector(`[data-cell="${r}-${c}"]`)?.focus();
  };

  const onKeyDown = (event, r, c) => {
    let next = null;
    if (MOVES[event.key]) next = [r + MOVES[event.key][0], c + MOVES[event.key][1]];
    else if (event.key === 'Home') next = [r, 0];
    else if (event.key === 'End') next = [r, colCount - 1];
    if (!next) return;
    event.preventDefault();
    const [nr, nc] = next;
    if (nr < 0 || nr >= rowCount || nc < 0 || nc >= colCount) return;
    focusCell(nr, nc);
  };

  const describe = (r, c, v) => {
    if (typeof cellLabel === 'function') return cellLabel(r, c, v);
    return `${colLabels[c]}, ${rowLabels[r]}: ${v == null ? t('common.heat.noData') : fmt.value(v, format)}`;
  };

  return (
    <div className={className}>
      <div
        ref={gridRef}
        role="grid"
        aria-label={ariaLabel}
        aria-rowcount={rowCount + 1}
        aria-colcount={colCount + 1}
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `56px repeat(${Math.max(1, colCount)},minmax(0,1fr))` }}
      >
        <div role="row" className="contents">
          <div role="columnheader" aria-label={t('common.heat.time')} />
          {colLabels.map((label) => (
            <div key={label} role="columnheader" className="pb-1.5 text-center text-xs font-semibold text-ink-soft">
              {label}
            </div>
          ))}
        </div>

        {rowLabels.map((rowLabel, r) => (
          <div key={rowLabel} role="row" className="contents">
            <div role="rowheader" className="flex items-center text-xs font-semibold text-ink-soft tabular-nums">
              {rowLabel}
            </div>
            {colLabels.map((colLabel, c) => {
              const v = valueAt(r, c);
              const step = stepOf(v, max);
              return (
                <div
                  key={colLabel}
                  role="gridcell"
                  data-cell={`${r}-${c}`}
                  tabIndex={r === activeRow && c === activeCol ? 0 : -1}
                  aria-label={describe(r, c, v)}
                  className={`${CELL} ${STEPS[step]}`}
                  onKeyDown={(event) => onKeyDown(event, r, c)}
                  onClick={() => setActive([r, c])}
                  {...tip.bind({
                    title: `${colLabel} · ${rowLabel}`,
                    rows: [{ value: v == null ? t('common.noData') : fmt.value(v, format), name: v == null ? undefined : valueName }],
                  })}
                >
                  {step > 0 && !transposed ? fmt.value(v, format) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-ink-soft">
        <span>{t('common.heat.less')}</span>
        <span aria-hidden="true" className="flex items-center gap-0.5">
          {STEPS.slice(1).map((stepClass) => (
            <span key={stepClass} className={`${SWATCH} ${stepClass}`} />
          ))}
        </span>
        <span>{t('common.heat.more')}</span>
        {legendText && <span className="ml-1 font-medium">{legendText}</span>}
      </div>

      {tip.tooltip}
    </div>
  );
}
