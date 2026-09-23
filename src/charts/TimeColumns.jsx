import React, { useContext, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisFormat, chart, bucketLabels, CHART_FRAME_CLASS, COLORS } from './theme.js';
import ChartTooltip from './ChartTooltip.jsx';
import { HatchDefs, bucketAxisProps, hatchFill } from './patterns.jsx';
import { fmt } from '../format/format.js';
import { usePrintMode } from '../context/usePrintMode.js';
import useIsPhone from '../context/useIsPhone.js';
import useReducedMotion from '../ui/useReducedMotion.js';
import { ChartFrameContext } from '../ui/ChartCard.jsx';
import useTapTooltip from './useTapTooltip.js';

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
//   muteColor   when set, only rows with `highlight: true` get `color`; the others are muted context in this
//               colour (the months of the period among all months)
// The partial bucket is hatched (§3.12); a future bucket stays an empty slot; no direct labels on phones.
export default function TimeColumns({ rows = [], valueKey = 'value', color = COLORS.brand, muteColor, unit, valueFormat = 'int', footer, height, ariaLabel }) {
  const frame = useContext(ChartFrameContext);
  const tap = useTapTooltip();
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
      fill: muteColor && !row.highlight ? muteColor : color,
      row,
    }));
  }, [rows, valueKey, color, muteColor]);

  const { margin, ...axis } = useMemo(() => bucketAxisProps(data, chart.margin), [data]);
  const money = chart.isMoney(valueFormat);
  const scale = useMemo(() => chart.yScale(Math.max(0, ...data.map((d) => d.value ?? 0)), money ? 0 : 4, !money), [data, money]);

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

  // The hovered column dims a little but keeps its hatch when it is the running bucket.
  const fillOf = (d) => (d?.isPartial ? hatchFill(d.fill) : d?.fill ?? color);
  const activeBar = (props) => <Rectangle {...props} fill={fillOf(props.payload)} fillOpacity={0.85} />;

  const labelOf = (entry) => {
    const datum = entry?.payload;
    return datum && labelled.has(datum.index) ? fmt.value(datum.value, valueFormat) : undefined;
  };
  const tickFormat = axisFormat(valueFormat);

  return (
    <div ref={tap.frameRef} className={FRAME_CLASS} style={{ height: boxHeight }}>
      <ResponsiveContainer {...chart.container(boxHeight)}>
        <BarChart {...tap.chartProps} data={data} margin={margin} barCategoryGap={chart.barCategoryGap} aria-label={ariaLabel ?? frame?.title}>
          <HatchDefs colors={muteColor ? [color, muteColor] : [color]} />
          <CartesianGrid {...chart.grid} />
          <XAxis {...chart.xAxis} {...axis} />
          <YAxis {...chart.yAxis} allowDecimals={money} width={chart.yAxisWidth(scale.ticks, tickFormat, isPhone)} tick={chart.tick} tickFormatter={tickFormat} domain={scale.domain} ticks={scale.ticks} />
          <Tooltip {...chart.tooltip} {...tap.tooltipProps} content={<ChartTooltip unit={unit} valueFormat={valueFormat} footer={footer} />} />
          <Bar dataKey="value" name={unit} fill={color} {...chart.bar} activeBar={activeBar} {...chart.anim(first, reduced, printing)} onAnimationEnd={() => setFirst(false)}>
            {data.map((d) => (
              <Cell key={d.bucket} fill={fillOf(d)} />
            ))}
            <LabelList {...chart.label} valueAccessor={labelOf} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
