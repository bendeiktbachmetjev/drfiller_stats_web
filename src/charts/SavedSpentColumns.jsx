import React, { useContext, useMemo, useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chart, bucketLabels, CHART_FRAME_CLASS, COLORS, SERIES } from './theme.js';
import { TooltipBox } from './ChartTooltip.jsx';
import { HatchDefs, bucketAxisProps, hatchFill } from './patterns.jsx';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import { usePrintMode } from '../context/usePrintMode.js';
import useIsPhone from '../context/useIsPhone.js';
import useReducedMotion from '../ui/useReducedMotion.js';
import { ChartFrameContext } from '../ui/ChartCard.jsx';
import useTapTooltip from './useTapTooltip.js';

const FRAME_CLASS = `w-full min-w-0 print:h-auto! ${CHART_FRAME_CLASS}`;
// The axis switches to hours once a column reaches 10 hours (600 minutes)
const HOURS_FROM_MIN = 600;
const BY_HAND = COLORS.brand;
const SPENT = SERIES.cost;
const SAVED = SERIES.result;

/** "1 h 15 min" for minutes (the tooltip and the table: exact, the sign kept). */
const durationOf = (min) => (Number.isFinite(min) ? `${min < 0 ? '−' : ''}${fmt.duration(Math.abs(min) * 60000)}` : fmt.empty);

function SavedSpentTooltip({ active, payload, labels }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const d = payload[0].payload || {};
  if (d.byHandMin === null) return null;
  const rows = [
    { key: 'hand', value: durationOf(d.byHandMin), name: labels.byHand, color: BY_HAND },
    { key: 'spent', value: durationOf(-d.spentMin), name: labels.spent, color: SPENT },
    { key: 'saved', value: durationOf(d.savedMin), name: labels.saved, color: SAVED },
  ];
  return <TooltipBox title={d.tipTitle} rows={rows} footer={d.isPartial ? [t('common.chart.partialTip')] : []} dots />;
}

// Time per day, week or month of the Work and time view (spec v1 §10, design §5.1): how long the work would take
// by hand above zero, how long it took with Dr. Filler below zero (one column), and the time saved (the first
// minus the second, after the day rules) as an ink line with dots. Colour never carries the meaning alone: the
// spent part sits below zero and the tooltip writes it with "−".
//   rows    dailyRows(work, period) from data/clinics/work.js: [{ key, granularity, isPartial, isFuture,
//           savedMin, spentMin, spentNeg, byHandMin }]
//   labels  { byHand, spent, saved } series names (page copy)
export default function SavedSpentColumns({ rows = [], labels, height, ariaLabel }) {
  const frame = useContext(ChartFrameContext);
  const tap = useTapTooltip();
  const { printing } = usePrintMode();
  const reduced = useReducedMotion();
  const isPhone = useIsPhone();
  const [first, setFirst] = useState(true);
  const boxHeight = height ?? frame?.height ?? 320;

  const { data, inHours } = useMemo(() => {
    const names = bucketLabels(rows);
    const maxAbs = Math.max(0, ...rows.flatMap((row) => [Math.abs(row.byHandMin ?? 0), Math.abs(row.spentMin ?? 0), Math.abs(row.savedMin ?? 0)]));
    const hours = maxAbs >= HOURS_FROM_MIN;
    const scale = (min) => (Number.isFinite(min) ? (hours ? min / 60 : min) : null);
    return {
      inHours: hours,
      data: rows.map((row, index) => ({
        bucket: row.key ?? String(index),
        label: names[index].label,
        tipTitle: names[index].title,
        isPartial: Boolean(row.isPartial) && !row.isFuture,
        // A day whose work took longer with Dr. Filler than by hand has no column above zero
        hand: row.isFuture ? null : scale(Math.max(0, row.byHandMin ?? 0)),
        spent: row.isFuture ? null : scale(row.spentNeg ?? 0),
        saved: row.isFuture ? null : scale(row.savedMin ?? 0),
        byHandMin: row.isFuture ? null : row.byHandMin,
        spentMin: row.spentMin,
        savedMin: row.savedMin,
      })),
    };
  }, [rows]);

  const { margin, ...axis } = useMemo(() => bucketAxisProps(data, chart.margin), [data]);
  const values = data.flatMap((d) => [d.hand ?? 0, d.spent ?? 0, d.saved ?? 0]);
  const scale = chart.signedScale(Math.min(...values), Math.max(...values));
  const unit = inHours ? t('common.unit.hour') : t('common.unit.min');
  // A small period steps in half minutes: one decimal there, so two ticks never read the same
  const tickFormat = (v) => `${Number.isInteger(v) ? fmt.int(v) : fmt.dec(v)} ${unit}`.replace(/^-/, '−');
  const anim = chart.anim(first, reduced, printing);

  return (
    <div ref={tap.frameRef} className={FRAME_CLASS} style={{ height: boxHeight }}>
      <ResponsiveContainer {...chart.container(boxHeight)}>
        <ComposedChart {...tap.chartProps} data={data} margin={margin} barCategoryGap="24%" stackOffset="sign" aria-label={ariaLabel ?? frame?.title}>
          <HatchDefs colors={[BY_HAND, SPENT]} />
          <CartesianGrid {...chart.grid} />
          <XAxis {...chart.xAxis} {...axis} />
          <YAxis {...chart.yAxis} allowDecimals width={chart.yAxisWidth(scale.ticks, tickFormat, isPhone)} tick={chart.tick} tickFormatter={tickFormat} domain={scale.domain} ticks={scale.ticks} />
          <ReferenceLine y={0} stroke={COLORS['ink-mute']} />
          <Tooltip {...chart.tooltip} {...tap.tooltipProps} content={<SavedSpentTooltip labels={labels} />} />
          <Bar dataKey="hand" stackId="time" name={labels.byHand} fill={BY_HAND} radius={chart.bar.radius} maxBarSize={chart.bar.maxBarSize} {...anim}>
            {data.map((d) => (
              <Cell key={d.bucket} fill={d.isPartial ? hatchFill(BY_HAND) : BY_HAND} />
            ))}
          </Bar>
          <Bar dataKey="spent" stackId="time" name={labels.spent} fill={SPENT} radius={[0, 0, 4, 4]} maxBarSize={chart.bar.maxBarSize} {...anim} onAnimationEnd={() => setFirst(false)}>
            {data.map((d) => (
              <Cell key={d.bucket} fill={d.isPartial ? hatchFill(SPENT) : SPENT} />
            ))}
          </Bar>
          <Line dataKey="saved" stroke={COLORS.surface} strokeWidth={5} dot={false} activeDot={false} isAnimationActive={false} legendType="none" tooltipType="none" connectNulls={false} />
          <Line dataKey="saved" name={labels.saved} stroke={SAVED} strokeWidth={2} dot={{ r: 2.5, fill: SAVED, strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
