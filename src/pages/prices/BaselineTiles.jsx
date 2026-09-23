import React from 'react';
import { KpiTile } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

/**
 * Today, for comparison (§4.7): the four numbers every option is compared with — one form now, forms only per
 * doctor per month, the usual time of a form and how many of our forms these rest on. No period, so no change
 * against an earlier window. Money tiles span both columns on phones, count tiles share a row.
 *   data     the Prices AreaResult     visits   planning.visitsPerDoctorMonth     firstLoad
 */
export default function BaselineTiles({ data, visits, firstLoad = false }) {
  const h = data?.headline ?? {};
  const b = data?.basis ?? {};
  const fromTest = b.oursP50Ms === 'model';
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-4">
      <KpiTile
        label={t('prices.tile.form')}
        value={h.oursEurPerForm}
        format="eurUnit"
        sub={t('prices.tile.sub.form')}
        badge={b.oursEurPerForm}
        hintKey="prices.form"
        firstLoad={firstLoad}
      />
      <KpiTile
        label={t('prices.tile.perDoctor')}
        value={h.oursPerDoctorEur}
        format="eur"
        sub={t('prices.tile.sub.perDoctor', { visits: fmt.int(visits) })}
        badge={b.oursPerDoctorEur}
        hintKey="prices.perDoctor"
        hintValues={{ visits: fmt.int(visits) }}
        firstLoad={firstLoad}
      />
      <KpiTile
        label={t('prices.tile.speed')}
        value={h.oursP50Ms}
        format="sec"
        sub={t(fromTest ? 'prices.tile.sub.speedTest' : 'prices.tile.sub.speed')}
        badge={b.oursP50Ms}
        hintKey="prices.usual"
        wide={fromTest}
        firstLoad={firstLoad}
      />
      <KpiTile
        label={t('prices.tile.forms')}
        value={h.oursForms}
        format="int"
        sub={t('prices.tile.sub.forms')}
        goodWhen="none"
        hintKey="prices.forms"
        wide={fromTest}
        firstLoad={firstLoad}
      />
    </div>
  );
}
