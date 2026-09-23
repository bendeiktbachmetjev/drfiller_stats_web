import React from 'react';
import { Segmented } from '../../ui/index.js';

/**
 * A page-local switch with its label ("Pack: As planned · 250 · 600 · 1500"). Not saved: it only changes
 * the section it sits in. On a narrow phone the pills scroll sideways inside the row, never the page.
 *   label    visible label       options  [{ value, label }]      value / onChange  as in Segmented
 */
export default function ChoiceRow({ label, options, value, onChange, className = '' }) {
  return (
    <div className={['mb-4 flex min-w-0 items-center gap-3', className].filter(Boolean).join(' ')} data-print="hide">
      <span className="shrink-0 text-[13px] font-semibold text-ink-soft">
        {label}
      </span>
      <div className="min-w-0 overflow-x-auto sf-nav-scroll py-1">
        <Segmented options={options} value={value} onChange={onChange} ariaLabel={label} />
      </div>
    </div>
  );
}
