import React, { useMemo } from 'react';
import StackedColumns from '../../charts/StackedColumns.jsx';
import { Card, CardHeader, ChartCard, DataTable } from '../../ui/index.js';
import { usePeriod } from '../../context/AnalyticsContext.jsx';
import { chartIsThin } from '../../data/metrics/recording.js';
import { fmt } from '../../format/format.js';
import { t } from '../../copy/index.js';
import { minutesTable, recordingColumns } from './columns.jsx';
import { MINUTES_SERIES } from './series.js';

const ACTION_CLASS =
  'inline-flex items-center h-9 px-4 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink hover:bg-line/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent print:hidden';

/**
 * "Minutes of recording" (§4.5): stacked columns of conversation / Soniox dictation / OpenAI dictation.
 * Thin rule: fewer than 20 recordings since Soniox began → a sentence with the start dates, "Show all time"
 * (which draws the OpenAI history), and every recording listed underneath.
 */
export default function MinutesBlock({ data, period, doctorOf, loading }) {
  const { setPreset } = usePeriod();
  const series = useMemo(() => MINUTES_SERIES.map((s) => ({ key: s.key, label: t(s.labelKey), color: s.color })), []);
  const table = useMemo(() => minutesTable(data.series), [data.series]);
  const title = t('recording.chart.title');

  if (!loading && chartIsThin(period, data.headline.recordingsSinceSoniox)) {
    return (
      <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
        <CardHeader title={title} hintKey="recording.minutesChart" />
        <div className="flex flex-col items-center justify-center gap-4 px-2 py-8 text-center min-h-[160px] rounded-[16px] bg-line/15">
          <p className="max-w-xl text-sm font-medium text-ink-soft">{t('recording.thin', { n: fmt.int(data.headline.recordingsSinceSoniox) })}</p>
          {period.preset !== 'allTime' && (
            <button type="button" className={ACTION_CLASS} onClick={() => setPreset('allTime')}>
              {t('recording.thin.action')}
            </button>
          )}
        </div>
        <h4 className="mt-6 mb-2 text-sm font-bold text-ink">{t('recording.recordings.title')}</h4>
        <DataTable
          columns={recordingColumns(doctorOf)}
          rows={data.tables.recordings}
          emptyText={t('recording.recordings.empty')}
          caption={t('recording.recordings.title')}
          maxHeight={560}
        />
      </Card>
    );
  }

  return (
    <ChartCard
      title={title}
      hintKey="recording.minutesChart"
      takeaway={data.takeaways?.minutesChart}
      rows={data.series}
      series={series}
      events={data.headline.recordings}
      table={table}
      state={loading ? 'first' : 'ready'}
    >
      {({ series: kept }) => <StackedColumns rows={data.series} series={kept} valueFormat="int" legend={false} />}
    </ChartCard>
  );
}
