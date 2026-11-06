import React, { useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MenuPanel } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const TRIGGER = `relative inline-flex items-center justify-end gap-1 rounded-[6px] font-semibold text-brand hover:underline underline-offset-2 after:absolute after:-inset-1.5 print:text-ink-soft ${RING}`;
const ROW = 'flex items-baseline justify-between gap-3 rounded-[10px] px-2 py-1.5 text-[13px]';

/**
 * The "Buttons" cell of the Doctors table: the person's presses in the period. Pressing the number opens a small
 * panel with every button they pressed, most first (the server's English label; an id it does not know is shown
 * as the id). It closes on Escape, a press outside, or Tab past its end, and focus returns to the number.
 * @param {{ total: number, buttons: Array<{ id: string, label: string, n: number }>, name: string }} props
 *   name: how the doctor is shown (the panel's title and the button's accessible name)
 */
export default function ButtonsCell({ total, buttons, name }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelId = useId();
  if (!buttons.length) return <span>{fmt.int(total)}</span>;
  return (
    <>
      {/* A print hides every button (app/admin.css): the number stays on paper */}
      <span className="hidden print:inline">{fmt.int(total)}</span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t('doctors.buttons.open', { n: fmt.int(total), name })}
        onClick={() => setOpen((value) => !value)}
        className={TRIGGER}
      >
        {fmt.int(total)}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform print:hidden ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <MenuPanel open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} width="w-80" id={panelId} ariaLabel={t('doctors.buttons.aria', { name })}>
        <div className="px-2 pt-1.5 pb-2">
          <p className="text-xs font-bold text-ink-soft">{t('doctors.buttons.heading')}</p>
          <p className="mt-0.5 text-sm font-bold text-ink sf-wrap-any">{name}</p>
          <p className="text-xs font-medium text-ink-soft">{t('doctors.buttons.total', { n: fmt.int(total) })}</p>
        </div>
        {/* Focusable, so the keyboard lands on the list (and scrolls it) and Tab past it closes the panel */}
        <ol tabIndex={0} aria-label={t('doctors.buttons.aria', { name })} className={`flex flex-col rounded-[12px] ${RING}`}>
          {buttons.map((button) => (
            <li key={button.id} className={`${ROW} hover:bg-line/20`}>
              <span className="min-w-0 font-medium text-ink sf-wrap-any">{button.label}</span>
              <span className="shrink-0 font-bold tabular-nums text-ink">{fmt.int(button.n)}</span>
            </li>
          ))}
        </ol>
      </MenuPanel>
    </>
  );
}
