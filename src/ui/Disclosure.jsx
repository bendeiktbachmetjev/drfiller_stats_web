import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { STORAGE } from '../data/constants.js';
import { t } from '../copy/index.js';
import { usePrintMode } from '../context/usePrintMode.js';

const read = (id, fallback) => {
  try {
    const stored = window.localStorage.getItem(`${STORAGE.disclosure}${id}`);
    return stored === null ? fallback : stored === '1';
  } catch {
    return fallback;
  }
};

const write = (id, open) => {
  try {
    window.localStorage.setItem(`${STORAGE.disclosure}${id}`, open ? '1' : '0');
  } catch {
    // Blocked storage: the choice lasts for this visit only.
  }
};

/**
 * "Show the math": secondary blocks of a section, collapsed by default, remembered per `id` (§4.0 density rule).
 * Always open in print.
 *   id  stable key ('money.credits')   label  button text (default "Show the math")   defaultOpen
 */
export default function Disclosure({ id, label, defaultOpen = false, children, className = '' }) {
  const [open, setOpen] = useState(() => read(id, defaultOpen));
  const { printing } = usePrintMode();
  const panelId = useId();
  const shown = open || printing;
  const toggle = () => {
    setOpen((value) => {
      write(id, !value);
      return !value;
    });
  };
  return (
    <div className={['mt-4', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        aria-expanded={shown}
        aria-controls={panelId}
        onClick={toggle}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink hover:bg-line/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent print:hidden"
      >
        {label ?? (shown ? t('common.hideCalc') : t('common.showCalc'))}
        <ChevronDown className={`w-4 h-4 transition-transform ${shown ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <div id={panelId} hidden={!shown} className="mt-4">
        {shown && children}
      </div>
    </div>
  );
}
