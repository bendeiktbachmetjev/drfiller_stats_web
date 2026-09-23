import React from 'react';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import useChartTooltip from '../charts/useChartTooltip.jsx';
import Legend from './Legend.jsx';

const SEGMENT = 'first:rounded-l-full last:rounded-r-full min-w-[4px]';

const shareOf = (v, total) => {
  const share = (v / total) * 100;
  return share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`;
};

// One bar split into parts of a whole (at most five), with the numbers in a legend below.
//   items  [{ key, label, value, color }] — fixed order and fixed colours, never sorted by size
//   format fmt key or function for the values
// Parts are separated by a 2 px gap in the surface colour; a zero part keeps its legend entry.
export default function ShareBar({ items = [], format = 'int', className = '' }) {
  const tip = useChartTooltip();

  const parts = (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    value: typeof item.value === 'number' && Number.isFinite(item.value) && item.value > 0 ? item.value : 0,
  }));
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const describe = (part) => `${fmt.value(part.value, format)}${total > 0 ? ` · ${shareOf(part.value, total)}` : ''}`;
  const summary = parts.map((part) => `${part.label}: ${describe(part)}`).join(', ');

  return (
    <div className={className}>
      {total > 0 ? (
        <div role="img" aria-label={summary} className="flex h-3 gap-0.5">
          {parts
            .filter((part) => part.value > 0)
            .map((part) => (
              <div
                key={part.key ?? part.label}
                className={SEGMENT}
                style={{ flexGrow: part.value, flexBasis: 0, background: part.color }}
                {...tip.bind({
                  title: part.label,
                  rows: [{ value: fmt.value(part.value, format), name: t('common.list.shareOfTotal', { share: shareOf(part.value, total) }) }],
                })}
              />
            ))}
        </div>
      ) : (
        <div role="img" aria-label={t('common.noData')} className="h-3 rounded-full bg-line/25" />
      )}

      <Legend
        single
        className="mt-3"
        items={parts.map((part) => ({
          key: part.key ?? part.label,
          label: part.label,
          color: part.color,
          shape: 'rect',
          value: describe(part),
        }))}
      />

      {tip.tooltip}
    </div>
  );
}
