import React from 'react';
import { def } from '../copy/index.js';
import InfoHint from './InfoHint.jsx';

const ICON_CLASS = 'w-5 h-5 shrink-0 text-brand';

// `icon` is a lucide component (preferred, sized here) or an already built element.
const renderIcon = (icon) => {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  return React.createElement(icon, { className: ICON_CLASS, 'aria-hidden': true });
};

const definitionOf = (hintKey) => def(hintKey);

/**
 * Card title row. `hint` is the one-line "how we count" subtitle; `info` is longer text for
 * the click popover. With `hintKey` both come from the copy DEFS: `short` becomes the subtitle
 * and the popover appears only when there is a `long` text to add.
 * A <div>, not a <header>: the print rules hide every <header> inside the admin area.
 */
export default function CardHeader({ title, icon, hint, info, hintKey, right, className = '' }) {
  const definition = definitionOf(hintKey);
  const hintText = hint ?? definition?.short ?? null;
  const label = typeof title === 'string' ? title : undefined;

  let infoNode = null;
  if (info) infoNode = <InfoHint label={label}>{info}</InfoHint>;
  else if (definition?.long) infoNode = <InfoHint hintKey={hintKey} label={label} />;

  return (
    // Wraps only when the controls cannot sit beside a 180 px title (narrow phones).
    <div className={['flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-5', className].filter(Boolean).join(' ')}>
      <div className="flex-1 min-w-[180px]">
        <h3 className="text-lg font-extrabold text-ink flex items-center gap-2">
          {renderIcon(icon)}
          <span className="min-w-0">{title}</span>
        </h3>
        {hintText && <p className="text-sm font-medium text-ink-soft mt-1">{hintText}</p>}
      </div>
      {(right || infoNode) && (
        <div className="flex items-center gap-1">
          {right}
          {infoNode}
        </div>
      )}
    </div>
  );
}
