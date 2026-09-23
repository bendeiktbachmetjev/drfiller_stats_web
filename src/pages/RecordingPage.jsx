import React, { useCallback, useMemo } from 'react';
import { Mic } from 'lucide-react';
import { useAnalytics, useRecording } from '../context/AnalyticsContext.jsx';
import useLive from '../context/useLive.js';
import {
  Card, CardHeader, DataNotes, Disclosure, EmptyState, KpiTile, NotRecorded, PageLayout, RightNowStrip, RuleStrip, ScaleProjection, SectionTitle,
} from '../ui/index.js';
import { chartIsThin, creditsDeltaHidden } from '../data/metrics/recording.js';
import { SONIOX_SINCE_MS } from '../data/eras.js';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import MinutesBlock from './recording/MinutesBlock.jsx';
import ProvidersCard from './recording/ProvidersCard.jsx';
import TableCard from './recording/TableCard.jsx';
import { limitColumns, meterColumns, openaiColumns, reconcileColumns, sessionColumns } from './recording/columns.jsx';
import { liveCells } from './recording/liveCells.js';
import { exportTables } from './recording/exportTables.js';

const KPI_GRID = 'grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-4';
const STACK = 'mt-6 flex flex-col gap-6';
const SONIOX_OK = ['ok', 'partial'];
/** On phones the two full-width text tiles go below the two half-width count tiles, so no row is left half empty. */
const PHONE_LAST = 'max-sm:order-last';
/** Below this many recordings the Soniox share reads as counts ("10 of 10"), the % sits in the (i) wording. */
const SHARE_AS_PERCENT_FROM = 20;

const sonioxShareText = (h) =>
  h.dictationsSinceSoniox < SHARE_AS_PERCENT_FROM ? fmt.countOf(h.sonioxDictations, h.dictationsSinceSoniox) : fmt.pct(h.sonioxShare);

/** "How much and at what price" — business numbers, follow the account switch. */
function BusinessTiles({ metric, h, basis, loading, fx }) {
  const hideCreditsDelta = creditsDeltaHidden(metric.period, metric.prevPeriod);
  // Every tile here carries a basis badge, which leaves no room for the label in a half-width phone tile.
  const common = { compareLabel: metric.compareLabel, firstLoad: loading, wide: true };
  return (
    <div className={KPI_GRID}>
      <KpiTile
        {...common}
        label={t('recording.tile.minutes')}
        value={h.minutes}
        format="minutes"
        delta={metric.delta((d) => d.headline.minutes)}
        sub={Number.isFinite(h.minutesLive) ? t('recording.tile.minutesSub', { live: fmt.minutes(h.minutesLive) }) : null}
        badge={basis.minutes}
        hintKey="recording.minutes"
      />
      <KpiTile
        {...common}
        label={t('recording.tile.cost')}
        value={h.cost}
        format="eur"
        goodWhen="none"
        delta={metric.delta((d) => d.headline.cost, 'money')}
        sub={Number.isFinite(h.cost10Eur) ? t('recording.tile.costSub', { cost10: fmt.eurUnit(h.cost10Eur) }) : null}
        badge={basis.cost}
        hintKey="recording.cost"
        hintValues={fx}
      />
      <KpiTile
        {...common}
        label={t('recording.tile.credits')}
        value={h.credits}
        format="credits"
        delta={hideCreditsDelta ? undefined : metric.delta((d) => d.headline.credits, 'abs')}
        sub={hideCreditsDelta ? t('recording.tile.creditsNoCompare') : null}
        badge={basis.credits}
        hintKey="recording.credits"
      />
      <KpiTile
        {...common}
        label={t('recording.tile.margin10')}
        value={h.margin10}
        format="pct"
        sub={Number.isFinite(h.left10Eur) ? t('recording.tile.margin10Sub', { left: fmt.eurUnit(h.left10Eur) }) : null}
        badge={basis.margin10}
        hintKey="recording.margin10"
        hintValues={Number.isFinite(h.convTokensPerMin) ? { tpm: fmt.int(h.convTokensPerMin) } : undefined}
      />
    </div>
  );
}

/** "How recording works" — service numbers, all traffic. */
function ServiceTiles({ metric, h, basis, loading }) {
  const common = { compareLabel: metric.compareLabel, firstLoad: loading };
  const hasDictations = h.dictationsSinceSoniox > 0;
  const hasPeak = Number.isFinite(h.peakStreams);
  return (
    <div className={KPI_GRID}>
      <KpiTile
        {...common}
        label={t('recording.tile.conversations')}
        value={h.conversations}
        delta={metric.delta((d) => d.headline.conversations, 'abs')}
        sub={Number.isFinite(h.avgConversationMin) ? t('recording.tile.conversationsSub', { min: fmt.minutes(h.avgConversationMin) }) : null}
        badge={basis.conversations}
        hintKey="recording.conversations"
      />
      <KpiTile
        {...common}
        label={t('recording.tile.sonioxShare')}
        value={null}
        className={PHONE_LAST}
        valueText={hasDictations ? sonioxShareText(h) : undefined}
        delta={metric.delta((d) => d.headline.sonioxShare, 'pp')}
        sub={t('recording.tile.sonioxShareSub')}
        badge={basis.sonioxShare}
        hintKey="recording.sonioxShare"
      />
      <KpiTile
        {...common}
        label={t('recording.tile.peak')}
        value={null}
        className={PHONE_LAST}
        valueText={hasPeak ? t('recording.tile.peakValue', { n: fmt.int(h.peakStreams), limit: fmt.int(h.streamLimit) }) : undefined}
        goodWhen="down"
        delta={metric.delta((d) => d.headline.peakStreams, 'abs')}
        sub={t('recording.tile.peakSub')}
        badge={hasPeak ? basis.peakStreams : undefined}
        hintKey="recording.peak"
      />
      <KpiTile
        {...common}
        label={t('recording.tile.carried')}
        value={h.carriedMin}
        format="minutes"
        goodWhen="none"
        sub={t('recording.tile.carriedSub')}
        badge={basis.carriedMin}
        hintKey="recording.carried"
      />
    </div>
  );
}

