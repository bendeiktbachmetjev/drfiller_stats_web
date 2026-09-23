import React, { createContext, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Table2 } from 'lucide-react';
import { def, t } from '../copy/index.js';
import { fmt } from '../format/format.js';
import { MIN_EVENTS_FOR_CHART, MIN_NONZERO_BUCKETS } from '../data/constants.js';
import { usePrintMode } from '../context/usePrintMode.js';
import Card from './Card.jsx';
import CardHeader from './CardHeader.jsx';
import InfoHint from './InfoHint.jsx';
import EmptyState from './EmptyState.jsx';
import DataTable from './DataTable.jsx';
import Legend from './Legend.jsx';

// The charts inside a card read their plot height and their accessible name from here,
// so the box and the chart can never disagree.
export const ChartFrameContext = createContext(null);

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const ROUND_ICON =
  'sf-hit w-8 h-8 flex items-center justify-center rounded-full border border-line text-ink-soft hover:bg-line/20 transition-colors';
const ROUND_ICON_ON =
  'sf-hit w-8 h-8 flex items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-brand transition-colors';

const isZero = (v) => v == null || v === 0 || !Number.isFinite(v);

/**
 * Which series carry data and how many buckets are non-zero (§3.12).
 * @param {object[]} rows
 * @param {Array<{ key: string, label: string }>} series
 */
export function chartShape(rows = [], series = []) {
  const kept = series.filter((s) => rows.some((row) => !isZero(row[s.key])));
  const dropped = series.filter((s) => !kept.includes(s));
  const nonZeroBuckets = rows.filter((row) => kept.some((s) => !isZero(row[s.key]))).length;
  return { kept, dropped, nonZeroBuckets };
}

