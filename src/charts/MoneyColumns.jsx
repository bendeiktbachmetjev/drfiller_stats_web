import React, { useContext, useMemo, useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chart, bucketLabels, CHART_FRAME_CLASS, COLORS, SERIES } from './theme.js';
import { TooltipBox } from './ChartTooltip.jsx';
import { HatchDefs, hatchFill } from './patterns.jsx';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import { usePrintMode } from '../context/usePrintMode.js';
import useIsPhone from '../context/useIsPhone.js';
import useReducedMotion from '../ui/useReducedMotion.js';
import { ChartFrameContext } from '../ui/ChartCard.jsx';

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

// Money over time (§3.12, §5.3.5): income column (brand) │ ONE cost column (neutral `cost`), the result as
// an ink line with a 3 px white halo and a zero baseline. Cost parts appear only in the tooltip and the table twin.
//   rows        [{ key, granularity, isPartial, isFuture, income, cost, result, costUsd?, parts: { form, recording, anamnesis, fixed } }]
//               at moneyGranularity(period)
//   showIncome  false hides the income column (and the result line) — e.g. Stripe off
//   partLabels  { form, recording, anamnesis, fixed } tooltip names of the cost parts (page copy)
export default function MoneyColumns({ rows = [], showIncome = true, partLabels, height, ariaLabel }) {
  const frame = useContext(ChartFrameContext);
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

  const values = data.flatMap((d) => [d.income ?? 0, d.cost ?? 0, d.result ?? 0]);
  const top = chart.niceMax(Math.max(0, ...values), 1, false);
  const low = Math.min(0, ...values);
  const bottom = low < 0 ? -chart.niceMax(-low, 1, false) : 0;
  const tickFormat = (v) => fmt.eur(v);

  return (
    <div className={FRAME_CLASS} style={{ height: boxHeight }}>
      <ResponsiveContainer {...chart.container(boxHeight)}>
        <ComposedChart data={data} margin={chart.margin} barCategoryGap="24%" barGap={2} aria-label={ariaLabel ?? frame?.title}>
          <HatchDefs colors={[SERIES.income, SERIES.cost]} />
          <CartesianGrid {...chart.grid} />
          <XAxis {...chart.xAxis} tick={chart.tick} />
          <YAxis {...chart.yAxis} allowDecimals width={isPhone ? chart.yAxisPhoneWidth + 16 : chart.yAxis.width + 16} tick={chart.tick} tickFormatter={tickFormat} domain={[bottom, top]} />
          <ReferenceLine y={0} stroke={COLORS['ink-mute']} />
          <Tooltip {...chart.tooltip} content={<MoneyTooltip partLabels={partLabels} />} />
          {showIncome && (
            <Bar dataKey="income" name={t('common.row.income')} fill={SERIES.income} radius={chart.bar.radius} maxBarSize={chart.bar.maxBarSize} {...chart.anim(first, reduced, printing)}>
              {data.map((d) => (
                <Cell key={d.bucket} fill={d.isPartial ? hatchFill(SERIES.income) : SERIES.income} />
              ))}
            </Bar>
          )}
          <Bar dataKey="cost" name={t('common.row.cost')} fill={SERIES.cost} radius={chart.bar.radius} maxBarSize={chart.bar.maxBarSize} {...chart.anim(first, reduced, printing)} onAnimationEnd={() => setFirst(false)}>
            {data.map((d) => (
              <Cell key={d.bucket} fill={d.isPartial ? hatchFill(SERIES.cost) : SERIES.cost} />
            ))}
          </Bar>
          {showIncome && <Line dataKey="result" stroke={COLORS.surface} strokeWidth={5} dot={false} activeDot={false} isAnimationActive={false} legendType="none" tooltipType="none" connectNulls={false} />}
          {showIncome && <Line dataKey="result" name={t('common.row.result')} stroke={SERIES.result} strokeWidth={2} dot={{ r: 2.5, fill: SERIES.result, strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
