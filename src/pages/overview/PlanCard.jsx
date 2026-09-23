import React from 'react';
import { Card, CardHeader, ScaleProjection } from '../../ui/index.js';
import { fmt } from '../../format/format.js';
import { fillHint, t } from '../../copy/index.js';

/**
 * "Now and on the plan" (§4.1): ONE row, the result per month — now, per doctor and at both planned
 * scales — with the assumption chips and "Change". The full table lives on Money.
 *   projection  AreaResult.projection (the plan ScaleResult)
 */
export default function PlanCard({ projection, className = '' }) {
  const visits = projection?.scenario?.visitsPerDoctorMonth;
  const rows = [{ key: 'resultEur', label: t('overview.scale.row'), format: 'eurSigned' }];
  return (
    <Card padding="lg" className={['min-w-0', className].filter(Boolean).join(' ')}>
      <CardHeader
        title={t('overview.scale.title')}
        hint={Number.isFinite(visits) ? fillHint('overview.scale', { visits: fmt.int(visits) }) : undefined}
        hintKey="overview.scale"
        className="mb-3"
      />
      {projection && <ScaleProjection compact data={projection} rows={rows} />}
    </Card>
  );
}
