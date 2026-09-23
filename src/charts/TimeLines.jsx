import React, { useContext, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisFormat, chart, bucketLabels, CHART_FRAME_CLASS, COLORS } from './theme.js';
import ChartTooltip from './ChartTooltip.jsx';
import { bucketAxisProps } from './patterns.jsx';
import { usePrintMode } from '../context/usePrintMode.js';
import useIsPhone from '../context/useIsPhone.js';
import useReducedMotion from '../ui/useReducedMotion.js';
import { ChartFrameContext } from '../ui/ChartCard.jsx';
import useTapTooltip from './useTapTooltip.js';

const FRAME_CLASS = `w-full min-w-0 print:h-auto! ${CHART_FRAME_CLASS}`;
const TONE = { attention: COLORS.warn, bad: COLORS.bad, neutral: COLORS['ink-mute'] };

// Lines over time buckets (latency p50 / 9 of 10, form size per month …).
//   rows            SeriesRow[] (null = a gap: too few events in that bucket, or a future bucket)
//   series          [{ key, label, color, dash? }] — identity colours; the legend is ChartCard's
//   format          fmt key or function for axis and tooltip
//   referenceLines  [{ y, label, tone: 'attention'|'bad'|'neutral' }] (e.g. 15 s and 25 s)
//   bands           [{ fromKey, toKey, label }] shaded in line/30 (a setup era, a test day)
//   yFloor          the axis top is at least this value
export default function TimeLines({ rows = [], series = [], format = 'int', referenceLines = [], bands = [], yFloor = 0, height, ariaLabel, footer }) {
  const frame = useContext(ChartFrameContext);
  const tap = useTapTooltip();
  const { printing } = usePrintMode();
  const reduced = useReducedMotion();
  const isPhone = useIsPhone();
  const [first, setFirst] = useState(true);
  const boxHeight = height ?? frame?.height ?? 320;

  const data = useMemo(() => {
    const labels = bucketLabels(rows);
    return rows.map((row, index) => {
      const datum = { bucket: row.key ?? String(index), label: labels[index].label, tipTitle: labels[index].title, isPartial: Boolean(row.isPartial) && !row.isFuture, row };
      series.forEach((s) => {
        datum[s.key] = row.isFuture || !Number.isFinite(row[s.key]) ? null : row[s.key];
      });
      return datum;
    });
  }, [rows, series]);

  const { margin, ...axis } = useMemo(() => bucketAxisProps(data, chart.margin), [data]);
  const max = Math.max(yFloor, ...referenceLines.map((line) => line.y), ...data.flatMap((d) => series.map((s) => d[s.key] ?? 0)));
  const integer = format === 'int';
  const scale = chart.yScale(max, yFloor || 4, integer);
  const tickFormat = axisFormat(format);
  const labelOf = (key) => data.find((d) => d.bucket === key)?.label;

  return (
    <div ref={tap.frameRef} className={FRAME_CLASS} style={{ height: boxHeight }}>
      <ResponsiveContainer {...chart.container(boxHeight)}>
        <LineChart {...tap.chartProps} data={data} margin={margin} aria-label={ariaLabel ?? frame?.title}>
          <CartesianGrid {...chart.grid} />
          <XAxis {...chart.xAxis} {...axis} />
          <YAxis {...chart.yAxis} allowDecimals={!integer} width={isPhone ? chart.yAxisPhoneWidth : chart.yAxis.width} tick={chart.tick} tickFormatter={tickFormat} domain={scale.domain} ticks={scale.ticks} />
          {bands.map((band) => (
            <ReferenceArea key={`${band.fromKey}-${band.toKey}`} x1={labelOf(band.fromKey)} x2={labelOf(band.toKey)} fill={COLORS.line} fillOpacity={0.3} ifOverflow="hidden" />
          ))}
          {referenceLines.map((line) => (
            <ReferenceLine key={line.y} y={line.y} stroke={TONE[line.tone] ?? TONE.neutral} strokeDasharray="4 4" label={isPhone ? undefined : { value: line.label, position: 'insideTopRight', fill: COLORS['ink-soft'], fontSize: 12, fontWeight: 600 }} />
          ))}
          <Tooltip {...chart.tooltip} {...tap.tooltipProps} cursor={{ stroke: COLORS.line }} content={<ChartTooltip multi={series.length > 1} valueFormat={format} footer={footer} unit={series.length === 1 ? series[0].label : undefined} />} />
          {series.map((s, index) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dash ? '5 4' : undefined}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: COLORS.surface }}
              connectNulls={false}
              {...chart.anim(first, reduced, printing)}
              onAnimationEnd={index === series.length - 1 ? () => setFirst(false) : undefined}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
