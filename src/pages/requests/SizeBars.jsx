import React from 'react';
import { BarList } from '../../ui/index.js';
import { fmt } from '../../format/format.js';
import { plural, t } from '../../copy/index.js';

/**
 * "Big and small forms": share of forms (grey) and share of costs (blue) per size bucket (the kit's
 * compare BarList; it stacks each row on phones).
 *   rows  tables.sizeBuckets
 */
export default function SizeBars({ rows = [] }) {
  const series = [
    { key: 'formShare', label: t('requests.sizeBuckets.forms') },
    { key: 'costShare', label: t('requests.sizeBuckets.cost') },
  ];
  const items = rows.map((row) => ({
    key: row.key,
    label: fmt.textOf(row.label),
    detail: fmt.textOf(row.detail),
    formShare: row.formShare,
    costShare: row.costShare,
    sub: `${fmt.int(row.forms)} ${plural(row.forms, 'common.unit.form')}`,
  }));
  return <BarList items={items} variant="compare" format="pct" maxRows={rows.length} series={series} />;
}
