import React, { useState } from 'react';
import { Card, CardHeader, DataTable } from '../../ui/index.js';
import { fmt } from '../../format/format.js';
import { t } from '../../copy/index.js';

const FIRST_ROWS = 20;
const MORE_ROWS = 100;
const BUTTON_CLASS =
  'mt-3 inline-flex items-center h-9 px-3.5 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink hover:bg-line/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent print:hidden';

/**
 * A card with one event table, newest first. Long lists show 20 rows and grow by 100 on request
 * (the planned scenario has tens of thousands of conversations; the CSV export always has all of them).
 *   note  a sentence shown instead of the table (e.g. "not logged yet")
 */
export default function TableCard({ title, hintKey, columns, rows = [], emptyText, note, className = '' }) {
  const [count, setCount] = useState(FIRST_ROWS);
  const shown = rows.length > count ? rows.slice(0, count) : rows;
  const rest = rows.length - shown.length;
  return (
    <Card padding="none" className={['min-w-0 p-4 sm:p-6 lg:p-8', className].filter(Boolean).join(' ')}>
      <CardHeader title={title} hintKey={hintKey} />
      {note ? (
        <p className="text-sm font-medium text-ink-soft">{note}</p>
      ) : (
        <>
          <DataTable columns={columns} rows={shown} emptyText={emptyText} caption={title} limit={0} />
          {rest > 0 && (
            <button type="button" className={BUTTON_CLASS} onClick={() => setCount((n) => n + MORE_ROWS)}>
              {t('recording.showMore', { n: fmt.int(Math.min(rest, MORE_ROWS)), total: fmt.int(rows.length) })}
            </button>
          )}
          {rest === 0 && rows.length > FIRST_ROWS && (
            <button type="button" className={BUTTON_CLASS} onClick={() => setCount(FIRST_ROWS)}>
              {t('common.list.showFewer')}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
