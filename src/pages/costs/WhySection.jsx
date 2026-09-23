import React, { useMemo } from 'react';
import TimeColumns from '../../charts/TimeColumns.jsx';
import TimeLines from '../../charts/TimeLines.jsx';
import { COLORS, SERIES } from '../../charts/theme.js';
import { ChartCard, SectionTitle } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { monthChartRows } from './view.js';

// The price line is drawn in cents with plain numbers on the axis ("0.8"): the €-axis would read
// "€0.00" for every tick, and "0.8¢" does not fit the 32 px phone axis. The title names the unit.
const CENT_FLOOR = 0.1;
const centNumber = (cents) => (Number.isFinite(cents) ? fmt.dec(cents).replace(/\.0$/, '') : fmt.empty);
const monthTitle = (row) => fmt.month(row.key);

/**
 * «Why a form got more expensive» (§4.3): the price of a form and the size of the request by month,
 * over all time (not bound to the period); the months of the period are highlighted.
 */
export default function WhySection({ data }) {
  const rows = useMemo(() => monthChartRows(data.tables.formMonthly), [data]);
  const takeaway = data.takeaways?.whyUp;
  const priceSeries = useMemo(() => [{ key: 'cents', label: t('costs.whyUp.centsPerForm'), color: SERIES.main }], []);
  const priceRows = useMemo(() => rows.map((row) => ({ ...row, cents: Number.isFinite(row.price) ? row.price * 100 : null })), [rows]);
  const pageSeries = useMemo(() => [{ key: 'pages', label: t('costs.col.pages') }], []);
  const legend = [
    { key: 'inPeriod', label: t('costs.whyUp.inPeriod'), color: COLORS.brand, shape: 'rect' },
    { key: 'otherMonths', label: t('costs.whyUp.otherMonths'), color: COLORS['data-mute'], shape: 'rect' },
  ];
  // The table twins list only months with forms (a thin chart points to this list).
  const tableRows = rows.filter((row) => row.forms > 0).map((row) => ({ ...row, month: monthTitle(row) }));
  const monthColumn = { key: 'month', header: t('costs.col.month'), type: 'text', priority: 1, sortValue: (row) => row.key };
  const formsColumn = { key: 'forms', header: t('costs.col.forms'), type: 'int', priority: 1 };

  return (
    <section aria-labelledby="costs-why">
      <SectionTitle id="costs-why" title={t('costs.section.why')} description={takeaway ? fmt.textOf(takeaway) : t('costs.whyUp.lead')} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title={t('costs.whyUp.price')}
          hintKey="costs.whyUp"
          rows={priceRows}
          series={priceSeries}
          height={240}
          table={{
            columns: [monthColumn, formsColumn, { key: 'price', header: t('costs.col.pricePerForm'), type: 'eurUnit', priority: 1 }],
            rows: tableRows,
          }}
        >
          <TimeLines rows={priceRows} series={priceSeries} format={centNumber} yFloor={CENT_FLOOR} />
        </ChartCard>
        <ChartCard
          title={t('costs.whyUp.size')}
          hintKey="costs.whyUpSize"
          rows={rows}
          series={pageSeries}
          height={240}
          legend={legend}
          table={{
            columns: [monthColumn, formsColumn, { key: 'pages', header: t('costs.col.pages'), type: 'dec', priority: 1 }],
            rows: tableRows,
          }}
        >
          <TimeColumns rows={rows} valueKey="pages" muteColor={COLORS['data-mute']} unit={t('costs.whyUp.pagesUnit')} valueFormat="int" />
        </ChartCard>
      </div>
    </section>
  );
}
