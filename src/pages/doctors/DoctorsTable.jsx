import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Card, CardHeader, DataTable, InfoHint, Segmented, planChipsText, scenarioLabel } from '../../ui/index.js';
import { workCountsText } from '../../ui/workCountsText.js';
import { def, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { workCountsOf, workCountsStatus } from '../../data/normalize/workCounts.js';
import { doctorColumns } from './columns.jsx';
import ColumnPicker from './ColumnPicker.jsx';
import { pageStorage, readColumnChoice, shownKeys, writeColumnChoice } from './columnChoice.js';
import { useEmailReveal } from './hooks.js';

/** The table lists the 20 first doctors (in the chosen order); "Show all N" opens the rest. */
const FIRST_ROWS = 20;
const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const INPUT = `h-9 w-full rounded-full border border-line bg-surface pl-9 pr-3 text-[13px] font-semibold text-ink placeholder:font-medium placeholder:text-ink-mute ${RING}`;
const NOTE = 'mt-3 text-[13px] font-medium text-ink-soft';
const LINK_BUTTON = `rounded-[6px] font-semibold text-brand hover:underline print:hidden ${RING}`;

/**
 * The "Columns" choice of this device: read once (blocked storage = the defaults), kept on every change.
 * @returns {{ choice: import('./columnChoice.js').ColumnChoice, kept: boolean, change: (choice: object) => void }}
 */
function useColumnChoice() {
  const [choice, setChoice] = useState(() => readColumnChoice(pageStorage()));
  const [kept, setKept] = useState(true);
  const change = useCallback((next) => {
    setChoice(next);
    setKept(writeColumnChoice(pageStorage(), next));
  }, []);
  return { choice, kept, change };
}

/**
 * The line under the table about the Dr. Filler columns: why they are empty or still loading, or what a "—" in
 * them means. Nothing while no Dr. Filler column is shown.
 */
function workNoteOf(work, period, rows, shownWork) {
  if (!shownWork) return null;
  const status = workCountsStatus(work, period);
  if (status !== 'ok' && status !== 'partial') return workCountsText(status);
  if (rows.some((row) => !workCountsOf(work.counts, row.pid))) return t('doctors.work.dash');
  return workCountsText(status, { firstDay: work.counts?.firstDay });
}

/** The plan line above the table (§4.8): the plan's doctor next to the busiest doctor, both per month. */
function PlanLine({ data }) {
  const h = data.headline;
  const projection = data.projection;
  if (!projection || !Number.isFinite(h.planPerDoctorEur)) return null;
  const hint = def('doctors.costPerMonth');
  const values = { scenario: scenarioLabel(projection.scenario), plan: fmt.eur(h.planPerDoctorEur), top: fmt.eur(h.topPerMonthEur) };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink-soft">
      <p>{t(Number.isFinite(h.topPerMonthEur) ? 'doctors.planLine' : 'doctors.planLine.noTop', values)}</p>
      <InfoHint label={t('doctors.col.costMonth')}>
        <p>{hint?.short}</p>
        {hint?.long && <p className="mt-2">{hint.long}</p>}
        <p className="mt-2">{planChipsText(projection.scenario)}</p>
      </InfoHint>
      <Link to="/settings#planning" className={`rounded-[6px] font-semibold text-brand hover:underline ${RING}`}>
        {t('doctors.planLine.edit')}
      </Link>
    </div>
  );
}

/**
 * The Doctors table card (§4.8): plan line, "Active | All (n)", search, "Columns", the table (phone: cards) and the
 * mine/test toggles. Sorted by costs, highest first. `rows` = the view's rows after the page's search.
 * The Dr. Filler columns read the period's counts by pid (`work`); "Columns" picks what shows, on every screen.
 * @param {{ data: object, rows: object[], ds: object|null, view: 'active'|'all', onView: (v: string) => void, search: string,
 *   onSearch: (q: string) => void, toggle: { busy: boolean, message: object|null, toggle: Function },
 *   onAddCredits?: (pid: string) => void,
 *   clinic?: { list: object[], busy: boolean, onChange: Function, message: { tone: string, text: string }|null } | null,
 *   work?: { status: string, counts: object|null, error: object|null } | null, period?: object|null,
 *   moreWithCounts?: number }} props
 *   work: useWorkCounts(); period: the page's period; moreWithCounts: doctors with Dr. Filler counts the "Active"
 *   view leaves out (no request in the period)
 */
