import React from 'react';
import { KpiTile } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { doctorName } from './text.js';

/**
 * The four tiles of the Doctors page (§4.8): active, new, paying, the busiest doctor's share of costs.
 * @param {{ metric: object, ds: object|null }} props metric = useDoctors() result
 */
export default function DoctorTiles({ metric, ds }) {
  const data = metric.data;
  const loading = !data;
  const h = data?.headline ?? {};
  const basis = data?.basis ?? {};
  const topName = h.topPid ? doctorName(ds, h.topPid) : null;

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-4">
      <KpiTile
        label={t('doctors.tile.active')}
        value={h.active}
        format="int"
        goodWhen="up"
        delta={metric.delta((d) => d.headline.active, 'abs')}
        compareLabel={metric.compareLabel}
        badge={basis.active}
        sub={Number.isFinite(h.registered) && h.registered > 0 ? t('doctors.tile.active.sub', { n: fmt.int(h.registered) }) : null}
        hintKey="doctors.active"
        firstLoad={loading}
      />
      <KpiTile
        label={t('doctors.tile.new')}
        value={h.newDoctors}
        format="int"
        goodWhen="up"
        delta={metric.delta((d) => d.headline.newDoctors, 'abs')}
        compareLabel={metric.compareLabel}
        badge={basis.newDoctors}
        sub={h.newDoctors > 0 ? t('doctors.tile.new.sub', { n: fmt.int(h.newActive) }) : null}
        hintKey="doctors.new"
        firstLoad={loading}
      />
      <KpiTile
        label={t('doctors.tile.paying')}
        value={h.paying}
        format="int"
        goodWhen="up"
        delta={metric.delta((d) => d.headline.paying, 'abs')}
        compareLabel={metric.compareLabel}
        badge={basis.paying}
        wide={basis.paying === 'inferred'}
        sub={Number.isFinite(h.payingAll) ? t('doctors.tile.paying.sub', { n: fmt.int(h.payingAll) }) : null}
        hintKey="doctors.paying"
        firstLoad={loading}
      />
      <KpiTile
        label={t('doctors.tile.topShare')}
        value={h.topShare}
        format="pct"
        goodWhen="down"
        delta={metric.delta((d) => d.headline.topShare, 'pp')}
        compareLabel={metric.compareLabel}
        badge={basis.topShare}
        sub={topName}
        hintKey="doctors.topShare"
        hintValues={topName ? { name: topName } : undefined}
        firstLoad={loading}
      />
    </div>
  );
}
