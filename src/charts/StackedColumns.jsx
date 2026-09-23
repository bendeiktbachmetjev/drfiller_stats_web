import React, { useContext, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisFormat, chart, bucketLabels, CHART_FRAME_CLASS } from './theme.js';
import { HatchDefs, bucketAxisProps, hatchFill } from './patterns.jsx';
import useIsPhone from '../context/useIsPhone.js';
import ChartTooltip from './ChartTooltip.jsx';
import { usePrintMode } from '../context/usePrintMode.js';
import useReducedMotion from '../ui/useReducedMotion.js';
import { ChartFrameContext } from '../ui/ChartCard.jsx';
import useTapTooltip from './useTapTooltip.js';
import Legend from '../ui/Legend.jsx';

// Screen: the plot takes what the legend leaves of the fixed height (an absolute box has a definite
// size for the ResponsiveContainer). Paper: normal flow, so the frame follows the scaled svg.
const FRAME_CLASS = 'flex flex-col w-full min-w-0 print:block print:h-auto!';
const PLOT_CLASS = `relative flex-1 min-h-0 ${CHART_FRAME_CLASS}`;
const PLOT_INNER_CLASS = 'absolute inset-0 print:static';

const SQUARE = [0, 0, 0, 0];

// Stacked columns over time for up to four series with fixed colours.
//   rows        [{ key, label, isPartial, isFuture, longLabel?, [series.key]: number | null }]
//   series      [{ key, label, color }] — drawn bottom to top in this order
//   unit, valueFormat, footer, height, ariaLabel — as in TimeColumns
//   legend      false hides the built-in legend (when the card already shows one)
// Segments are separated by a 2 px surface-coloured stroke; only the top segment of a column is rounded.
export default function StackedColumns({
  rows = [],
  series = [],
  unit,
  valueFormat = 'int',
  footer,
  height,
  ariaLabel,
  legend = true,
}) {
  const frame = useContext(ChartFrameContext);
  const tap = useTapTooltip();
  const { printing } = usePrintMode();
  const reduced = useReducedMotion();
  const [first, setFirst] = useState(true);
  const isPhone = useIsPhone();

  const boxHeight = height ?? frame?.height ?? 320;

  const data = useMemo(() => {
    const labels = bucketLabels(rows);
    return rows.map((row, index) => {
      const datum = {
        bucket: row.key ?? String(index),
        label: labels[index].label,
        isPartial: Boolean(row.isPartial) && !row.isFuture,
        tipTitle: labels[index].title,
        stackTotal: 0,
        stackTop: null,
        row,
      };
      series.forEach((s) => {
        const value = Number.isFinite(row[s.key]) ? row[s.key] : null;
        datum[s.key] = value;
        if (value > 0) {
          datum.stackTotal += value;
          datum.stackTop = s.key;
        }
      });
      return datum;
    });
  }, [rows, series]);

  const { margin, ...axis } = useMemo(() => bucketAxisProps(data, chart.margin), [data]);
  const money = chart.isMoney(valueFormat);
  const scale = useMemo(
    () => chart.yScale(Math.max(0, ...data.map((d) => d.stackTotal)), money ? 0 : 4, !money),
    [data, money]
  );
  const tickFormat = axisFormat(valueFormat);

  // Which segment ends a column differs from column to column, so the radius is decided per datum.
  const shapes = useMemo(
    () =>
      Object.fromEntries(
        series.map((s) => [
          s.key,
          (props) => (
            <Rectangle
              {...props}
              fill={props.payload?.isPartial ? hatchFill(s.color) : s.color}
              radius={props.payload?.stackTop === s.key ? chart.bar.radius : SQUARE}
            />
          ),
        ])
      ),
    [series]
  );

  const order = useMemo(() => new Map(series.map((s, index) => [s.key, index])), [series]);
  const legendItems = series.map((s) => ({ key: s.key, label: s.label, color: s.color, shape: 'rect' }));

  return (
    <div className={FRAME_CLASS} style={{ height: boxHeight }}>
      {legend && (
        <div className="shrink-0 mb-3">
          <Legend items={legendItems} />
        </div>
      )}
      <div ref={tap.frameRef} className={PLOT_CLASS}>
        <div className={PLOT_INNER_CLASS}>
          <ResponsiveContainer {...chart.container(boxHeight)}>
            <BarChart
              {...tap.chartProps}
              data={data}
              margin={margin}
              barCategoryGap={chart.barCategoryGap}
              aria-label={ariaLabel ?? frame?.title}
            >
              <HatchDefs colors={series.map((s) => s.color)} />
              <CartesianGrid {...chart.grid} />
              <XAxis {...chart.xAxis} {...axis} />
              <YAxis
                {...chart.yAxis}
                allowDecimals={money}
                width={chart.yAxisWidth(scale.ticks, tickFormat, isPhone)}
                tick={chart.tick}
                tickFormatter={tickFormat}
                domain={scale.domain}
                ticks={scale.ticks}
              />
              <Tooltip
                {...chart.tooltip}
                {...tap.tooltipProps}
                itemSorter={(item) => order.get(item.dataKey) ?? 0}
                content={<ChartTooltip multi unit={unit} valueFormat={valueFormat} footer={footer} />}
              />
              {series.map((s, index) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId="a"
                  fill={s.color}
                  stroke={chart.surface}
                  strokeWidth={2}
                  maxBarSize={chart.bar.maxBarSize}
                  shape={shapes[s.key]}
                  activeBar={false}
                  {...chart.anim(first, reduced, printing)}
                  onAnimationEnd={index === series.length - 1 ? () => setFirst(false) : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
