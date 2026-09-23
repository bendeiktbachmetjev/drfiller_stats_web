import React from 'react';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';

const BOX_CLASS = 'bg-ink text-white rounded-[12px] px-3.5 py-2.5 shadow-xl max-w-[280px] w-max';

// The dark tooltip box, shared by recharts charts (ChartTooltip) and HTML marks (useChartTooltip).
// Value first, name second: the reader already knows the series and wants the number.
// rows: [{ key?, value, name?, color? }] — the colour dot appears only when there are two or more rows
// (`dots` overrides that for a multi-series chart that shows one row). footer: a string or a list of strings.
export function TooltipBox({ title, rows = [], footer, dots }) {
  const showDots = dots ?? rows.length >= 2;
  const footerLines = (Array.isArray(footer) ? footer : [footer]).filter(Boolean);

  return (
    <div className={BOX_CLASS}>
      {title != null && title !== '' && <p className="text-xs font-medium text-white/85">{title}</p>}
      {rows.map((row, index) => (
        <p key={row.key ?? index} className="mt-1 flex items-baseline gap-2">
          {showDots && (
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-full ring-[1.5px] ring-white shrink-0 self-center"
              style={{ background: row.color }}
            />
          )}
          <span className="text-sm font-bold">{row.value}</span>
          {row.name != null && row.name !== '' && (
            <span className="text-xs font-medium text-white/85">{row.name}</span>
          )}
        </p>
      ))}
      {footerLines.map((line, index) => (
        <p key={`${index}-${line}`} className="mt-1.5 text-xs font-medium text-white/85">
          {line}
        </p>
      ))}
    </div>
  );
}

// `content` of a recharts <Tooltip>. recharts clones the element and adds active / payload / label.
//   unit        word after the value of a single series ("visits")
//   valueFormat fmt key or function
//   footer      (row) => string | string[] — `row` is the object the page passed in `rows`
//   multi       the chart has two or more series: rows carry a colour dot and zero rows are left out
// A future bucket has no values, so it shows no tooltip at all.
export default function ChartTooltip({ active, payload, label, unit, valueFormat = 'int', footer, multi = false }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;

  const datum = payload[0].payload || {};
  const nonZero = payload.filter((entry) => entry.value !== 0);
  const entries = multi && nonZero.length > 0 ? nonZero : payload;
  const rows = entries.map((entry) => ({
    key: String(entry.dataKey),
    value: fmt.value(entry.value, valueFormat),
    name: multi ? entry.name : unit,
    color: entry.color,
  }));

  const extra = typeof footer === 'function' ? footer(datum.row ?? datum) : footer;
  const footerLines = (Array.isArray(extra) ? extra : [extra]).filter(Boolean);
  if (datum.isPartial) footerLines.push(t('common.chart.partialTip'));

  return <TooltipBox title={datum.tipTitle ?? label} rows={rows} footer={footerLines} dots={multi} />;
}
