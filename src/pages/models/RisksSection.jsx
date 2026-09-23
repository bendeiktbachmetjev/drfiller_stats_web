import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { DataTable, SectionTitle } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { riskColumns } from './columns.jsx';
import TableCard from './TableCard.jsx';

/** Risks and dates (§4.6 #risks): the most urgent first (attention, then by date); period-independent. */
export default function RisksSection({ rows = [] }) {
  return (
    <section aria-labelledby="risks">
      <SectionTitle id="risks" title={t('models.section.risks')} description={t('models.section.risksSub')} />
      <TableCard title={t('models.risks.title')} icon={ShieldAlert} hintKey="models.risks">
        <DataTable columns={riskColumns()} rows={rows} caption={t('models.risks.title')} maxHeight={null} />
      </TableCard>
    </section>
  );
}
