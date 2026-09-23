import React, { useContext, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chart, bucketLabels, CHART_FRAME_CLASS, COLORS } from './theme.js';
import ChartTooltip from './ChartTooltip.jsx';
import { HatchDefs, hatchFill } from './patterns.jsx';
import { fmt } from '../format/format.js';
import { usePrintMode } from '../context/usePrintMode.js';
import useIsPhone from '../context/useIsPhone.js';
import useReducedMotion from '../ui/useReducedMotion.js';
import { ChartFrameContext } from '../ui/ChartCard.jsx';

const FRAME_CLASS = `w-full min-w-0 print:h-auto! ${CHART_FRAME_CLASS}`;

// With many narrow columns two neighbouring value labels would run into each other.
const DENSE_COLUMNS = 16;

// Single-series columns over time.
//   rows        SeriesRow[] from makeSeries: [{ key, granularity, isPartial, isFuture, value }] (or `valueKey`)
//   valueKey    field to draw (default 'value')
//   color       identity colour (charts/theme.js#SERIES; default brand)
//   unit        word shown after the value in the tooltip
//   valueFormat fmt key or function, used by the tooltip, the axis and the two direct labels
//   footer      (row) => string | string[] for the tooltip
//   height      px; inside a ChartCard it follows the card's plot box
// The partial bucket is hatched (§3.12); a future bucket stays an empty slot; no direct labels on phones.
export default function TimeColumns({ rows = [], valueKey = 'value', color = COLORS.brand, unit, valueFormat = 'int', footer, height, ariaLabel }) {
  const frame = useContext(ChartFrameContext);
  const { printing } = usePrintMode();
  const reduced = useReducedMotion();
  const isPhone = useIsPhone();
  const [first, setFirst] = useState(true);
  const boxHeight = height ?? frame?.height ?? 320;

  const data = useMemo(() => {
    const labels = bucketLabels(rows);
    return rows.map((row, index) => ({
      index,
      bucket: row.key ?? String(index),
      label: labels[index].label,
      tipTitle: labels[index].title,
      value: row.isFuture || !Number.isFinite(row[valueKey]) ? null : row[valueKey],
      isPartial: Boolean(row.isPartial) && !row.isFuture,
      row,
    }));
  }, [rows, valueKey]);

  const scale = useMemo(() => chart.yScale(Math.max(0, ...data.map((d) => d.value ?? 0))), [data]);

  // Direct labels stay sparing: the tallest column and the latest one that has a value.
  const labelled = useMemo(() => {
    const picked = new Set();
    if (isPhone) return picked;
    let tallest = -1;
    let latest = -1;
    data.forEach((d, index) => {
      if (!(d.value > 0)) return;
      if (tallest === -1 || d.value > data[tallest].value) tallest = index;
      latest = index;
    });
    if (tallest >= 0) picked.add(tallest);
    const collides = data.length > DENSE_COLUMNS && Math.abs(latest - tallest) === 1;
    if (latest >= 0 && !collides) picked.add(latest);
    return picked;
  }, [data, isPhone]);

  const labelOf = (entry) => {
    const datum = entry?.payload;
    return datum && labelled.has(datum.index) ? fmt.value(datum.value, valueFormat) : undefined;
  };
  const tickFormat = typeof valueFormat === 'string' && valueFormat !== 'int' ? (v) => fmt.value(v, valueFormat) : fmt.compact;

  return (
    <div className={FRAME_CLASS} style={{ height: boxHeight }}>
      <ResponsiveContainer {...chart.container(boxHeight)}>
        <BarChart data={data} margin={chart.margin} barCategoryGap={chart.barCategoryGap} aria-label={ariaLabel ?? frame?.title}>
          <HatchDefs colors={[color]} />
          <CartesianGrid {...chart.grid} />
          <XAxis {...chart.xAxis} tick={chart.tick} />
          <YAxis {...chart.yAxis} width={isPhone ? chart.yAxisPhoneWidth : chart.yAxis.width} tick={chart.tick} tickFormatter={tickFormat} domain={scale.domain} ticks={scale.ticks} />
          <Tooltip {...chart.tooltip} content={<ChartTooltip unit={unit} valueFormat={valueFormat} footer={footer} />} />
          <Bar dataKey="value" name={unit} fill={color} {...chart.bar} activeBar={{ fill: color, fillOpacity: 0.85 }} {...chart.anim(first, reduced, printing)} onAnimationEnd={() => setFirst(false)}>
            {data.map((d) => (
              <Cell key={d.bucket} fill={d.isPartial ? hatchFill(color) : color} />
            ))}
            <LabelList {...chart.label} valueAccessor={labelOf} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
