import React from 'react';
import { KpiTile, ShareBar } from '../../ui/index.js';
import { SERIES } from '../../charts/theme.js';
import { fmt } from '../../format/format.js';
import { plural, t } from '../../copy/index.js';

/** Sparklines show the last ≤ 12 buckets that have begun (§4.1). */
const SPARK_BUCKETS = 12;

const PART_COLORS = { form: SERIES.forms, recording: SERIES.live, anamnesis: SERIES.anamnesis, fixed: SERIES.fixed };

const sparkOf = (series, field) =>
  (series ?? [])
    .filter((row) => !row.isFuture)
    .slice(-SPARK_BUCKETS)
    .map((row) => row[field]);


// A badge next to "—" would repeat "no data"; it marks real inference on a real value only.
const badgeOf = (value, basis) => (value === null || value === undefined ? undefined : basis);

// Grid cells (§3.2): hero 2 columns on phones and 4 × 2 on large screens; the other tiles full width on
// phones (money and text values; the one count tile joins them so no row is left half empty).
const HERO_CELL = 'col-span-2 lg:col-span-4 lg:row-span-2';
const CELL = 'col-span-2 sm:col-span-1 lg:col-span-4';

/**
 * Hero + four tiles (§4.1): "Are we making money?", "Where does the money go?", "Who pays?",
 * "How much work?", "Is everything working?". Every tile carries its (i).
 *   metric  the useOverview() result
 */
export default function OverviewTiles({ metric }) {
  const { data, status, compareLabel } = metric;
  const firstLoad = status === 'loading' && !data;
  const h = data?.headline ?? {};
  const basis = data?.basis ?? {};
  const series = data?.series;
  const incomeKnown = h.result !== null && h.result !== undefined;

  const parts = (data?.tables?.costByFeature ?? []).map((row) => ({
    key: row.key,
    label: t(`overview.split.${row.key}`),
    value: row.valueEur,
    color: PART_COLORS[row.key],
  }));

  const healthSub =
    h.healthForms > 0 ? t('overview.health.sub', { usual: fmt.sec(h.p50Ms), over15: fmt.int(h.over15), forms: fmt.int(h.healthForms) }) : undefined;

  return (
    <section aria-labelledby="overview-kpis">
      <h2 id="overview-kpis" className="sr-only">
        {t('overview.kpis')}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-12">
        <div className={HERO_CELL}>
          <KpiTile
            className="h-full"
            variant="hero"
            label={t('overview.tile.result')}
            value={h.result}
            format="eur"
            delta={metric.delta((d) => d.headline.result, 'eur')}
            compareLabel={compareLabel}
            goodWhen="up"
            badge={badgeOf(h.result, basis.result)}
            sub={incomeKnown ? t('overview.result.sub') : t('overview.result.off')}
            spark={incomeKnown ? sparkOf(series, 'resultEur') : undefined}
            hintKey="overview.result"
            to="/money"
            firstLoad={firstLoad}
          />
        </div>
        <div className={CELL}>
          <KpiTile
            className="h-full"
            label={t('overview.tile.cost')}
            value={h.cost}
            format="eur"
            delta={metric.delta((d) => d.headline.cost, 'money')}
            compareLabel={compareLabel}
            goodWhen="none"
            badge={badgeOf(h.cost, basis.cost)}
            foot={parts.length ? <ShareBar items={parts} format="eur" legendValues={false} /> : undefined}
            hintKey="overview.cost"
            to="/costs"
            firstLoad={firstLoad}
          />
        </div>
        <div className={CELL}>
          <KpiTile
            className="h-full"
            label={t('overview.tile.payers')}
            valueText={data ? fmt.countOf(h.payingActive, h.active) : undefined}
            format="text"
            delta={metric.delta((d) => d.headline.payingActive, 'abs')}
            compareLabel={compareLabel}
            goodWhen="up"
            badge={badgeOf(h.payingActive, basis.payingActive)}
            sub={h.paidCostShare === null || h.paidCostShare === undefined ? undefined : t('overview.payers.sub', { share: fmt.pct(h.paidCostShare) })}
            hintKey="overview.payers"
            to="/doctors"
            firstLoad={firstLoad}
          />
        </div>
        <div className={CELL}>
          <KpiTile
            className="h-full"
            label={t('overview.tile.work')}
            value={h.forms}
            format="int"
            unit={plural(h.forms ?? 0, 'common.unit.form')}
            delta={metric.delta((d) => d.headline.forms, 'pct')}
            compareLabel={compareLabel}
            goodWhen="up"
            spark={sparkOf(series, 'forms')}
            hintKey="overview.work"
            to="/requests"
            firstLoad={firstLoad}
          />
        </div>
        <div className={CELL}>
          <KpiTile
            className="h-full"
            label={t('overview.tile.health')}
            valueText={h.health ? t(`overview.health.${h.health}`) : undefined}
            format="text"
            badge={badgeOf(h.health, basis.health)}
            sub={healthSub}
            spark={sparkOf(series, 'slowCount')}
            hintKey="overview.health"
            to="/models"
            firstLoad={firstLoad}
          />
        </div>
      </div>
    </section>
  );
}
