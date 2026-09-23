import React, { useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import useIsPhone from '../context/useIsPhone.js';
import { usePrintMode } from '../context/usePrintMode.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

const SCROLLER = 'sf-table-scroll -mx-3 overflow-x-auto rounded-[16px]';
const TABLE = 'w-full border-separate border-spacing-0 text-sm';

// Headers: sentence case, 12 px, semibold, ink-soft (§5.3.4).
const TH = 'group sticky top-0 z-[1] bg-surface px-3 py-2.5 text-left text-xs font-semibold text-ink-soft border-b border-line/60 whitespace-nowrap';
const TH_RIGHT = 'group sticky top-0 z-[1] bg-surface px-3 py-2.5 text-right text-xs font-semibold text-ink-soft border-b border-line/60 whitespace-nowrap';
const STICKY_FIRST = 'sticky left-0 z-[2] bg-surface';
const SORT_BUTTON = 'inline-flex items-center gap-1 rounded-[6px] hover:text-ink text-xs font-semibold print:hidden';

const TD = 'px-3 py-3 border-b border-line/40 font-medium text-ink-soft group-hover:bg-line/10';
const TD_FIRST = 'px-3 py-3 border-b border-line/40 font-semibold text-ink text-left group-hover:bg-line/10';
const TD_MUTED = 'px-3 py-3 border-b border-line/40 font-medium text-ink-soft group-hover:bg-line/10';
const TD_TOTAL = 'px-3 py-3 font-extrabold text-ink border-t border-line';

const CARD = 'rounded-[16px] border border-line/60 bg-surface p-4';
const SHOW_ALL = `mt-3 inline-flex items-center h-9 px-3.5 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink-soft hover:bg-line/20 transition-colors print:hidden ${RING}`;
const SELECT = `h-9 max-w-full rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-ink ${RING}`;

const NUMERIC_TYPES = ['int', 'dec', 'pct', 'pp', 'eur', 'eurSigned', 'eurUnit', 'usd', 'credits', 'tokens', 'sec', 'ms', 'minutes', 'duration', 'bar', 'signedBar', 'hours', 'decimal'];
const NEXT_DIR = { none: 'desc', desc: 'asc', asc: 'none' };
const ARIA_SORT = { asc: 'ascending', desc: 'descending', none: 'none' };
/** Tables with at most this many columns scroll sideways on phones instead of turning into cards. */
const PHONE_TABLE_MAX_COLUMNS = 4;
/** Rows (or phone cards) shown before "Show all N". A hidden inner scroll box made long tables look cut off. */
const ROW_LIMIT = 10;

const isRight = (column) => (column.align ? column.align === 'right' : NUMERIC_TYPES.includes(column.type));
const canSort = (column) => column.sortable !== false && (column.type !== 'node' || typeof column.sortValue === 'function');
const sortValueOf = (column, row) => (typeof column.sortValue === 'function' ? column.sortValue(row) : row[column.key]);

// Empty values always sink to the bottom, in both directions.
const compare = (a, b, dir) => {
  const emptyA = a == null || a === '';
  const emptyB = b == null || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  const order =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? order : -order;
};

function BarCell({ value, column }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fmt.value(value, column.format ?? 'pct');
  const ratio = Math.min(1, Math.max(0, value / (column.max ?? 1)));
  return (
    <span className="flex items-center justify-end gap-2">
      <span aria-hidden="true" className="w-16 h-1.5 rounded-full bg-brand/10 overflow-hidden">
        <span className="block h-full rounded-full bg-brand" style={{ width: `${ratio * 100}%`, minWidth: ratio > 0 ? 2 : 0 }} />
      </span>
      <span className="min-w-11">{fmt.value(value, column.format ?? 'pct')}</span>
    </span>
  );
}

// Bars left (negative, bad) or right (positive, brand) of one zero line; `column.max` = the largest |value|.
function SignedBarCell({ value, column }) {
  const text = fmt.value(value, column.format ?? 'eurSigned');
  if (typeof value !== 'number' || !Number.isFinite(value)) return text;
  const ratio = Math.min(1, Math.abs(value) / (column.max || Math.abs(value) || 1));
  const width = `${ratio * 100}%`;
  return (
    <span className="flex items-center justify-end gap-2">
      <span aria-hidden="true" className="relative flex w-20 h-2">
        <span className="flex-1 flex justify-end">{value < 0 && <span className="h-full rounded-l-[3px] bg-bad" style={{ width, minWidth: 2 }} />}</span>
        <span className="w-px h-3 -mt-0.5 bg-ink-mute" />
        <span className="flex-1 flex">{value > 0 && <span className="h-full rounded-r-[3px] bg-brand" style={{ width, minWidth: 2 }} />}</span>
      </span>
      <span className="min-w-14">{text}</span>
    </span>
  );
}

const renderCell = (column, row) => {
  if (typeof column.render === 'function') return column.render(row);
  const value = row[column.key];
  if (column.type === 'node') return value ?? fmt.empty;
  if (column.type === 'bar') return <BarCell value={value} column={column} />;
  if (column.type === 'signedBar') return <SignedBarCell value={value} column={column} />;
  return fmt.value(value, column.format ?? column.type ?? 'text');
};

function useSortedRows(rows, columns, sort) {
  return useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    const column = sort ? columns.find((c) => c.key === sort.key) : null;
    if (!column) return list;
    return list
      .map((row, index) => ({ row, index }))
      .sort((a, b) => compare(sortValueOf(column, a.row), sortValueOf(column, b.row), sort.dir) || a.index - b.index)
      .map((entry) => entry.row);
  }, [rows, columns, sort]);
}

