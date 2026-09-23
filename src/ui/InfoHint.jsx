import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { def, fillHint, t } from '../copy/index.js';
import { PANEL_ATTR, useAnchoredPosition, useDismiss } from './MenuPanel.jsx';
import { usePrintHint } from './PrintAppendix.jsx';

const TRIGGER_BASE =
  'sf-hit inline-flex shrink-0 w-6 h-6 -m-1 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2';

const TRIGGER_TONE = {
  default:
    'text-ink-mute hover:text-brand hover:bg-brand/8 aria-expanded:text-brand aria-expanded:bg-brand/8 focus-visible:ring-accent',
  onAccent:
    'text-white/85 hover:text-white hover:bg-white/15 aria-expanded:text-white aria-expanded:bg-white/15 focus-visible:ring-white/70',
};

const PANEL_CLASS =
  'fixed z-40 w-[288px] p-4 rounded-[16px] bg-surface text-ink border border-line/60 shadow-pop sf-pop overflow-y-auto print:hidden focus:outline-none';

const TITLE_CLASS = 'text-xs font-bold text-ink-soft mb-1.5';
const BODY_CLASS = 'text-[13px] leading-relaxed font-medium text-ink-soft';

const readDefinition = (hintKey, values) => {
  const definition = def(hintKey);
  if (!definition) return { short: null, long: null };
  const short = values && definition.template ? fillHint(hintKey, values) : definition.short ?? null;
  return { short, long: definition.long ?? null };
};

/**
 * Small "i" button with a click popover that explains how a number is counted.
 * Text comes from the copy DEFS[hintKey] (short — or the filled template when `values` are given —
 * then long) or from `children`. Under a coarse pointer the button has a 40 px hit area.
 * `label` names what is explained ("Forms"): it completes the button's accessible
 * name and heads the entry in the print appendix, where every hint is listed because the
 * popover itself cannot be printed.
 */
export default function InfoHint({ hintKey, values, children, title, tone = 'default', label, className = '' }) {
  const heading = title ?? t('common.hint.title');
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();

  const { short, long } = readDefinition(hintKey, values);
  const hasChildren = children !== undefined && children !== null && children !== false && children !== '';
  const hasContent = hasChildren || Boolean(short || long);
  const printLabel = typeof label === 'string' && label ? label : null;

  const close = () => {
    // The note is about to be removed; do not let focus fall back to <body> with it.
    if (panelRef.current?.contains(document.activeElement)) buttonRef.current?.focus({ preventScroll: true });
    setOpen(false);
  };
  const position = useAnchoredPosition({ open, anchorRef: buttonRef, panelRef, align: 'center' });
  useDismiss({ open, onClose: close, panelRef, anchorRef: buttonRef });
  usePrintHint(
    hasContent
      ? {
          key: hasChildren ? null : hintKey,
          label: printLabel,
          short: hasChildren ? null : short,
          long: hasChildren ? null : long,
          node: hasChildren ? children : null,
        }
      : null,
  );

  if (!hasContent) return null;

  // Focus stays on the button while the note is open. A click inside the note moves focus
  // to the note itself (tabIndex -1), which must not count as leaving.
  const handleBlur = (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && (panelRef.current?.contains(next) || buttonRef.current?.contains(next))) return;
    close();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={printLabel ? `${heading}: ${printLabel}` : heading}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-describedby={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        onBlur={handleBlur}
        className={[TRIGGER_BASE, TRIGGER_TONE[tone] || TRIGGER_TONE.default, className].filter(Boolean).join(' ')}
      >
        <Info className="w-4 h-4" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            {...{ [PANEL_ATTR]: '' }}
            id={panelId}
            role="note"
            tabIndex={-1}
            style={position}
            onBlur={handleBlur}
            className={PANEL_CLASS}
          >
            <div className={TITLE_CLASS}>{heading}</div>
            {hasChildren ? (
              <div className={BODY_CLASS}>{children}</div>
            ) : (
              <div className={BODY_CLASS}>
                {short && <p>{short}</p>}
                {long && <p className={short ? 'mt-2' : undefined}>{long}</p>}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
