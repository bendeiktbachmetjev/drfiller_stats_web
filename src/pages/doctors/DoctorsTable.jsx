import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Card, CardHeader, DataTable, InfoHint, Segmented, planChipsText, scenarioLabel } from '../../ui/index.js';
import useIsPhone from '../../context/useIsPhone.js';
import { def, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { doctorColumns } from './columns.jsx';
import { useEmailReveal } from './hooks.js';

const COLUMNS_KEY = 'drfiller.admin.doctors.allColumns';
/** The table lists the 20 first doctors (in the chosen order); "Show all N" opens the rest. */
const FIRST_ROWS = 20;
const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const INPUT = `h-9 w-full rounded-full border border-line bg-surface pl-9 pr-3 text-[13px] font-semibold text-ink placeholder:font-medium placeholder:text-ink-mute ${RING}`;
const TEXT_BUTTON = `relative inline-flex items-center h-9 px-3.5 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink-soft hover:bg-line/20 transition-colors after:absolute after:-inset-1 print:hidden ${RING}`;

const readAllColumns = () => {
  try {
    return window.localStorage.getItem(COLUMNS_KEY) === '1';
  } catch {
    return false;
  }
};
const writeAllColumns = (on) => {
  try {
    window.localStorage.setItem(COLUMNS_KEY, on ? '1' : '0');
  } catch {
    // Private mode: the choice lasts until the page is left.
  }
};

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
 * The Doctors table card (§4.8): plan line, "Active | All (n)", search, the table (phone: cards) and the
 * mine/test toggles. Sorted by costs, highest first. `rows` = the view's rows after the page's search.
 * @param {{ data: object, rows: object[], ds: object|null, view: 'active'|'all', onView: (v: string) => void, search: string,
 *   onSearch: (q: string) => void, toggle: { busy: boolean, message: object|null, toggle: Function } }} props
 */
export default function DoctorsTable({ data, rows, ds, view, onView, search, onSearch, toggle }) {
  const isPhone = useIsPhone();
  const [allColumns, setAllColumns] = useState(readAllColumns);
  const { emails, reveal } = useEmailReveal();
  const emailMode = ds?.emailMode ?? 'off';

  const columns = useMemo(
    () =>
      doctorColumns({
        ds, rows, emailMode, emails, onReveal: reveal, busy: toggle.busy, onToggle: toggle.toggle,
        showMonth: data.tables.doctors.some((row) => row.costPerMonthEur !== null) || rows.length === 0,
        allColumns: isPhone || allColumns,
      }),
    [ds, rows, emailMode, emails, reveal, toggle.busy, toggle.toggle, data, isPhone, allColumns],
  );

  const flipColumns = () => {
    writeAllColumns(!allColumns);
    setAllColumns(!allColumns);
  };

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
        {!isPhone && (
          <button type="button" onClick={flipColumns} aria-pressed={allColumns} className={`${TEXT_BUTTON} sm:ml-auto`}>
            {t(allColumns ? 'doctors.columns.fewer' : 'doctors.columns.more')}
          </button>
        )}
      </div>
      {toggle.message && (
        <p role="status" className={`mb-3 text-sm font-semibold ${toggle.message.tone === 'bad' ? 'text-bad' : 'text-ink-soft'}`}>
          {t(toggle.message.key, { reason: toggle.message.reason })}
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
    </Card>
  );
}
