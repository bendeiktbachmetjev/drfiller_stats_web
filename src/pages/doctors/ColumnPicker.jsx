import React, { useId, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';
import { MenuPanel } from '../../ui/index.js';
import useIsPhone from '../../context/useIsPhone.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { EMPTY_CHOICE, LOCKED_COLUMNS, isDefaultChoice, shownKeys, withColumn } from './columnChoice.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const TEXT_BUTTON = `relative inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink-soft hover:bg-line/20 transition-colors after:absolute after:-inset-1 disabled:cursor-not-allowed disabled:text-ink-mute disabled:hover:bg-transparent print:hidden ${RING}`;
const DONE_BUTTON = `inline-flex items-center h-9 px-4 rounded-full bg-brand text-[13px] font-bold text-white hover:bg-brand-strong transition-colors ${RING}`;
const OPTION = 'flex items-start gap-2.5 rounded-[10px] px-2 py-1.5';

/**
 * "Columns" above the Doctors table: a checkbox for every column the table has now, in two groups (the doctor and
 * money; what Dr. Filler did), plus "Show default". The Doctor column is always shown (its box is ticked and
 * locked). A popover under the button on wider screens, a bottom sheet with "Done" on phones; it closes on
 * Escape, a press outside, or Tab past its end.
 * @param {{ columns: Array<{ key: string, header: string, title?: string, group?: string, defaultHidden?: boolean }>,
 *   choice: import('./columnChoice.js').ColumnChoice, onChange: (choice: import('./columnChoice.js').ColumnChoice) => void,
 *   kept?: boolean, className?: string }} props kept = false: this browser does not keep the choice (blocked storage)
 */
export default function ColumnPicker({ columns, choice, onChange, kept = true, className = '' }) {
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelId = useId();
  const shown = new Set(shownKeys(columns, choice));
  const groups = [
    { key: 'main', title: t('doctors.columns.group.main'), columns: columns.filter((column) => column.group !== 'work') },
    { key: 'work', title: t('doctors.columns.group.work'), columns: columns.filter((column) => column.group === 'work') },
  ].filter((group) => group.columns.length > 0);
  const count = t('doctors.columns.count', { n: fmt.int(shown.size), total: fmt.int(columns.length) });
  const firstFree = columns.find((column) => !LOCKED_COLUMNS.includes(column.key))?.key;
  // "Show default" turns itself off (nothing left to reset): focus moves to the first box, not out of the panel
  const showDefault = (event) => {
    const panel = event.currentTarget.closest('[role="dialog"]');
    onChange(EMPTY_CHOICE);
    window.requestAnimationFrame(() => panel?.querySelector('[data-autofocus]')?.focus({ preventScroll: true }));
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={[TEXT_BUTTON, className].filter(Boolean).join(' ')}
      >
        <Columns3 className="w-4 h-4" aria-hidden="true" />
        {t('doctors.columns.button')}
      </button>
      <MenuPanel
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        variant={isPhone ? 'sheet' : 'popover'}
        width="w-[560px] max-w-[calc(100vw-16px)]"
        id={panelId}
        ariaLabel={t('doctors.columns.title')}
      >
        <div className={isPhone ? 'pb-2' : 'p-2.5'}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="text-base font-bold text-ink">{t('doctors.columns.title')}</p>
              <p className="text-xs font-semibold text-ink-soft" aria-live="polite">
                {count}
              </p>
            </div>
            <button type="button" disabled={isDefaultChoice(choice)} onClick={showDefault} className={TEXT_BUTTON}>
              {t('doctors.columns.default')}
            </button>
          </div>
          <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {groups.map((group) => (
              <fieldset key={group.key} className="min-w-0">
                <legend className="mb-1 px-2 text-xs font-bold text-ink-soft">{group.title}</legend>
                <ul role="list" className="flex flex-col">
                  {group.columns.map((column) => {
                    const locked = LOCKED_COLUMNS.includes(column.key);
                    return (
                      <li key={column.key}>
                        <label className={`${OPTION} ${locked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-line/20'}`}>
                          <input
                            type="checkbox"
                            checked={shown.has(column.key)}
                            disabled={locked}
                            onChange={(event) => onChange(withColumn(choice, columns, column.key, event.target.checked))}
                            // Focus lands on the first box the owner can change, never on "Show default"
                            data-autofocus={column.key === firstFree ? '' : undefined}
                            className={`mt-0.5 w-4 h-4 shrink-0 accent-brand ${locked ? 'cursor-not-allowed' : 'cursor-pointer'} ${RING}`}
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-ink">
                              {column.header}
                              {locked && <span className="font-medium text-ink-mute"> · {t('doctors.columns.always')}</span>}
                            </span>
                            {column.title && <span className="block text-xs font-medium text-ink-mute">{column.title}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
          {!kept && <p className="mt-3 px-2 text-xs font-medium text-ink-soft">{t('doctors.columns.notKept')}</p>}
          {isPhone && (
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className={DONE_BUTTON}>
                {t('common.done')}
              </button>
            </div>
          )}
        </div>
      </MenuPanel>
    </>
  );
}
