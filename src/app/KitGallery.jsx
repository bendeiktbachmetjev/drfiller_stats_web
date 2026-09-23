// Dev server only (`/_kit`, see AdminShell): every kit component with hand-made sample data, so the kit
// can be checked at 1440 / 375 / 320 px before the pages have data. Never part of a production build.
// The texts below are sample data, not owner-facing copy.
import React, { useState } from 'react';
import { useLive } from '../context/useLive.js';
import { SERIES } from '../charts/theme.js';
import TimeColumns from '../charts/TimeColumns.jsx';
import StackedColumns from '../charts/StackedColumns.jsx';
import TimeLines from '../charts/TimeLines.jsx';
import MoneyColumns from '../charts/MoneyColumns.jsx';
import {
  AlertList, AnswerBlock, BarList, Card, CardHeader, ChartCard, DataNotes, DataTable, Disclosure, DoctorName, EmptyState, ErrorBanner,
  FilterBar, Heatmap, HiddenNote, InfoHint, KpiTile, ModelName, NotRecorded, PageHeader, RightNowStrip, RuleStrip, ScaleProjection,
  SectionNav, SectionTitle, Segmented, ShareBar, SourceBadge, SourceBanner,
} from '../ui/index.js';
import useIsPhone from '../context/useIsPhone.js';

const DAYS = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'];
const FORMS = [212, 240, 18, 6, 231, 250, 244, 262, 238, 21, 9, 255, 270, 131];
const dayRows = DAYS.map((key, i) => ({
  key, from: key, to: key, granularity: 'day', isFuture: false, isPartial: i === DAYS.length - 1,
  value: FORMS[i], form: FORMS[i] * 0.0076, recording: i > 11 ? FORMS[i] * 0.004 : 0, anamnesis: i % 3 === 0 ? 0.4 : 0, fixed: 0.06, empty: 0,
  p50: 4100 + (i % 4) * 150, p90: 7400 + (i % 5) * 300,
}));
const weeks = ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'];
const moneyRows = weeks.map((key, i) => {
  const income = [0, 12.5, 0, 24, 45, 24][i];
  const cost = [9.1, 11.3, 10.4, 12.2, 13.9, 6.2][i];
  return { key, from: key, to: key, granularity: 'week', isFuture: false, isPartial: i === weeks.length - 1, income, cost, result: income - cost, costUsd: cost * 1.1463, parts: { form: cost * 0.8, recording: cost * 0.1, anamnesis: cost * 0.05, fixed: cost * 0.05 } };
});

const scale = {
  scenario: { id: 'plan', liveShare: 1, liveMin: 15, dictMin: 0, pack: 'plan', packMix: { pack250: 0, pack600: 0, pack1500: 1 }, vatPayer: false, method: 'card_eea_standard', freeShare: 0, visitsPerDoctorMonth: 400 },
  now: { factor: 1.01, hidden: false, incomeBasis: 'exact' },
  scales: [100, 300],
  columns: {
    now: { netEur: 105.4, costTotalEur: 48.2, resultEur: 57.2, marginPct: 0.54 },
    doctor: { netEur: 29.4, costTotalEur: 14.8, resultEur: 14.6, marginPct: 0.5 },
    s0: { netEur: 2940, costTotalEur: 1480, resultEur: 1460, marginPct: 0.5 },
    s1: { netEur: 8820, costTotalEur: 9260, resultEur: -440, marginPct: -0.05 },
  },
  chips: [],
};
const scaleRows = [
  { key: 'netEur', label: 'Income', format: 'eur' },
  { key: 'costTotalEur', label: 'Costs', format: 'eur' },
  { key: 'resultEur', label: 'Result', format: 'eurSigned' },
  { key: 'marginPct', label: 'Kept, %', format: 'pct' },
];

const tableColumns = [
  { key: 'name', header: 'Doctor', type: 'text', priority: 1, render: (row) => <DoctorName doctor={row.doctor} /> },
  { key: 'forms', header: 'Forms', type: 'int', priority: 1 },
  { key: 'cost', header: 'Costs', type: 'eur', priority: 1 },
  { key: 'result', header: 'Result', type: 'signedBar', format: 'eurSigned', max: 40, priority: 1 },
  { key: 'minutes', header: 'Recording', type: 'minutes', priority: 2 },
  { key: 'last', header: 'Last active', type: 'date', priority: 3 },
];
const tableRows = [
  { key: 'a', name: 'doctor1@example.test', doctor: { email: 'doctor1@example.test', code: 'D-K3ZQ' }, forms: 5210, cost: 38.4, result: -38.4, minutes: 319, last: '2026-09-23' },
  { key: 'b', name: 'doctor2@example.test', doctor: { email: 'doctor2@example.test', code: 'D-A7PL' }, forms: 402, cost: 3.1, result: 20.9, minutes: 12, last: '2026-09-21' },
  { key: 'c', name: 'Doctor 07', doctor: { email: null, noText: '07', code: 'D-QX2M' }, forms: 88, cost: 0.7, result: 11.8, minutes: null, last: '2026-09-02' },
];

