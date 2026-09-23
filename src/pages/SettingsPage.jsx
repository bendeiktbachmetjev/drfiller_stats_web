import React, { useMemo } from 'react';
import { useAnalytics, useScope, useSettingsMetric } from '../context/AnalyticsContext.jsx';
import { DataNotes, PageLayout, RefreshButton, SectionNav } from '../ui/index.js';
import { t } from '../copy/index.js';
import { fmt } from '../format/format.js';
import AccountsSection from './settings/AccountsSection.jsx';
import CalcSection from './settings/CalcSection.jsx';
import { AccessSection, ErasSection, LinksSection, PricesSection, SourcesSection } from './settings/InfoSections.jsx';
import PlanningSection from './settings/PlanningSection.jsx';
import { answerItemsOf, itemText } from './settings/text.js';

const SECTIONS = ['calc', 'doctors', 'planning', 'prices', 'eras', 'sources', 'access', 'links'];

/** "Measured over 24 Aug – 23 Sep 2026 · without my and test accounts (1)" (the hints' window, §4.9). */
function scopeLineOf(headline, scope, internalCount) {
  if (!headline?.windowFrom) return null;
  const scopeText =
    scope?.excludeInternal && internalCount > 0 ? t('common.scopeText.noInternal', { n: fmt.int(internalCount) }) : t('common.scopeText.all');
  return t('settings.scopeLine', { range: fmt.range(headline.windowFrom, headline.windowTo), scopeText });
}

/** "Updated 14:05 ⟳" at the right of the title (Settings has no filter row). */
function UpdatedAside() {
  const { lastUpdated } = useAnalytics();
  return (
    <>
      {lastUpdated && <span className="text-xs font-semibold text-ink-mute whitespace-nowrap">{t('common.updated', { time: fmt.time(lastUpdated) })}</span>}
      <RefreshButton />
    </>
  );
}

/**
 * Settings (§4.9): how we count (VAT, language), my and test accounts, forecast assumptions, prices and
 * exchange rate, setup history, data sources, access and links — one column of cards with anchors.
 * No period and no filter row; the measured hints always cover the last 30 days.
 */
export default function SettingsPage() {
  const metric = useSettingsMetric();
  const { dataset } = useAnalytics();
  const { scope, internalCount } = useScope();
  const { data } = metric;
  const readOnly = dataset?.sources?.settings?.status === 'error';

  const answerItems = useMemo(() => answerItemsOf(data, dataset), [data, dataset]);
  const notes = useMemo(() => (data?.notes ?? []).map((note) => itemText(note, dataset)), [data, dataset]);
  const navItems = SECTIONS.map((id) => ({ id, label: t(`settings.nav.${id}`) }));

  return (
    <PageLayout
      id="settings"
      metric={metric}
      answerItems={answerItems}
      filterBar={false}
      scopeLine={scopeLineOf(data?.headline, scope, internalCount)}
      aside={<UpdatedAside />}
      hiddenNote={null}
      sources={['settings', 'config']}
    >
      <SectionNav items={navItems} />
      <div>
        <CalcSection readOnly={readOnly} />
        <AccountsSection data={data} dataset={dataset} readOnly={readOnly} />
        <PlanningSection data={data} readOnly={readOnly} />
        <PricesSection data={data} />
        <ErasSection data={data} config={dataset?.config ?? null} />
        <SourcesSection data={data} dataset={dataset} />
        <AccessSection />
        <LinksSection />
      </div>
      <DataNotes notes={notes} />
    </PageLayout>
  );
}
