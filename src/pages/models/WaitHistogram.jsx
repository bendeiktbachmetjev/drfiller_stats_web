import React, { useContext, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisFormat, chart, CHART_FRAME_CLASS, COLORS } from '../../charts/theme.js';
import ChartTooltip from '../../charts/ChartTooltip.jsx';
import useTapTooltip from '../../charts/useTapTooltip.js';
import { ChartFrameContext } from '../../ui/index.js';
import { usePrintMode } from '../../context/usePrintMode.js';
import useIsPhone from '../../context/useIsPhone.js';
import useReducedMotion from '../../ui/useReducedMotion.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { waitLabel } from './text.js';

const FRAME_CLASS = `w-full min-w-0 print:h-auto! ${CHART_FRAME_CLASS}`;

/**
 * Columns over fixed wait buckets (§4.6 "How long doctors waited"): a category axis, not time.
 * Bars under 15 s are `brand`, from 15 s `warn`; the 25–30 s bar carries the word "backup" in `ink`.
 * Promote to ui/ if another page needs a category histogram (TimeColumns has one colour per chart).
 *   rows  tables.waitHist: [{ key, fromMs, toMs, count, fallback, slow, fallbackBar }]
 */
export default function WaitHistogram({ rows = [], height }) {
  const frame = useContext(ChartFrameContext);
  const tap = useTapTooltip();
  const { printing } = usePrintMode();
  const reduced = useReducedMotion();
  const isPhone = useIsPhone();
  const [first, setFirst] = useState(true);
  const boxHeight = height ?? frame?.height ?? 320;

  const data = useMemo(
    () =>
      rows.map((row) => {
        const label = waitLabel(row);
        return { key: row.key, label, tipTitle: label, value: row.count, row };
      }),
    [rows],
  );
  const scale = useMemo(() => chart.yScale(Math.max(0, ...data.map((d) => d.value))), [data]);
  const markOf = (entry) => (entry?.payload?.row?.fallbackBar && entry.payload.value > 0 ? t('models.waitHist.fallbackMark') : undefined);
  const footer = (row) => (row.fallback > 0 ? t('models.waitHist.ofFallback', { n: fmt.int(row.fallback) }) : null);

  return (
    <div ref={tap.frameRef} className={FRAME_CLASS} style={{ height: boxHeight }}>
      <ResponsiveContainer {...chart.container(boxHeight)}>
        <BarChart
          {...tap.chartProps}
          data={data}
          // The last bucket label ("over 30 s") is wider than its column on phones: leave it room on the right.
          margin={{ ...chart.margin, top: 24, right: isPhone ? 24 : chart.margin.right }}
          barCategoryGap={chart.barCategoryGap}
          aria-label={frame?.title}
        >
          <CartesianGrid {...chart.grid} />
          <XAxis {...chart.xAxis} tick={chart.tick} interval={isPhone ? 1 : 0} />
          <YAxis {...chart.yAxis} width={chart.yAxisWidth(scale.ticks, axisFormat('int'), isPhone)} tick={chart.tick} tickFormatter={axisFormat('int')} domain={scale.domain} ticks={scale.ticks} />
          <Tooltip {...chart.tooltip} {...tap.tooltipProps} content={<ChartTooltip unit={t('models.waitHist.unit')} valueFormat="int" footer={footer} />} />
          <Bar dataKey="value" {...chart.bar} maxBarSize={40} {...chart.anim(first, reduced, printing)} onAnimationEnd={() => setFirst(false)}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.row.slow ? COLORS.warn : COLORS.brand} />
            ))}
            <LabelList {...chart.label} valueAccessor={markOf} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
