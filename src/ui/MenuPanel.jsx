import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePrintMode } from '../context/usePrintMode.js';

const GAP = 8; // between the anchor and the panel
const MARGIN = 8; // closest the panel may get to the window edge
const MIN_ROOM = 120; // never squeeze the panel below this height

// text colour is set here because the panel lives in <body>, outside the admin wrapper.
const PANEL_CLASS =
  'fixed z-40 p-1.5 rounded-[16px] bg-surface border border-line/60 shadow-pop sf-pop text-ink overflow-y-auto print:hidden focus:outline-none';

// variant 'sheet': a full-width panel fixed to the bottom of the screen (the phone filter sheet).
const SHEET_CLASS =
  'fixed z-40 inset-x-0 bottom-0 max-h-[85vh] px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] rounded-t-card bg-surface border-t border-line/60 shadow-pop sf-sheet text-ink overflow-y-auto print:hidden focus:outline-none';
const BACKDROP_CLASS = 'fixed inset-0 z-30 bg-ink/20 sf-fade print:hidden';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const INITIAL_STYLE = { top: 0, left: 0 };

// Every floating panel (menus, the filter sheet, (i) notes) carries this attribute. A panel opened from
// inside another one (Export inside the Filters sheet, an (i) next to the scope switch) lives in its own
// portal, appended to <body> after its parent; presses, focus and scrolling inside such a later panel must
// not close the panel it came from.
export const PANEL_ATTR = 'data-sf-panel';
const inLaterPanel = (target, panel) => {
  if (!(target instanceof Element) || !panel) return false;
  const other = target.closest(`[${PANEL_ATTR}]`);
  return Boolean(other && other !== panel && panel.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
};

/**
 * Places a position: fixed panel next to its anchor: below by default, above when there is
 * more room there, always clamped to the window. Runs before paint, so the panel is never
 * seen in the wrong spot. Sizes come from offset/scroll metrics because the sf-pop animation
 * scales the panel while it opens.
 */
export function useAnchoredPosition({ open, anchorRef, panelRef, align = 'end', gap = GAP, disabled = false }) {
  const [style, setStyle] = useState(INITIAL_STYLE);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const rect = anchor.getBoundingClientRect();
    const viewWidth = document.documentElement.clientWidth;
    const viewHeight = document.documentElement.clientHeight;
    const width = panel.offsetWidth;
    const naturalHeight = panel.scrollHeight + (panel.offsetHeight - panel.clientHeight);

    const roomBelow = viewHeight - rect.bottom - gap - MARGIN;
    const roomAbove = rect.top - gap - MARGIN;
    const above = naturalHeight > roomBelow && roomAbove > roomBelow;
    const maxHeight = Math.max(above ? roomAbove : roomBelow, MIN_ROOM);
    const height = Math.min(naturalHeight, maxHeight);
    const top = Math.round(above ? rect.top - gap - height : rect.bottom + gap);

    let left = rect.right - width;
    if (align === 'start') left = rect.left;
    if (align === 'center') left = rect.left + rect.width / 2 - width / 2;
    left = Math.round(Math.min(Math.max(left, MARGIN), Math.max(MARGIN, viewWidth - width - MARGIN)));

    setStyle((prev) =>
      prev.top === top && prev.left === left && prev.maxHeight === maxHeight ? prev : { top, left, maxHeight },
    );
  }, [anchorRef, panelRef, align, gap]);

  useLayoutEffect(() => {
    if (!open || disabled) return undefined;
    place();
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return undefined;
    // Content can grow while open (a validation line, a longer label).
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open, disabled, place, panelRef]);

  return style;
}

/**
 * Closes a floating panel on outside press, scroll, resize, Escape and before printing
 * (portalled panels sit outside the print rules). Listeners exist only while it is open.
 * A press on the anchor is left to the anchor's own click handler, so it can toggle.
 */
