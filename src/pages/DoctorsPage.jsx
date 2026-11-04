import React, { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { useAnalytics, useDoctors } from '../context/AnalyticsContext.jsx';
import { Card, DataNotes, EmptyState, NotRecorded, PageLayout } from '../ui/index.js';
import { STATS_START } from '../data/constants.js';
import { matchesSearch } from '../data/metrics/doctors.js';
import { doctorLabel, t } from '../copy/index.js';
import { fmt } from '../format/format.js';
import AddCreditsCard from './doctors/AddCreditsCard.jsx';
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
 * Doctors (§4.8): who uses Dr.Filler, who pays and what each doctor costs. PageLayout fixes the top
 * (header, filter row, answer, hidden-accounts note, source banners); then "Is this your account?" (it changes
 * every average, so it comes first) → tiles → costs by account type next to the doctor's path → the doctors
 * table → notes → footnote. The search filters the table on the page, so typing never recomputes the metric.
 * Business page: every number follows "Without my and test accounts".
 */
export default function DoctorsPage() {
  const [view, setView] = useState('active');
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
  const { data, period } = metric;
  const tableRows = useMemo(
    () => (data?.tables.doctors ?? []).filter((row) => matchesSearch(row, deferredSearch, ds)),
    [data, deferredSearch, ds],
  );

  const answerItems = useMemo(() => answerItemsOf(data, period, ds), [data, period, ds]);
  const exportTables = useMemo(() => exportTablesOf(data, period, ds), [data, period, ds]);
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
            <AddCreditsCard ref={creditsCard} pid={creditPid} onPick={setCreditPid} />
            <DoctorsTable data={data} rows={tableRows} ds={ds} view={view} onView={setView} search={search} onSearch={setSearch} toggle={toggle} onAddCredits={addCreditsFor} clinic={clinicColumn} />
          </>
        )}
      </div>
      <DataNotes notes={notes} />
      <NotRecorded />
    </PageLayout>
  );
}
