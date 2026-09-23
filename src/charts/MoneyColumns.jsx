import React, { useContext, useMemo, useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisFormat, chart, bucketLabels, CHART_FRAME_CLASS, COLORS, SERIES } from './theme.js';
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
const PART_KEYS = ['form', 'recording', 'anamnesis', 'fixed'];

function MoneyTooltip({ active, payload, partLabels = {} }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const datum = payload[0].payload || {};
  const rows = [];
  if (Number.isFinite(datum.income)) rows.push({ key: 'income', value: fmt.eur(datum.income), name: t('common.row.income'), color: SERIES.income });
  if (Number.isFinite(datum.cost)) {
    const usd = Number.isFinite(datum.row?.costUsd) ? ` (${fmt.usd(datum.row.costUsd)})` : '';
    rows.push({ key: 'cost', value: `${fmt.eur(datum.cost)}${usd}`, name: t('common.row.cost'), color: SERIES.cost });
  }
  if (Number.isFinite(datum.result)) rows.push({ key: 'result', value: fmt.eurSigned(datum.result), name: t('common.row.result'), color: SERIES.result });
  const parts = datum.row?.parts ?? {};
  const footer = PART_KEYS.filter((key) => parts[key] > 0).map((key) => `${partLabels[key] ?? key}: ${fmt.eur(parts[key])}`);
  if (datum.isPartial) footer.push(t('common.chart.partialTip'));
  return <TooltipBox title={datum.tipTitle} rows={rows} footer={footer} dots />;
}

/** px between the income and the cost column of one bucket. */
const BAR_GAP = 2;

// The latest result gets a direct label (desktop only, §3.12): the sign in colour (good "+" / bad "−"),
// the amount in ink, on a white halo. A profit is labelled 8 px above the taller column of its pair, so it
// never sits on the columns or the dot; a loss below its dot, where no column stands (columns never go below zero).
function ResultText({ x, y, value }) {
  const text = fmt.eurSigned(value);
  const sign = text.charAt(0);
  const signed = sign === '+' || sign === '−';
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={12} fontWeight={700} fill={COLORS.ink} stroke={COLORS.surface} strokeWidth={3} paintOrder="stroke">
      {signed && <tspan fill={sign === '+' ? COLORS.good : COLORS.bad}>{sign}</tspan>}
      <tspan>{signed ? text.slice(1) : text}</tspan>
    </text>
  );
}

