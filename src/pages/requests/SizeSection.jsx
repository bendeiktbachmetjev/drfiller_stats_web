import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, DataTable, Disclosure, KpiTile, SectionTitle } from '../../ui/index.js';
import { fmt } from '../../format/format.js';
import { t } from '../../copy/index.js';
import { MIN_FORMS_FOR_FIT } from '../../data/metrics/requests.js';
import SegmentCard from './SegmentCard.jsx';
import SizeBars from './SizeBars.jsx';
import { priciestColumns } from './tables.jsx';

export const KPI_GRID = 'grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-4';

const LINK = 'font-bold text-brand hover:text-brand-strong rounded-[6px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * "How big the forms are" (§4.4 anchor #size): four tiles, the size buckets, a link to the monthly growth
 * on Costs, and — behind "Show the math" — the doctor groups and the most expensive forms.
 *   metric   the useRequests() result     doctors  ds.doctors (names for the table)
 *   segment / onSegment   the doctor grouping of the groups card
 */
export default function SizeSection({ metric, doctors, segment, onSegment }) {
  const data = metric.data;
  const h = data?.headline ?? {};
  const basis = data?.basis ?? {};
  const tables = data?.tables ?? {};
  const firstLoad = metric.status === 'loading' && !data;
  const fit = tables.fit?.[0];
  const tile = { compareLabel: metric.compareLabel, firstLoad };

  const buckets = tables.sizeBuckets ?? [];

  return (
    <section aria-label={t('requests.section.size')}>
      <SectionTitle id="size" title={t('requests.section.size')} />
      <div className={KPI_GRID}>
        <KpiTile
          {...tile}
          label={t('requests.tile.promptMean')}
          value={h.promptMean}
          format="tokens"
          sub={t('requests.tile.promptMean.sub', { pages: fmt.pages(h.promptMean) })}
          delta={metric.delta((d) => d.headline.promptMean)}
          goodWhen="down"
          badge={basis.promptMean}
          hintKey="requests.promptMean"
        />
        <KpiTile
          {...tile}
          label={t('requests.tile.outputMean')}
          value={h.outputMean}
          format="tokens"
          sub={t('requests.tile.outputMean.sub', { pages: fmt.pages(h.outputMean) })}
          delta={metric.delta((d) => d.headline.outputMean)}
          goodWhen="down"
          badge={basis.outputMean}
          hintKey="requests.outputMean"
        />
        <KpiTile
          {...tile}
          label={t('requests.tile.baseTokens')}
          wide
          value={h.baseTokens}
          format="tokens"
          sub={
            Number.isFinite(h.baseTokens)
              ? t('requests.tile.baseTokens.sub', { share: fmt.pct(h.baseShare) })
              : t('requests.tile.baseTokens.few', { needed: fmt.int(MIN_FORMS_FOR_FIT), n: fmt.int(fit?.used ?? 0) })
          }
          delta={metric.delta((d) => d.headline.baseTokens)}
          goodWhen="down"
          badge={basis.baseTokens === 'estimate' ? 'estimate' : undefined}
          hintKey="requests.baseTokens"
        />
        <KpiTile
          {...tile}
          label={t('requests.tile.bigShare')}
          wide
          value={h.bigShare}
          format="pct"
          sub={t('requests.tile.bigShare.sub', { share: fmt.pct(h.bigCostShare) })}
          delta={metric.delta((d) => d.headline.bigShare, 'pp')}
          goodWhen="down"
          badge={basis.bigShare}
          hintKey="requests.bigShare"
        />
      </div>

      {buckets.length > 0 && (
        <Card padding="none" className="mt-3 md:mt-6 p-4 sm:p-6">
          <CardHeader title={t('requests.sizeBuckets.title')} hintKey="requests.sizeBuckets" />
          <SizeBars rows={buckets} />
        </Card>
      )}
      <p className="mt-3 text-sm font-medium text-ink-soft">
        {t('requests.monthLink.lead')}{' '}
        <Link to="/costs" className={LINK}>
          {t('requests.monthLink.link')}
        </Link>
      </p>

      <Disclosure id="requests.size">
        <div className="flex flex-col gap-3 md:gap-6">
          <SegmentCard rows={tables.bySegment} choices={tables.segmentGroups} segment={segment} onSegment={onSegment} />
          {(tables.priciest?.length ?? 0) > 0 && (
            <Card padding="none" className="p-4 sm:p-6">
              <CardHeader title={t('requests.priciest.title')} hintKey="requests.priciest" />
              <DataTable
                columns={priciestColumns(doctors)}
                rows={tables.priciest}
                defaultSort={{ key: 'costEur', dir: 'desc' }}
                caption={t('requests.priciest.title')}
              />
            </Card>
          )}
        </div>
      </Disclosure>
    </section>
  );
}