export function useDismiss({ open, onClose, panelRef, anchorRef }) {
  const { printing } = usePrintMode();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;

    const close = () => onCloseRef.current?.();
    const inPanel = (target) => target instanceof Node && Boolean(panelRef.current?.contains(target));
    const inAnchor = (target) => target instanceof Node && Boolean(anchorRef.current?.contains(target));

    const onPointerDown = (event) => {
      if (!inPanel(event.target) && !inAnchor(event.target) && !inLaterPanel(event.target, panelRef.current)) close();
    };
    const onScroll = (event) => {
      if (!inPanel(event.target) && !inLaterPanel(event.target, panelRef.current)) close();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('beforeprint', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('beforeprint', close);
    };
  }, [open, panelRef, anchorRef]);

  useEffect(() => {
    if (open && printing) onCloseRef.current?.();
  }, [open, printing]);
}

/**
 * Popover shell for menus and small forms. `width` is a Tailwind width class ('w-64') or a
 * number of pixels. Focus moves into the panel when it opens (to `[data-autofocus]` if there
 * is one) and returns to where it was when the panel closes.
 * `variant="sheet"` ignores the anchor position: the panel slides up from the bottom, full width,
 * over a dimmed page (phones).
 */
export default function MenuPanel({
  open,
  anchorRef,
  onClose,
  width = 'w-64',
  align = 'end',
  variant = 'popover',
  role = 'dialog',
  ariaLabel,
  id,
  className = '',
  children,
}) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const sheet = variant === 'sheet';
  const position = useAnchoredPosition({ open, anchorRef, panelRef, align, disabled: sheet });

  useDismiss({ open, onClose, panelRef, anchorRef });

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    // StrictMode runs this twice; the second time focus is already inside the panel.
    if (!panel.contains(document.activeElement)) restoreRef.current = document.activeElement;
    const target = panel.querySelector('[data-autofocus]') || panel.querySelector(FOCUSABLE) || panel;
    target.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    return () => {
      // By now the panel is gone. Focus sits on <body> only if it was inside the panel;
      // after an outside click it is already where the user put it.
      const previous = restoreRef.current;
      const active = document.activeElement;
      if (previous instanceof HTMLElement && previous.isConnected && (!active || active === document.body)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open]);

  const handleKeyDown = (event) => {
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll(FOCUSABLE));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement);

    if (event.key === 'Tab') {
      // A date input uses Tab to walk its own day / month / year fields, so it is left alone;
      // if focus does leave the panel from there, handleBlur closes it.
      if (event.target instanceof HTMLInputElement) return;
      // Tabbing past either end closes the panel; focus then returns to the trigger.
      const leaving = event.shiftKey ? index <= 0 : index === items.length - 1;
      if (leaving) {
        event.preventDefault();
        onClose?.();
      }
      return;
    }

    // Arrow keys walk the rows. Inputs keep their own arrow behaviour.
    const onButton = event.target instanceof HTMLButtonElement;
    if (onButton && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length].focus({ preventScroll: true });
    }
  };

  // Keyboard focus that moves on to the rest of the page closes the panel. A null target is
  // a press on something unfocusable or the window losing focus; useDismiss covers the first.
  const handleBlur = (event) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node)) return;
    if (panelRef.current?.contains(next) || anchorRef.current?.contains(next) || inLaterPanel(next, panelRef.current)) return;
    onClose?.();
  };

  if (!open) return null;

  const widthClass = sheet ? '' : typeof width === 'string' ? width : '';
  let style = typeof width === 'number' ? { ...position, width } : position;
  if (sheet) style = undefined;

  return createPortal(
    <>
      {sheet && <div aria-hidden="true" className={BACKDROP_CLASS} />}
      <div
        ref={panelRef}
        {...{ [PANEL_ATTR]: '' }}
        id={id}
        role={role}
        aria-label={ariaLabel}
        tabIndex={-1}
        style={style}
        className={[sheet ? SHEET_CLASS : PANEL_CLASS, widthClass, className].filter(Boolean).join(' ')}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
