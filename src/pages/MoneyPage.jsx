import React, { useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { useAnalytics, useMoney } from '../context/AnalyticsContext.jsx';
import { DataNotes, EmptyState, NotRecorded, PageLayout, SectionNav } from '../ui/index.js';
import { t } from '../copy/index.js';
import { addDays } from '../data/period.js';
import { fmt } from '../format/format.js';
import CreditsSection from './money/CreditsSection.jsx';
import MoneyBanners from './money/MoneyBanners.jsx';
import PaymentsSection from './money/PaymentsSection.jsx';
import ScaleSection from './money/ScaleSection.jsx';
import UnitSection from './money/UnitSection.jsx';
import { moneyExportTables } from './money/exportTables.js';
import { textOf } from './money/text.js';
import { periodPhrase } from '../format/items.js';

/** Notes shown in place (under the credits bar) are not repeated in the closing Data notes. */
const NOTES_IN_PLACE = new Set(['money.note.beforeMeter']);

const sectionChips = () => [
  { id: 'payments', label: t('money.nav.payments') },
  { id: 'credits', label: t('money.nav.credits') },
  { id: 'unit', label: t('money.nav.unit') },
  { id: 'scale', label: t('money.nav.scale') },
];

/**
 * Money (§4.2): how much comes in, how much we keep, and whether it pays off at 100–300 doctors.
 * PageLayout order; then the banners, the section chips and the four sections: Payments · Credits ·
 * One credit and one visit (pack switch) · Scale (scenario switch). Both switches are page-local, not saved.
 */
export default function MoneyPage() {
  const [pack, setPack] = useState('plan');
  const [scenario, setScenario] = useState('plan');
  const metric = useMoney({ pack, scenario });
  const { dataset } = useAnalytics();
  const { data, period } = metric;
  const phrase = periodPhrase(period);

  const answerItems = useMemo(
    () => (data?.answer?.length ? data.answer.map((item) => ({ text: textOf(item, { period: phrase }), tone: item.tone })) : undefined),
    [data, phrase],
  );
  const exportTables = useMemo(() => moneyExportTables(metric, dataset), [metric, dataset]);
  const notes = useMemo(() => (data?.notes ?? []).filter((note) => !NOTES_IN_PLACE.has(note.key)), [data]);

  return (
    <PageLayout id="money" metric={metric} vatChip sources={['usage', 'config']} answerItems={answerItems} exportTables={exportTables}>
      {data?.empty ? (
        <EmptyState
          icon={Wallet}
          title={t('common.empty.period', { from: fmt.date(period.from), to: fmt.date(addDays(period.effTo > period.from ? period.effTo : period.to, -1)) })}
          action="widen"
        />
      ) : (
        <>
          <MoneyBanners data={data} source={dataset?.sources?.revenue} />
          <SectionNav items={sectionChips()} />
          <PaymentsSection metric={metric} ds={dataset} phrase={phrase} />
          <CreditsSection metric={metric} phrase={phrase} />
          <UnitSection metric={metric} pack={pack} onPack={setPack} phrase={phrase} />
          <ScaleSection metric={metric} scenario={scenario} onScenario={setScenario} />
          <DataNotes notes={notes} />
          <NotRecorded />
        </>
      )}
    </PageLayout>
  );
}
