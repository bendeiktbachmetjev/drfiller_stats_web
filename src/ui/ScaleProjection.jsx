import React from 'react';
import { Link } from 'react-router-dom';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import useIsPhone from '../context/useIsPhone.js';
import InfoHint from './InfoHint.jsx';
import SourceBadge from './SourceBadge.jsx';

const COLUMN_HEAD = 'px-3 py-2 text-right text-xs font-semibold text-ink-soft align-bottom';
const CELL = 'px-3 py-2.5 text-right font-semibold text-ink tabular-nums border-t border-line/40';
const ROW_HEAD = 'px-3 py-2.5 text-left font-semibold text-ink-soft border-t border-line/40';
const CHIP = 'inline-flex items-center h-7 px-2.5 rounded-full bg-line/40 text-xs font-semibold text-ink-soft';
const EDIT = 'rounded-[6px] text-xs font-bold text-brand hover:text-brand-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

const PLAN_COLUMNS = new Set(['visit', 'doctor', 's0', 's1']);

const headerOf = (column, data, nowRange) => {
  if (column === 'now') return { title: t('common.col.now'), sub: nowRange ? t('common.col.nowSub', { range: nowRange }) : null };
  if (column === 'nowTotal') return { title: nowRange ?? '', sub: null };
  if (column === 'visit') return { title: t('common.col.visit'), sub: null };
  if (column === 'doctor') return { title: t('common.col.doctor'), sub: null };
  const n = column === 's0' ? data?.scales?.[0] : data?.scales?.[1];
  return { title: t('common.col.scale', { n: fmt.int(n) }), sub: null };
};

const valueOf = (data, column, row) => data?.columns?.[column]?.[row.key] ?? null;

/**
 * Today next to the plan, per month (§3.2 ScaleProjection, §5.3.5):
 *   rows     [{ key: keyof ScaleColumn, label, format, hintKey? }] — e.g. netEur / costTotalEur / resultEur / marginPct
 *   data     ScaleResult (core/projection.js)
 *   columns  default ['now', 'doctor', 's0', 's1']; plan columns carry the "forecast" badge
 *   nowRange the period text for "converted from {range}"
 *   compact  one row, no chips (Overview)
 *   chips    assumption chips (strings); onEdit / editTo  where "Change" goes (default /settings#planning)
 * "Now, per month" is hidden with "To convert to a month we need at least 7 days." when data.now.hidden.
 * Phones: one card per column ("100 doctors: income €…, costs €…, result €…").
 */
export default function ScaleProjection({ rows = [], data, columns = ['now', 'doctor', 's0', 's1'], nowRange, compact = false, chips = [], onEdit, editTo = '/settings#planning', className = '' }) {
  const isPhone = useIsPhone();
  const hideNow = Boolean(data?.now?.hidden);
  const shown = columns.filter((column) => !(hideNow && (column === 'now' || column === 'nowTotal')));

  const editLink = onEdit ? (
    <button type="button" onClick={onEdit} className={EDIT}>
      {t('common.plan.edit')}
    </button>
  ) : (
    <Link to={editTo} className={EDIT}>
      {t('common.plan.edit')}
    </Link>
  );

  return (
    <div className={className}>
      {isPhone ? (
        <ul role="list" className="flex flex-col gap-2">
          {shown.map((column) => {
            const head = headerOf(column, data, nowRange);
            return (
              <li key={column} className="rounded-[16px] border border-line/60 bg-surface p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  {head.title}
                  {PLAN_COLUMNS.has(column) && <SourceBadge basis="model" />}
                </p>
                {head.sub && <p className="text-xs font-medium text-ink-mute">{head.sub}</p>}
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                  {rows.map((row) => (
                    <React.Fragment key={row.key}>
                      <dt className="font-medium text-ink-soft">{row.label}</dt>
                      <dd className="text-right font-semibold text-ink tabular-nums">{fmt.value(valueOf(data, column, row), row.format ?? 'eur')}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="-mx-3 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-ink-soft" />
                {shown.map((column) => {
                  const head = headerOf(column, data, nowRange);
                  return (
                    <th key={column} scope="col" className={COLUMN_HEAD}>
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {head.title}
                        {PLAN_COLUMNS.has(column) && <SourceBadge basis="model" />}
                      </span>
                      {head.sub && <span className="block text-xs font-medium text-ink-mute">{head.sub}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className={ROW_HEAD}>
                    <span className="inline-flex items-center gap-1.5">
                      {row.label}
                      {row.hintKey && <InfoHint hintKey={row.hintKey} label={row.label} />}
                    </span>
                  </th>
                  {shown.map((column) => (
                    <td key={column} className={CELL}>
                      {fmt.value(valueOf(data, column, row), row.format ?? 'eur')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hideNow && columns.includes('now') && <p className="mt-2 text-xs font-medium text-ink-mute">{t('common.nowTooShort')}</p>}
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <span key={chip} className={CHIP}>
              {chip}
            </span>
          ))}
          {editLink}
        </div>
      )}
      {compact && <div className="mt-2">{editLink}</div>}
    </div>
  );
}
