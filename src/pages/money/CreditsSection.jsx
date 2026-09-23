import React from 'react';
import { Card, CardHeader, Disclosure, KpiTile, RuleStrip, SectionTitle, ShareBar, SourceBadge } from '../../ui/index.js';
import { COLORS, SERIES } from '../../charts/theme.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { badgeOf, textOf } from './text.js';

const GRID = 'grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-4';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Fixed colours by identity (§5.3.4): forms brand, recording rec, medical history anamnesis.
const FEATURE_COLOR = { form: SERIES.forms, recording: SERIES.live, anamnesis: SERIES.anamnesis };
// Who holds the credits: bought = income (brand); the unpaid kinds in neutral steps; own accounts infra.
const CLASS_COLOR = { paid: COLORS.brand, gifted: COLORS.cost, free: COLORS['data-mute'], internal: COLORS.infra, other: COLORS['ink-mute'] };

function CreditTiles({ metric, firstLoad }) {
  const h = metric.data?.headline ?? {};
  const b = metric.data?.basis ?? {};
  const common = { compareLabel: metric.compareLabel, firstLoad };
  // Recording was paid for differently before 23 Sep 2026: no comparison across that change (§3.3).
  const billingChanged = Boolean(metric.compareCaveat?.billingEraChanged);
  const known = isNum(h.freeExposureFormsEur) && isNum(h.freeExposureLiveEur);
  const noFree = known && !(h.freeBalances > 0);
  let exposure = null;
  if (noFree) exposure = fmt.eur(0);
  else if (known) exposure = `${fmt.eur(h.freeExposureFormsEur)}–${fmt.eur(h.freeExposureLiveEur)}`;
  let exposureSub = null;
  if (noFree) exposureSub = t('money.tile.freeExposure.none');
  else if (isNum(h.freeBalances)) exposureSub = t('money.tile.freeExposure.sub', { n: fmt.credits(h.freeBalances) });
  return (
    <div className={GRID}>
      <KpiTile
        label={t('money.tile.creditsSpent')}
        value={h.creditsSpent}
        wide={b.creditsSpent === 'estimate'}
        delta={billingChanged ? null : metric.delta((d) => d.headline.creditsSpent)}
        sub={t('money.tile.creditsSpent.sub', { n: fmt.int(h.creditsRecording) })}
        badge={badgeOf(h.creditsSpent, b.creditsSpent)}
        hintKey="money.creditsSpent"
        {...common}
      />
      <KpiTile
        label={t('money.tile.creditsSold')}
        value={h.creditsSold}
        delta={metric.delta((d) => d.headline.creditsSold)}
        badge={badgeOf(h.creditsSold, b.creditsSold)}
        hintKey="money.creditsSold"
        {...common}
      />
      <KpiTile
        label={t('money.tile.balances')}
        value={h.balances}
        goodWhen="none"
        sub={t('money.tile.balances.sub')}
        badge={badgeOf(h.balances, b.balances)}
        hintKey="money.balances"
        {...common}
      />
      <KpiTile
        label={t('money.tile.freeExposure')}
        valueText={exposure ?? undefined}
        goodWhen="down"
        sub={exposureSub}
        badge={noFree ? undefined : b.freeExposureFormsEur}
        hintKey="money.freeExposure"
        {...common}
      />
    </div>
  );
}

/**
 * Section B "Credits" (§4.2 B): the billing rule, four tiles, what the spent credits went on (with the
 * note about the old recording rule when it applied), and who holds the balances behind "Show the math".
 */
export default function CreditsSection({ metric, phrase }) {
  const data = metric.data;
  const byFeature = data?.tables?.creditsByFeature ?? [];
  const recordingEstimated = byFeature.some((row) => row.key === 'recording' && row.credits > 0 && row.basis === 'estimate');
  const beforeMeter = (data?.notes ?? []).some((note) => note.key === 'money.note.beforeMeter');
  return (
    <section aria-label={t('money.b.title')}>
      <SectionTitle id="credits" title={t('money.b.title')} description={textOf(data?.takeaways?.credits, { period: phrase })} />
      <RuleStrip />
      <CreditTiles metric={metric} firstLoad={!data} />
      {data && (
        <Card padding="none" className="mt-3 md:mt-6 p-4 sm:p-6 lg:p-8">
          <CardHeader title={t('money.creditsByFeature.title')} hintKey="money.creditsByFeature" right={recordingEstimated ? <SourceBadge basis="estimate" /> : null} />
          <ShareBar
            format="int"
            items={byFeature.map((row) => ({ key: row.key, label: t(`money.feature.${row.key}`), value: row.credits, color: FEATURE_COLOR[row.key] }))}
          />
          {beforeMeter && <p className="mt-4 text-xs font-medium text-ink-soft">{t('money.note.beforeMeter')}</p>}
          <Disclosure id="money.balancesByClass">
            <CardHeader title={t('money.balancesByClass.title')} hintKey="money.balancesByClass" className="mb-3" />
            <ShareBar
              format="int"
              items={(data.tables.balancesByClass ?? [])
                .filter((row) => row.key !== 'other' || row.credits > 0)
                .map((row) => ({ key: row.key, label: t(`money.class.${row.key}`), value: row.credits, color: CLASS_COLOR[row.key] }))}
            />
          </Disclosure>
        </Card>
      )}
    </section>
  );
}