function PhoneCards({ columns, rows, sort, setSort, defaultSort, emptyText, caption }) {
  const selectId = useId();
  const [first, ...rest] = columns;
  const primary = rest.filter((column) => (column.priority ?? 1) === 1);
  const secondary = rest.filter((column) => (column.priority ?? 1) > 1);
  const sortable = columns.filter(canSort);
  const current = sort ? `${sort.key}:${sort.dir}` : '';

  return (
    <div role="region" aria-label={caption ?? t('common.table.caption')}>
      {sortable.length > 0 && (
        <div className="mb-3 flex items-center gap-2 print:hidden">
          <label htmlFor={selectId} className="sr-only">
            {t('common.sortLabel')}
          </label>
          <select
            id={selectId}
            className={SELECT}
            value={current}
            onChange={(event) => {
              const [key, dir] = event.target.value.split(':');
              setSort(key ? { key, dir } : null);
            }}
          >
            {!defaultSort && <option value="">{t('common.sortBy', { col: t('common.sortNone') })}</option>}
            {sortable.flatMap((column) => [
              <option key={`${column.key}:desc`} value={`${column.key}:desc`}>
                {t('common.sortBy', { col: `${column.header} ↓` })}
              </option>,
              <option key={`${column.key}:asc`} value={`${column.key}:asc`}>
                {t('common.sortBy', { col: `${column.header} ↑` })}
              </option>,
            ])}
          </select>
        </div>
      )}
      {rows.length === 0 && <p className="py-6 text-center text-sm font-medium text-ink-mute">{emptyText ?? t('common.list.empty')}</p>}
      <ul role="list" className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={row.key ?? row.id ?? index} className={CARD}>
            <p className="text-sm font-bold text-ink sf-wrap-any">{renderCell(first, row)}</p>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
              {primary.map((column) => (
                <React.Fragment key={column.key}>
                  <dt className="font-medium text-ink-soft">{column.header}</dt>
                  <dd className="text-right font-semibold text-ink tabular-nums sf-wrap-any">{renderCell(column, row)}</dd>
                </React.Fragment>
              ))}
            </dl>
            {secondary.length > 0 && (
              <details className="group/more mt-2">
                <summary className={`inline-flex items-center gap-1 cursor-pointer list-none rounded-[6px] text-xs font-bold text-brand ${RING}`}>
                  {t('common.showMore')}
                  <ChevronDown className="w-3.5 h-3.5 transition-transform group-open/more:rotate-180" aria-hidden="true" />
                </summary>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                  {secondary.map((column) => (
                    <React.Fragment key={column.key}>
                      <dt className="font-medium text-ink-soft">{column.header}</dt>
                      <dd className="text-right font-semibold text-ink tabular-nums sf-wrap-any">{renderCell(column, row)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The table twin of a chart, and the plain tables of the pages.
//   columns     [{ key, header, type: 'text'|'int'|'pct'|'eur'|…|'bar'|'signedBar'|'node', align?, sortable = true,
//                  format?, render?(row), sortValue?(row), max? (bar scale), printHide?, priority: 1 | 2 | 3 }]
//               priority (§3.2): below 640 px each row becomes a card — title = first column, priority-1 columns as
//               "Header: value" lines, priority 2–3 behind "More details". Tables with ≤ 4 columns scroll sideways
//               with a sticky first column instead. Every page table declares `priority` for every column.
//   rows        objects keyed by column.key; `row.key` or `row.id` identifies a row, `row.muted` greys it
//   defaultSort { key, dir: 'asc' | 'desc' } | null — null keeps the given order
//   limit       rows shown before "Show all N", counted after sorting (default 10; 0 = all); a print shows all
//   footerRow   totals row, same keys as a row
//   caption     accessible name of the table
//   phone       force (true/false) the phone card mode; defaults to the screen width
//   phoneRows   the same for the phone cards (defaults to `limit`)
// A header click sorts descending, then ascending, then returns to the default order.
export default function DataTable({
  columns = [],
  rows = [],
  defaultSort = null,
  limit = ROW_LIMIT,
  footerRow,
  emptyText,
  caption,
  phone,
  phoneRows,
  className = '',
}) {
  const [userSort, setUserSort] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const sort = userSort ?? defaultSort;
  const sortedRows = useSortedRows(rows, columns, sort);
  const isPhone = useIsPhone();
  const { printing } = usePrintMode();
  const phoneMode = phone ?? isPhone;
  const cards = phoneMode && columns.length > PHONE_TABLE_MAX_COLUMNS;

  const cap = cards ? phoneRows ?? limit : limit;
  const canCut = !printing && cap > 0 && sortedRows.length > cap;
  const shownRows = canCut && !showAll ? sortedRows.slice(0, cap) : sortedRows;
  const toggle = canCut && (
    <button type="button" onClick={() => setShowAll((open) => !open)} aria-expanded={showAll} className={SHOW_ALL}>
      {showAll ? t('common.list.showFewer') : t('common.list.showAll', { n: fmt.int(sortedRows.length) })}
    </button>
  );

  if (cards) {
    return (
      <div className={className}>
        <PhoneCards
          columns={columns}
          rows={shownRows}
          sort={sort}
          setSort={setUserSort}
          defaultSort={defaultSort}
          emptyText={emptyText}
          caption={caption}
        />
        {toggle}
      </div>
    );
  }

  const dirOf = (column) => (sort && sort.key === column.key ? sort.dir : 'none');
  const toggleSort = (column) => {
    let next = NEXT_DIR[dirOf(column)];
    if (next === 'none' && !userSort && defaultSort?.key === column.key) next = NEXT_DIR.none;
    setUserSort(next === 'none' ? null : { key: column.key, dir: next });
  };
  const stickyFirst = phoneMode ? ` ${STICKY_FIRST}` : '';

  return (
    <div className={className || undefined}>
      <div
        className={[SCROLLER, RING].join(' ')}
        role="region"
        aria-label={caption ?? t('common.table.caption')}
        tabIndex={0}
      >
        <table className={TABLE}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((column, columnIndex) => {
                const dir = dirOf(column);
                const sticky = columnIndex === 0 ? stickyFirst : '';
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={canSort(column) ? ARIA_SORT[dir] : undefined}
                    data-print={column.printHide ? 'hide' : undefined}
                    className={`${isRight(column) ? TH_RIGHT : TH}${sticky}`}
                  >
                    {canSort(column) ? (
                      <>
                        <button type="button" onClick={() => toggleSort(column)} className={`${SORT_BUTTON} ${RING}`}>
                          {column.header}
                          {dir === 'asc' && <ArrowUp className="w-3 h-3 text-brand" aria-hidden="true" />}
                          {dir === 'desc' && <ArrowDown className="w-3 h-3 text-brand" aria-hidden="true" />}
                        </button>
                        <span className="hidden print:inline">{column.header}</span>
                      </>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, columns.length)} className="px-3 py-8 text-center text-sm font-medium text-ink-mute">
                  {emptyText ?? t('common.list.empty')}
                </td>
              </tr>
            )}
            {shownRows.map((row, rowIndex) => (
              <tr key={row.key ?? row.id ?? rowIndex} className="group">
                {columns.map((column, columnIndex) => {
                  const align = isRight(column) ? ' text-right tabular-nums' : '';
                  const hidden = column.printHide ? 'hide' : undefined;
                  if (columnIndex === 0) {
                    return (
                      <th key={column.key} scope="row" data-print={hidden} className={`${row.muted ? `${TD_MUTED} text-left` : TD_FIRST}${stickyFirst}`}>
                        {renderCell(column, row)}
                      </th>
                    );
                  }
                  return (
                    <td key={column.key} data-print={hidden} className={`${row.muted ? TD_MUTED : TD}${align}`}>
                      {renderCell(column, row)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>

          {footerRow && sortedRows.length > 0 && (
            <tfoot>
              <tr>
                {columns.map((column, columnIndex) => {
                  const align = isRight(column) ? ' text-right tabular-nums' : ' text-left';
                  const Cell = columnIndex === 0 ? 'th' : 'td';
                  return (
                    <Cell key={column.key} scope={columnIndex === 0 ? 'row' : undefined} data-print={column.printHide ? 'hide' : undefined} className={`${TD_TOTAL}${align}`}>
                      {footerRow[column.key] == null ? '' : renderCell(column, footerRow)}
                    </Cell>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {toggle}
    </div>
  );
}