/** Label of a loss, on the result line: below the dot. */
function lossLabel(lastIndex) {
  return function LossLabel({ x, y, value, index }) {
    if (index !== lastIndex || !(value < 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return <ResultText x={x} y={y + 18} value={value} />;
  };
}

/**
 * Label of a profit, on the taller column of the pair (`side` = 'income' | 'cost'); centred over both
 * columns (they stand `BAR_GAP` apart).
 */
function profitLabel(lastIndex, data, side) {
  return function ProfitLabel({ x, y, width, index }) {
    const d = data[index];
    if (index !== lastIndex || !d || !(d.result >= 0) || ![x, y, width].every(Number.isFinite)) return null;
    const incomeTaller = (d.income ?? 0) >= (d.cost ?? 0);
    if ((side === 'income') !== incomeTaller) return null;
    const centre = side === 'income' ? x + width + BAR_GAP / 2 : x - BAR_GAP / 2;
    return <ResultText x={centre} y={y - 8} value={d.result} />;
  };
}

// Money over time (§3.12, §5.3.5): income column (brand) │ ONE cost column (neutral `cost`), the result as
// an ink line with a 3 px white halo and a zero baseline. Cost parts appear only in the tooltip and the table twin.
//   rows        [{ key, granularity, isPartial, isFuture, income, cost, result, costUsd?, parts: { form, recording, anamnesis, fixed } }]
//               at moneyGranularity(period)
//   showIncome  false hides the income column (and the result line) — e.g. Stripe off
//   partLabels  { form, recording, anamnesis, fixed } tooltip names of the cost parts (page copy)
export default function MoneyColumns({ rows = [], showIncome = true, partLabels, height, ariaLabel }) {
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
      bucket: row.key ?? String(index),
      label: labels[index].label,
      tipTitle: labels[index].title,
      isPartial: Boolean(row.isPartial) && !row.isFuture,
      income: showIncome && !row.isFuture && Number.isFinite(row.income) ? row.income : null,
      cost: !row.isFuture && Number.isFinite(row.cost) ? row.cost : null,
      result: showIncome && !row.isFuture && Number.isFinite(row.result) ? row.result : null,
      row,
    }));
  }, [rows, showIncome]);

  const { margin, ...axis } = useMemo(() => bucketAxisProps(data, chart.margin), [data]);
  const lastResultIndex = useMemo(() => data.reduce((last, d, index) => (d.result === null ? last : index), -1), [data]);
  const labels = useMemo(
    () => ({ loss: lossLabel(lastResultIndex), income: profitLabel(lastResultIndex, data, 'income'), cost: profitLabel(lastResultIndex, data, 'cost') }),
    [lastResultIndex, data],
  );
  const directLabels = showIncome && !isPhone;
  const values = data.flatMap((d) => [d.income ?? 0, d.cost ?? 0, d.result ?? 0]);
  const scale = chart.signedScale(Math.min(...values), Math.max(...values));
  const tickFormat = axisFormat('eur');

  return (
    <div ref={tap.frameRef} className={FRAME_CLASS} style={{ height: boxHeight }}>
      <ResponsiveContainer {...chart.container(boxHeight)}>
        <ComposedChart {...tap.chartProps} data={data} margin={margin} barCategoryGap="24%" barGap={BAR_GAP} aria-label={ariaLabel ?? frame?.title}>
          <HatchDefs colors={[SERIES.income, SERIES.cost]} />
          <CartesianGrid {...chart.grid} />
          <XAxis {...chart.xAxis} {...axis} />
          <YAxis {...chart.yAxis} allowDecimals width={chart.yAxisWidth(scale.ticks, tickFormat, isPhone)} tick={chart.tick} tickFormatter={tickFormat} domain={scale.domain} ticks={scale.ticks} />
          <ReferenceLine y={0} stroke={COLORS['ink-mute']} />
          <Tooltip {...chart.tooltip} {...tap.tooltipProps} content={<MoneyTooltip partLabels={partLabels} />} />
          {showIncome && (
            <Bar dataKey="income" name={t('common.row.income')} fill={SERIES.income} radius={chart.bar.radius} maxBarSize={chart.bar.maxBarSize} {...chart.anim(first, reduced, printing)}>
              {data.map((d) => (
                <Cell key={d.bucket} fill={d.isPartial ? hatchFill(SERIES.income) : SERIES.income} />
              ))}
              {directLabels && <LabelList dataKey="income" content={labels.income} />}
            </Bar>
          )}
          <Bar dataKey="cost" name={t('common.row.cost')} fill={SERIES.cost} radius={chart.bar.radius} maxBarSize={chart.bar.maxBarSize} {...chart.anim(first, reduced, printing)} onAnimationEnd={() => setFirst(false)}>
            {data.map((d) => (
              <Cell key={d.bucket} fill={d.isPartial ? hatchFill(SERIES.cost) : SERIES.cost} />
            ))}
            {directLabels && <LabelList dataKey="cost" content={labels.cost} />}
          </Bar>
          {showIncome && <Line dataKey="result" stroke={COLORS.surface} strokeWidth={5} dot={false} activeDot={false} isAnimationActive={false} legendType="none" tooltipType="none" connectNulls={false} />}
          {showIncome && (
            <Line dataKey="result" name={t('common.row.result')} stroke={SERIES.result} strokeWidth={2} dot={{ r: 2.5, fill: SERIES.result, strokeWidth: 0 }} isAnimationActive={false} connectNulls={false}>
              {directLabels && <LabelList dataKey="result" content={labels.loss} />}
            </Line>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
