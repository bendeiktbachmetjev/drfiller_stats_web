import React, { useMemo } from 'react';
import { CalendarClock, Grid3x3 } from 'lucide-react';
import { HEATMAP_HOURS, HEATMAP_MIN_FORMS } from '../../data/metrics/models.js';
import { EmptyState, Heatmap, SectionTitle } from '../../ui/index.js';
import useIsPhone from '../../context/useIsPhone.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import TableCard from './TableCard.jsx';
import { textOf, weekdayLong } from './text.js';

/** Phone hours (§3.2): 07–20. */
const PHONE_HOURS = Object.freeze({ from: 7, to: 20 });

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * The heatmap grid for a screen: rows = weekdays, columns = hours 06–22 (desktop); on phones the weekend
 * is merged into "Sat–Sun" and the hours cut to 07–20, and the Heatmap itself turns the grid around.
 * Pure (exported for the tests).
 * @param {Array<{ weekday: number, counts: number[] }>} rows tables.heatmap
 * @param {boolean} phone
 * @returns {{ rowLabels: string[], colLabels: string[], values: number[][], days: number[][] }}
 */
export function heatmapGrid(rows, phone) {
  const weekdays = t('common.weekdays.short').split('|');
  const hours = phone ? HEATMAP_HOURS.filter((h) => h >= PHONE_HOURS.from && h <= PHONE_HOURS.to) : HEATMAP_HOURS;
  const cols = hours.map((h) => HEATMAP_HOURS.indexOf(h));
  const pick = (row) => cols.map((c) => row.counts[c]);
  if (!phone) {
    return { rowLabels: rows.map((row) => weekdays[row.weekday - 1]), colLabels: hours.map(pad2), values: rows.map(pick), days: rows.map((row) => [row.weekday]) };
  }
  const weekdaysOnly = rows.filter((row) => row.weekday <= 5);
  const weekend = rows.filter((row) => row.weekday > 5);
  const merged = cols.map((_, i) => weekend.reduce((acc, row) => acc + pick(row)[i], 0));
  return {
    rowLabels: [...weekdaysOnly.map((row) => weekdays[row.weekday - 1]), t('models.heatmap.weekend')],
    colLabels: hours.map(pad2),
    values: [...weekdaysOnly.map(pick), merged],
    days: [...weekdaysOnly.map((row) => [row.weekday]), [6, 7]],
  };
}

/** Load (§4.6 #load): forms by weekday × hour; an empty state under 200 forms. */
export default function LoadSection({ metric }) {
  const data = metric.data;
  const phone = useIsPhone();
  const rows = data?.tables.heatmap ?? [];
  const grid = useMemo(() => (rows.length ? heatmapGrid(rows, phone) : null), [rows, phone]);
  const forms = data?.headline.forms ?? 0;
  const cellLabel = (r, c, v) => {
    // Heatmap passes indexes of the grid it draws; on phones that grid is transposed.
    const [row, col] = phone ? [c, r] : [r, c];
    const day = grid.days[row].map(weekdayLong).join('–');
    return t('models.heatmap.cell', { day, hour: grid.colLabels[col], n: fmt.int(v ?? 0) });
  };
  return (
    <section aria-labelledby="load">
      <SectionTitle id="load" title={t('models.section.load')} description={t('models.section.loadSub')} />
      <TableCard title={t('models.heatmap.title')} icon={Grid3x3} hintKey="models.heatmap">
        {data?.takeaways?.heatmap && <p className="-mt-2 mb-4 text-sm font-semibold text-ink">{textOf(data.takeaways.heatmap)}</p>}
        {grid ? (
          <Heatmap
            rowLabels={grid.rowLabels}
            colLabels={grid.colLabels}
            values={grid.values}
            transposed={phone}
            format="int"
            valueName={t('models.heatmap.legend')}
            legendText={t('models.heatmap.legend')}
            cellLabel={cellLabel}
            ariaLabel={t('models.heatmap.title')}
          />
        ) : (
          <EmptyState
            icon={CalendarClock}
            title={t('models.heatmap.few')}
            hint={t('models.heatmap.fewHint', { n: fmt.int(forms), min: fmt.int(HEATMAP_MIN_FORMS) })}
            action="widen"
          />
        )}
      </TableCard>
    </section>
  );
}
