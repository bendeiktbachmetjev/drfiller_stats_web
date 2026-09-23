import React from 'react';
import { BarList, Card, CardHeader, Segmented, SourceBadge } from '../../ui/index.js';
import { fmt } from '../../format/format.js';
import { plural, t } from '../../copy/index.js';

const groupLabel = (row, segment) => {
  if (row.isOther) return t('requests.segment.other');
  if (segment === 'detail') return t(`requests.segment.${row.group}`);
  return row.group;
};

/**
 * "Whose forms cost more": mean € per form by specialty or by form detail (§4.4 `requests.bySegment`).
 * Renders nothing unless the metric found two groups of three doctors or more for some grouping.
 *   rows      tables.bySegment for `segment`
 *   choices   tables.segmentGroups ([{ key, shown }])
 *   segment   the grouping the rows belong to; onSegment switches it
 */
export default function SegmentCard({ rows = [], choices = [], segment, onSegment }) {
  const options = choices.filter((choice) => choice.shown).map((choice) => ({ value: choice.key, label: t(`requests.segment.${choice.key}`) }));
  if (rows.length === 0 || options.length === 0) return null;
  const items = rows.map((row) => ({
    key: row.key,
    label: groupLabel(row, segment),
    value: row.meanEur,
    muted: row.isOther,
    sub: t('requests.segment.sub', {
      forms: `${fmt.int(row.forms)} ${plural(row.forms, 'common.unit.form')}`,
      doctors: `${fmt.int(row.doctors)} ${plural(row.doctors, 'common.unit.doctor')}`,
      pages: fmt.pages(row.meanTok),
    }),
  }));
  return (
    <Card padding="none" className="p-4 sm:p-6">
      <CardHeader
        title={t('requests.bySegment.title')}
        hintKey="requests.bySegment"
        right={<SourceBadge basis="estimate" />}
      />
      {options.length > 1 && (
        <Segmented className="mb-4" ariaLabel={t('requests.bySegment.choose')} options={options} value={segment} onChange={onSegment} />
      )}
      <BarList items={items} format="eurUnit" maxRows={items.length} />
    </Card>
  );
}