/** Secondary blocks of the service section, behind "Show the math". */
function ServiceDetails({ data, period, dataset, sources, doctorOf }) {
  const { tables } = data;
  const touchesSoniox = period.toMs > SONIOX_SINCE_MS;
  const sonioxStatus = sources?.soniox?.status;
  let reconcileNote = null;
  if (!dataset?.soniox || !SONIOX_OK.includes(dataset.soniox.status ?? 'ok')) {
    reconcileNote = t(sonioxStatus === 'error' ? 'common.source.sonioxError' : 'common.source.sonioxOff');
  }
  return (
    <>
      <div className="flex flex-col gap-6">
        {touchesSoniox && <ProvidersCard rows={tables.providers} />}
        <TableCard title={t('recording.limit.title')} hintKey="recording.limit" columns={limitColumns()} rows={tables.limit} />
      </div>
      <div className={STACK}>
        <TableCard
          title={t('recording.sessions.title')}
          hintKey="recording.sessions"
          columns={sessionColumns(doctorOf)}
          rows={tables.sessions}
          emptyText={t('recording.sessions.empty')}
        />
        <TableCard
          title={t('recording.meter.title')}
          hintKey="recording.meter"
          columns={meterColumns(doctorOf)}
          rows={tables.meterEvents}
          emptyText={t('recording.meter.empty')}
          note={(dataset?.meter?.length ?? 0) === 0 ? t('recording.meter.none') : null}
        />
        {touchesSoniox && (
          <TableCard
            title={t('recording.openai.title')}
            hintKey="recording.openai"
            columns={openaiColumns(doctorOf)}
            rows={tables.openaiFallbacks}
            emptyText={t('recording.openai.empty')}
          />
        )}
        {touchesSoniox && (
          <TableCard
            title={t('recording.reconcile.title')}
            hintKey="recording.reconcile"
            columns={reconcileColumns()}
            rows={tables.reconcile}
            emptyText={t('recording.reconcile.empty')}
            note={reconcileNote}
          />
        )}
      </div>
    </>
  );
}

/**
 * Recording page (§4.5): how much we record, what it costs, and whether 1 credit per 10 minutes pays for it.
 * PageLayout top → billing rule → live strip → business section (tiles; plan and chart behind "Show the math")
 * → service section (tiles; bar, limit and event tables behind "Show the math") → notes → footnote.
 */
export default function RecordingPage() {
  const metric = useRecording();
  const { dataset } = useAnalytics();
  const live = useLive();
  const { data, period } = metric;
  const h = data?.headline ?? {};
  const basis = data?.basis ?? {};
  const loading = !data;
  // The minutes chart answers "how much do we record", so it stays open once there is enough to draw.
  const chartOpen = Boolean(data) && !chartIsThin(period, h.recordingsSinceSoniox);

  const doctorOf = useCallback((pid) => dataset?.doctors?.get?.(pid) ?? null, [dataset]);
  const exports = useMemo(() => exportTables(() => data, period, doctorOf), [data, period, doctorOf]);
  const fx = dataset?.fx ? { fx: (1 / dataset.fx.usdPerEur).toFixed(4), date: fmt.date(dataset.fx.rateDate) } : undefined;
  const planRows = [
    { key: 'recordingCostEur', label: t('recording.row.recordingCost'), format: 'eur', hintKey: 'recording.recordingCost' },
    { key: 'recordingIncomeEur', label: t('recording.row.recordingIncome'), format: 'eur', hintKey: 'recording.recordingIncome' },
  ];

  return (
    <PageLayout id="recording" metric={metric} sources={['usage', 'soniox', 'config']} exportTables={exports}>
      <RuleStrip />
      <RightNowStrip compact cells={liveCells(live, h.streamLimit)} live={live} />

      {data?.empty ? (
        <Card className="mt-6">
          <EmptyState icon={Mic} title={t('recording.empty', { range: fmt.range(period.from, period.effTo) })} hint={t('recording.emptyHint')} action="widen" />
        </Card>
      ) : (
        <>
          <SectionTitle id="business" title={t('recording.section.business')} description={t('recording.section.businessHint')} />
          <BusinessTiles metric={metric} h={h} basis={basis} loading={loading} fx={fx} />
          {chartOpen && (
            <div className="mt-3 md:mt-6">
              <MinutesBlock data={data} period={period} doctorOf={doctorOf} loading={loading} />
            </div>
          )}
          {data && (
            <Disclosure id="recording.business">
              <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
                <CardHeader title={t('recording.plan.title')} hintKey="recording.plan" />
                <ScaleProjection rows={planRows} data={data.projection} />
              </Card>
              {!chartOpen && (
                <div className="mt-6">
                  <MinutesBlock data={data} period={period} doctorOf={doctorOf} loading={loading} />
                </div>
              )}
            </Disclosure>
          )}

          <SectionTitle id="service" service title={t('recording.section.service')} description={t('recording.section.serviceHint')} />
          <ServiceTiles metric={metric} h={h} basis={basis} loading={loading} />
          {data && (
            <Disclosure id="recording.service">
              <ServiceDetails data={data} period={period} dataset={dataset} sources={metric.sources} doctorOf={doctorOf} />
            </Disclosure>
          )}
        </>
      )}

      <DataNotes notes={data?.notes} />
      <NotRecorded />
    </PageLayout>
  );
}