// Card around one chart: title row, optional takeaway, legend, plot box of a fixed height, and a table twin.
//   title, icon, hint, hintKey   as in CardHeader (hint defaults to DEFS[hintKey].short)
//   takeaway          { key, values } — the one-line "so what" under the title (only when its rule fired)
//   rows, series      when given, the card applies the §3.12 rules itself:
//     dropZeroSeries    (default true) a series that is 0/null in every bucket is removed and named in a caption
//     minNonZeroBuckets (default 3) fewer non-zero buckets → a sentence instead of the chart
//   events            trend charts: events in the period; fewer than `minEvents` (default 20) → a sentence instead
//                     of the chart ("Only 7 events so far — a chart needs 20. Every event is listed below.")
//   A chart replaced by a sentence shows its table twin right under it (the list the sentence points to);
//   without a table the sentence keeps the chart's height, so the card does not jump.
//   legend            Legend items or a node; defaults to the kept series (none for a single series)
//   height            px of the plot box: 320 main chart, 240 secondary
//   state             'ready' | 'first' | 'empty' | 'error'
//   empty             { title, hint, action?, icon? } for the empty state
//   table             { columns, rows, defaultSort?, footerRow? } — the table twin ("View as table"), shown in print
//   controls          node in the header (a Segmented switch)
//   children          the chart, or a function ({ series }) → chart that receives the kept series
export default function ChartCard({
  title,
  icon,
  hint,
  hintKey,
  takeaway,
  rows,
  series,
  dropZeroSeries = true,
  minNonZeroBuckets = MIN_NONZERO_BUCKETS,
  events,
  minEvents = MIN_EVENTS_FOR_CHART,
  legend,
  height = 320,
  state = 'ready',
  empty,
  table,
  controls,
  children,
  className = '',
}) {
  const [view, setView] = useState('chart');
  const { printing } = usePrintMode();

  const definition = def(hintKey);
  const label = typeof title === 'string' ? title : undefined;
  const frame = useMemo(() => ({ height, title: label }), [height, label]);

  const shape = useMemo(
    () => (Array.isArray(rows) && Array.isArray(series) ? chartShape(rows, series) : null),
    [rows, series],
  );
  const shownSeries = shape ? (dropZeroSeries ? shape.kept : series) : series;
  const fewEvents = Number.isFinite(events) && events < minEvents;
  const fewBuckets = Boolean(shape) && shape.nonZeroBuckets < minNonZeroBuckets;
  const thin = fewEvents || fewBuckets;
  let thinText = null;
  if (fewEvents) thinText = t('common.thin', { n: fmt.int(events), min: fmt.int(minEvents) });
  else if (fewBuckets) thinText = t('common.thinChart', { n: fmt.int(shape.nonZeroBuckets) });

  const ready = state === 'ready';
  const hasTable = ready && Boolean(table?.columns?.length);
  const tableView = hasTable && (view === 'table' || thin);
  const showChart = !tableView || printing;
  const ToggleIcon = tableView ? BarChart3 : Table2;

  const legendItems =
    legend ?? (Array.isArray(shownSeries) && shownSeries.length > 1 ? shownSeries.map((s) => ({ key: s.key, label: s.label, color: s.color, shape: s.shape ?? 'rect' })) : null);

  const right = (
    <>
      {controls}
      {definition?.long && <InfoHint hintKey={hintKey} label={label} />}
      {hasTable && !thin && (
        <button
          type="button"
          aria-pressed={tableView}
          aria-label={t('common.chart.asTable')}
          title={tableView ? t('common.chart.asChart') : t('common.chart.asTable')}
          onClick={() => setView(tableView ? 'chart' : 'table')}
          className={`${tableView ? ROUND_ICON_ON : ROUND_ICON} ${RING}`}
        >
          <ToggleIcon className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </>
  );

  const chartNode = typeof children === 'function' ? children({ series: shownSeries }) : children;

  return (
    <Card padding="none" className={['min-w-0 p-4 sm:p-6 lg:p-8', className].filter(Boolean).join(' ')}>
      <CardHeader title={title} icon={icon} hint={hint ?? definition?.short} right={right} className={takeaway ? 'mb-2' : undefined} />
      {takeaway?.key && <p className="mb-4 text-sm font-semibold text-ink">{fmt.textOf(takeaway)}</p>}

      {state === 'first' && (
        <div className="flex items-center justify-center text-xs font-medium text-ink-mute" style={{ height }}>
          {t('common.chart.loading')}
        </div>
      )}

      {state === 'empty' && (
        <EmptyState icon={empty?.icon ?? BarChart3} title={empty?.title ?? t('common.list.empty')} hint={empty?.hint} action={empty?.action} minHeight={height} />
      )}

      {state === 'error' && <EmptyState icon={AlertTriangle} title={t('common.chart.error')} hint={t('common.chart.errorHint')} minHeight={height} />}

      {ready && thin && (
        <p
          className={hasTable ? 'mb-3 text-sm font-medium text-ink-soft' : 'flex items-center justify-center px-6 text-center text-sm font-medium text-ink-soft'}
          style={hasTable ? undefined : { minHeight: height }}
        >
          {thinText}
        </p>
      )}

      {ready && showChart && !thin && (
        <>
          {legendItems && <div className="mb-3">{Array.isArray(legendItems) ? <Legend items={legendItems} /> : legendItems}</div>}
          <div className="min-w-0 print:h-auto!" style={{ height }}>
            <ChartFrameContext.Provider value={frame}>{chartNode}</ChartFrameContext.Provider>
          </div>
          {dropZeroSeries && shape?.dropped?.length > 0 && (
            <p className="mt-3 text-xs font-medium text-ink-mute">
              {shape.dropped.map((s) => t('common.seriesEmpty', { series: s.label })).join(' · ')}
            </p>
          )}
        </>
      )}

      {hasTable && (
        <div className={tableView ? 'print:mt-4' : 'hidden print:block print:mt-4'} style={{ minHeight: tableView && !thin ? height : undefined }}>
          <DataTable columns={table.columns} rows={table.rows} defaultSort={table.defaultSort} footerRow={table.footerRow} caption={label} />
        </div>
      )}
    </Card>
  );
}