export default function DoctorsTable({ data, rows, ds, view, onView, search, onSearch, toggle, onAddCredits, clinic = null, work = null, period = null, moreWithCounts = 0 }) {
  const { choice, kept, change } = useColumnChoice();
  const { emails, reveal } = useEmailReveal();
  const emailMode = ds?.emailMode ?? 'off';

  // Every column the table has now; "Columns" decides which of them show
  const allColumns = useMemo(
    () =>
      doctorColumns({
        ds, rows, emailMode, emails, onReveal: reveal, busy: toggle.busy, onToggle: toggle.toggle,
        showMonth: data.tables.doctors.some((row) => row.costPerMonthEur !== null) || rows.length === 0,
        allColumns: true,
        onAddCredits,
        clinic,
        work,
      }),
    [ds, rows, emailMode, emails, reveal, toggle.busy, toggle.toggle, data, onAddCredits, clinic, work],
  );
  const columns = useMemo(() => {
    const shown = new Set(shownKeys(allColumns, choice));
    return allColumns.filter((column) => shown.has(column.key));
  }, [allColumns, choice]);
  const workNote = workNoteOf(work, period, rows, columns.some((column) => column.group === 'work'));

  const query = search.trim();
  const emptyText = query ? t('doctors.table.emptySearch', { q: query }) : view === 'active' ? t('doctors.table.emptyActive') : t('common.list.empty');
  const viewOptions = [
    { value: 'active', label: t('doctors.view.active') },
    { value: 'all', label: t('doctors.view.all', { n: fmt.int(data.headline.doctorsAll) }) },
  ];

  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
      <CardHeader title={t('doctors.table.title')} hintKey="doctors.table" />
      <PlanLine data={data} />
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Segmented options={viewOptions} value={view} onChange={onView} ariaLabel={t('doctors.view.label')} />
        <label className="relative min-w-0 flex-1 basis-[200px] sm:max-w-[320px]">
          <span className="sr-only">{t('doctors.search.label')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-ink-mute" aria-hidden="true" />
          <input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t('doctors.search.placeholder')} className={INPUT} />
        </label>
        <ColumnPicker columns={allColumns} choice={choice} onChange={change} kept={kept} className="ml-auto" />
      </div>
      {toggle.message && (
        <p role="status" className={`mb-3 text-sm font-semibold ${toggle.message.tone === 'bad' ? 'text-bad' : 'text-ink-soft'}`}>
          {t(toggle.message.key, { reason: toggle.message.reason })}
        </p>
      )}
      {clinic?.message && (
        <p role="status" className={`mb-3 text-sm font-semibold ${clinic.message.tone === 'bad' ? 'text-bad' : 'text-ink-soft'}`}>
          {clinic.message.text}
        </p>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        limit={FIRST_ROWS}
        defaultSort={{ key: 'costEur', dir: 'desc' }}
        emptyText={emptyText}
        caption={t('doctors.table.title')}
      />
      {view === 'active' && !query && moreWithCounts > 0 && (
        <p className={NOTE}>
          {moreWithCounts === 1 ? t('doctors.work.hidden.one') : t('doctors.work.hidden.other', { n: fmt.int(moreWithCounts) })}{' '}
          <button type="button" onClick={() => onView('all')} className={LINK_BUTTON}>
            {t('doctors.work.showAll')}
          </button>
        </p>
      )}
      {workNote && (
        <p role="status" className={NOTE}>
          {workNote}
        </p>
      )}
    </Card>
  );
}
