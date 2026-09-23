import React, { useDeferredValue, useMemo, useState } from 'react';
import { useAnalytics, useDoctors } from '../context/AnalyticsContext.jsx';
import { Card, DataNotes, EmptyState, NotRecorded, PageLayout } from '../ui/index.js';
import { STATS_START } from '../data/constants.js';
import { t } from '../copy/index.js';
import { fmt } from '../format/format.js';
import { ClassCard, FunnelCard } from './doctors/ClassCard.jsx';
import DoctorTiles from './doctors/DoctorTiles.jsx';
import DoctorsTable from './doctors/DoctorsTable.jsx';
import SuggestionRow from './doctors/SuggestionRow.jsx';
import { useInternalToggle } from './doctors/hooks.js';
import { answerItemsOf, exportTablesOf, itemText } from './doctors/text.js';

/**
 * Doctors (§4.8): who uses Dr.Filler, who pays and what each doctor costs. PageLayout fixes the top
 * (header, filter row, answer, hidden-accounts note, source banners); then tiles → costs by account type
 * next to the doctor's path → "Is this your account?" → the doctors table → notes → footnote.
 * Business page: every number follows "Without my and test accounts".
 */
export default function DoctorsPage() {
  const [view, setView] = useState('active');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const metric = useDoctors({ view, search: deferredSearch.trim() });
  const { dataset: ds } = useAnalytics();
  const toggle = useInternalToggle();
  const { data, period } = metric;

  const answerItems = useMemo(() => answerItemsOf(data, period, ds), [data, period, ds]);
  const exportTables = useMemo(() => exportTablesOf(data, period, ds), [data, period, ds]);
  const notes = useMemo(() => (data?.notes ?? []).map((note) => itemText(note, ds)), [data, ds]);

  return (
    <PageLayout id="doctors" metric={metric} sources={['usage', 'doctors', 'revenue']} answerItems={answerItems} exportTables={exportTables}>
      <div className="flex flex-col gap-6 md:gap-8">
        {data?.empty ? (
          <Card>
            <EmptyState title={t('common.list.empty')} hint={t('common.statsStart', { date: fmt.date(STATS_START) })} action="widen" />
          </Card>
        ) : (
          <DoctorTiles metric={metric} ds={ds} />
        )}
        {data && (
          <>
            <div className="grid grid-cols-1 items-start gap-6 md:gap-8 lg:grid-cols-12">
              {!data.empty && (
                <div className="min-w-0 lg:col-span-7">
                  <ClassCard data={data} />
                </div>
              )}
              <div className={`min-w-0 ${data.empty ? 'lg:col-span-12' : 'lg:col-span-5'}`}>
                <FunnelCard data={data} />
              </div>
            </div>
            <SuggestionRow row={data.tables.suggestion[0]} ds={ds} busy={toggle.busy} onMark={toggle.toggle} />
            <DoctorsTable data={data} ds={ds} view={view} onView={setView} search={search} onSearch={setSearch} toggle={toggle} />
          </>
        )}
      </div>
      <DataNotes notes={notes} />
      <NotRecorded />
    </PageLayout>
  );
}
