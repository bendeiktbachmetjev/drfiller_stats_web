import React, { useId, useMemo } from 'react';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import InsightRow from './InsightRow.jsx';
import { usePrintNotes } from './PrintAppendix.jsx';

const textOfNote = (note) => (typeof note === 'string' ? note : fmt.textOf(note));

/**
 * Closing block of a page: only the rules that really applied to the numbers above (§3.2).
 *   notes  ready sentences, or AreaResult.notes items `{ key, values }` (translated here with fmt.textOf)
 * On paper the same sentences are printed by PrintAppendix (they register here), so this
 * block is hidden in print to avoid saying everything twice.
 */
export default function DataNotes({ notes = [], hint }) {
  const headingId = useId();
  const list = useMemo(() => (Array.isArray(notes) ? notes.map(textOfNote).filter(Boolean) : []), [notes]);
  usePrintNotes(list);

  if (list.length === 0) return null;

  return (
    <section className="mt-12 print:hidden" aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-1.5 text-xs font-bold text-ink-soft">
        {t('common.notes.title')}
      </h2>
      {hint && <p className="mb-2 text-xs font-semibold text-ink-soft">{hint}</p>}
      {list.map((note) => (
        <InsightRow key={note} tone="quiet" parts={[{ t: note }]} />
      ))}
    </section>
  );
}