const HOURS = ['07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat–Sun'];
const heat = WEEKDAYS.map((_, d) => HOURS.map((__, h) => (d === 5 ? (h % 5 === 0 ? 2 : 0) : Math.round(40 * Math.exp(-(((h - 1) / 2.5) ** 2)) + 30 * Math.exp(-(((h - 9.5) / 2) ** 2)) + d))));

const alerts = [
  { key: 'fallbackToday', tone: 'attention', values: { n: 4 }, link: '/models#fallback' },
  { key: 'pricesStale', tone: 'quiet', values: { date: '23 Jul 2026' }, link: '/prices#prices' },
];

export default function KitGallery() {
  const isPhone = useIsPhone();
  const live = useLive();
  const [seg, setSeg] = useState('plan');
  const liveCells = [
    { key: 'open', value: '3', label: 'conversations now', meter: { value: 0.3 } },
    { key: 'forms', value: '131', label: 'forms today' },
    { key: 'last', value: '2 min ago', label: 'last form' },
  ];

  return (
    <div>
      <PageHeader title="Kit" question="Every component with sample data (dev only)." scopeLine="1–23 Sep 2026 · compared with the previous 23 days · all accounts · updated 14:05" />
      <FilterBar vatChip />
      <AnswerBlock items={[{ text: 'Up €57.20 for 30 days: income €105.40, costs €48.20.', tone: 'good' }, { text: 'As planned (15 min conversation): with 100 doctors ≈ +€1,460 a month, with 300 ≈ −€440.', tone: 'attention' }]} />
      <HiddenNote n={1} costEur={412.3} resultEur={-306.9} />
      <SourceBanner name="revenue" source={{ status: 'off' }} />
      <AlertList items={alerts} />
      <RightNowStrip cells={liveCells} live={{ ...live, data: live.data ?? {} }} />
      <SectionNav items={[{ id: 'kit-tiles', label: 'Tiles' }, { id: 'kit-charts', label: 'Charts' }, { id: 'kit-tables', label: 'Tables' }]} />

      <div id="kit-tiles" className="grid grid-cols-2 lg:grid-cols-12 gap-3 md:gap-6">
        <KpiTile variant="hero" className="col-span-2 lg:col-span-4 lg:row-span-2" label="Are we making money?" value={57.2} format="eurSigned" delta={{ kind: 'eur', value: 31.4, dir: 'up' }} compareLabel="the previous 30 days" sub="Costs at list price; the real invoice is smaller now." spark={FORMS.map((f) => f / 10 - 12)} hintKey="common.term.listPrice" badge="estimate" />
        <KpiTile className="lg:col-span-4" label="Where does the money go?" value={48.2} format="eur" delta={{ kind: 'pct', value: 18, dir: 'up' }} goodWhen="none" hintKey="common.term.listPrice" />
        <KpiTile className="lg:col-span-4" label="Who pays?" valueText="1 of 6" delta={{ kind: 'abs', value: 1, dir: 'up' }} sub="they cause 3% of the costs" badge="inferred" hintKey="common.term.inferred" />
        <KpiTile className="lg:col-span-4" label="How much work?" value={2548} delta={{ kind: 'pct', value: -4, dir: 'down' }} spark={FORMS} hintKey="common.term.credit" />
        <KpiTile className="lg:col-span-4" label="Is everything working?" valueText="Some delays" delta={null} sub="usually 4.1 s, slow 8 of 2548" badge="missing" />
      </div>

      <SectionTitle title="Plan" description="Result per month, now and at scale." />
      <Card>
        <ScaleProjection compact rows={[scaleRows[2]]} data={scale} />
      </Card>
      <Card className="mt-4">
        <Segmented options={[{ value: 'plan', label: 'As planned' }, { value: 'pack250', label: 'Pack 250' }]} value={seg} onChange={setSeg} ariaLabel="Pack" />
        <ScaleProjection className="mt-4" rows={scaleRows} data={scale} />
      </Card>

      <div id="kit-charts" className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <ChartCard className="lg:col-span-7" title="Forms per day" rows={dayRows} series={[{ key: 'value', label: 'Forms' }]} events={2548} takeaway={{ key: 'common.caveat.model' }}
          table={{ columns: [{ key: 'key', header: 'Day', type: 'date', priority: 1 }, { key: 'value', header: 'Forms', type: 'int', priority: 1 }], rows: dayRows }}>
          <TimeColumns rows={dayRows} unit="forms" />
        </ChartCard>
        <ChartCard className="lg:col-span-5" title="Costs by kind" rows={dayRows} series={[{ key: 'form', label: 'Forms', color: SERIES.forms }, { key: 'recording', label: 'Recording', color: SERIES.live }, { key: 'anamnesis', label: 'History', color: SERIES.anamnesis }, { key: 'empty', label: 'Server', color: SERIES.infra }]} height={240}>
          {({ series }) => <StackedColumns rows={dayRows} series={series} valueFormat="eur" legend={false} />}
        </ChartCard>
        <ChartCard className="lg:col-span-8" title="Money per week" rows={moneyRows} series={[{ key: 'income', label: 'Income', color: SERIES.income }, { key: 'cost', label: 'Costs', color: SERIES.cost }, { key: 'result', label: 'Result', color: SERIES.result, shape: 'line' }]}>
          <MoneyColumns rows={moneyRows} partLabels={{ form: 'Forms', recording: 'Recording', anamnesis: 'History', fixed: 'Server' }} />
        </ChartCard>
        <ChartCard className="lg:col-span-4" title="Too few events" rows={dayRows} series={[{ key: 'value', label: 'Forms' }]} events={7}
          table={{ columns: [{ key: 'key', header: 'Day', type: 'date', priority: 1 }, { key: 'value', header: 'Forms', type: 'int', priority: 1 }], rows: dayRows.slice(0, 3) }}>
          <TimeColumns rows={dayRows} />
        </ChartCard>
        <ChartCard className="lg:col-span-12" title="How long a form takes" rows={dayRows} series={[{ key: 'p50', label: 'Usually' }, { key: 'p90', label: '9 of 10' }]} height={240}>
          <TimeLines rows={dayRows} series={[{ key: 'p50', label: 'Usually', color: SERIES.main }, { key: 'p90', label: '9 of 10', color: SERIES.main, dash: true }]} format="sec" referenceLines={[{ y: 15000, label: '15 s', tone: 'attention' }]} />
        </ChartCard>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Top doctors" hintKey="common.term.internal" />
          <BarList items={tableRows.map((r) => ({ key: r.key, label: r.name, value: r.forms }))} showShare />
          <div className="mt-6">
            <ShareBar items={[{ key: 'form', label: 'Forms', value: 40.1, color: SERIES.forms }, { key: 'rec', label: 'Recording', value: 5.2, color: SERIES.live }, { key: 'an', label: 'History', value: 2.1, color: SERIES.anamnesis }, { key: 'fixed', label: 'Server', value: 1.7, color: SERIES.infra }]} format="eur" />
          </div>
        </Card>
        <Card>
          <CardHeader title="When doctors work" />
          <Heatmap rowLabels={WEEKDAYS} colLabels={HOURS} values={heat} transposed={isPhone} format="int" valueName="forms" ariaLabel="Forms by weekday and hour" />
        </Card>
      </div>

      <div id="kit-tables" className="mt-6">
        <Card>
          <CardHeader title="Doctors" right={<SourceBadge basis="estimate" />} />
          <DataTable columns={tableColumns} rows={tableRows} defaultSort={{ key: 'forms', dir: 'desc' }} />
          <Disclosure id="kit.math">
            <DataTable columns={tableColumns.slice(0, 3)} rows={tableRows} />
          </Disclosure>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <EmptyState title="No requests from 1 Sep to 23 Sep." action="widen" />
        </Card>
        <div className="flex flex-col gap-4">
          <ErrorBanner error={{ code: 'NETWORK' }} onRetry={() => {}} />
          <RuleStrip />
          <p className="text-sm text-ink-soft inline-flex items-center gap-1.5">Hint target <InfoHint hintKey="common.term.token" label="Tokens" /></p>
          <p className="text-sm font-semibold text-ink"><ModelName id="gemini-3-flash-preview" /></p>
          <p className="text-sm font-semibold text-ink"><ModelName id="soniox:stt-async-v5" inline /></p>
        </div>
      </div>

      <DataNotes notes={[{ key: 'common.note.openaiShareAssumed' }, 'A ready sentence also works.']} />
      <NotRecorded />
    </div>
  );
}
