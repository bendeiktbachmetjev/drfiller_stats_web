import React, { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { useAnalytics, useDoctors } from '../context/AnalyticsContext.jsx';
import { useWorkCounts } from '../context/useWorkCounts.js';
import { Card, DataNotes, EmptyState, NotRecorded, PageLayout } from '../ui/index.js';
import { STATS_START } from '../data/constants.js';
import { matchesSearch } from '../data/metrics/doctors.js';
import { scopedDoctors } from '../data/core/scope.js';
import { hasWorkCounts } from '../data/normalize/workCounts.js';
import { doctorLabel, t } from '../copy/index.js';
import { fmt } from '../format/format.js';
import TopUpCard from './doctors/TopUpCard.jsx';
import { ClassCard, FunnelCard } from './doctors/ClassCard.jsx';
import DoctorTiles from './doctors/DoctorTiles.jsx';
import DoctorsTable from './doctors/DoctorsTable.jsx';
import SuggestionRow from './doctors/SuggestionRow.jsx';
import { useInternalToggle } from './doctors/hooks.js';
import { answerItemsOf, exportTablesOf, itemText } from './doctors/text.js';
import { useClinicActions } from './clinics/useClinics.js';
import { reasonOf } from './clinics/reason.js';

/**
 * The "Clinic" column's state: which clinic pays for a doctor, changed after a question. Null while the
 * clinic list is not loaded (demo data, or /clinics failed): then the column is left out.
 */
function useClinicColumn(ds) {
  const actions = useClinicActions();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const onChange = useCallback(
    async (pid, nextId) => {
      const doctor = ds?.doctors?.get?.(pid);
      const current = doctor?.clinicId ?? null;
      if (current === nextId) return;
      const name = doctorLabel(doctor);
      const nameOf = (id) => ds?.clinicById?.get?.(id)?.name ?? id;
      let question = t('doctors.clinic.confirmAdd', { name, to: nameOf(nextId) });
      if (!nextId) question = t('doctors.clinic.confirmRemove', { name, from: nameOf(current) });
      else if (current) question = t('doctors.clinic.confirmMove', { name, from: nameOf(current), to: nameOf(nextId) });
      if (!window.confirm(question)) return;
      setBusy(true);
      setMessage(null);
      try {
        if (nextId) await actions.addMember(nextId, pid);
        else await actions.removeMember(current, pid);
        setMessage({ tone: 'good', text: t('doctors.clinic.done', { name, clinic: nextId ? nameOf(nextId) : t('doctors.clinic.none') }) });
      } catch (err) {
        setMessage({ tone: 'bad', text: t('doctors.clinic.error', { reason: reasonOf(err) }) });
      } finally {
        setBusy(false);
      }
    },
    [ds, actions],
  );
  const ready = ds?.sources?.clinics?.status === 'ok';
  return useMemo(() => (ready ? { list: ds.clinics, busy, onChange, message } : null), [ready, ds, busy, onChange, message]);
}

/**
 * How many doctors of the scope have Dr. Filler counts in the period but are not in the "Active" view (no request
 * in it, e.g. Dr. Filler Express only): the table says so and offers "All".
 */
function moreWithCountsOf(work, data, ds, scope, view) {
  if (view !== 'active' || !work?.counts || !data) return 0;
  const listed = new Set(data.tables.doctors.map((row) => row.pid));
  const inScope = new Set(scopedDoctors(ds, scope).map((doctor) => doctor.pid));
  return work.counts.people.filter((person) => inScope.has(person.pid) && !listed.has(person.pid) && hasWorkCounts(person)).length;
}

/**
 * Doctors (§4.8): who uses Dr.Filler, who pays and what each doctor costs. PageLayout fixes the top
 * (header, filter row, answer, hidden-accounts note, source banners); then "Is this your account?" (it changes
 * every average, so it comes first) → tiles → costs by account type next to the doctor's path → the doctors
 * table → notes → footnote. The search filters the table on the page, so typing never recomputes the metric.
 * Business page: every number follows "Without my and test accounts". The table's Dr. Filler columns (what each
 * person did: button presses, Express forms, prescriptions …) come from the period's work counts, loaded beside
 * the dataset (useWorkCounts); a failed load leaves them "—" with a note, never the page.
 */
export default function DoctorsPage() {
  // Every registered account first (the owner, 2026-11-11); "Used in this period" narrows it
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const metric = useDoctors({ view });
  const { dataset: ds } = useAnalytics();
  const toggle = useInternalToggle();
  const clinicColumn = useClinicColumn(ds);
  const [creditPid, setCreditPid] = useState(null);
  const creditsCard = useRef(null);
  const addCreditsFor = useCallback((pid) => {
    setCreditPid(pid);
    creditsCard.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, []);
  const work = useWorkCounts();
  const { data, period, scope } = metric;
  const tableRows = useMemo(
    () => (data?.tables.doctors ?? []).filter((row) => matchesSearch(row, deferredSearch, ds)),
    [data, deferredSearch, ds],
  );
  const moreWithCounts = useMemo(() => moreWithCountsOf(work, data, ds, scope, view), [work, data, ds, scope, view]);

  const answerItems = useMemo(() => answerItemsOf(data, period, ds), [data, period, ds]);
  const exportTables = useMemo(() => exportTablesOf(data, period, ds, work), [data, period, ds, work]);
  const notes = useMemo(() => (data?.notes ?? []).map((note) => itemText(note, ds)), [data, ds]);

  return (
    <PageLayout id="doctors" metric={metric} sources={['usage', 'doctors', 'revenue']} answerItems={answerItems} exportTables={exportTables}>
      <div className="flex flex-col gap-6 md:gap-8">
        {data && <SuggestionRow row={data.tables.suggestion[0]} ds={ds} busy={toggle.busy} onMark={toggle.toggle} />}
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
            <TopUpCard ref={creditsCard} pid={creditPid} onPick={setCreditPid} />
            <DoctorsTable
              data={data}
              rows={tableRows}
              ds={ds}
              view={view}
              onView={setView}
              search={search}
              onSearch={setSearch}
              toggle={toggle}
              onAddCredits={addCreditsFor}
              clinic={clinicColumn}
              work={work}
              period={period}
              moreWithCounts={moreWithCounts}
            />
          </>
        )}
      </div>
      <DataNotes notes={notes} />
      <NotRecorded />
    </PageLayout>
  );
}
