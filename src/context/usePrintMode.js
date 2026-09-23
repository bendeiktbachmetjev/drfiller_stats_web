import { useSyncExternalStore } from 'react';

// One shared flag (not per-component state): the export menu starts a print, while the shell,
// chart cards and bar lists all have to react to it.
let printing = false;
const listeners = new Set();

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => printing;
const getServerSnapshot = () => false;

const setPrinting = (next) => {
  if (printing === next) return;
  printing = next;
  listeners.forEach((listener) => listener());
};

// Charts measure their box with a ResizeObserver; two frames let React commit the 700 px print
// layout, and the pause lets the charts redraw at that width before the dialog takes a snapshot.
const SETTLE_MS = 300;

export function printReport() {
  if (printing || typeof window === 'undefined') return;
  setPrinting(true);

  const printMedia = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;

  const finish = () => {
    window.removeEventListener('afterprint', finish);
    printMedia?.removeEventListener?.('change', onMediaChange);
    setPrinting(false);
  };
  // Backup for browsers that leave print preview without firing `afterprint`.
  function onMediaChange(event) {
    if (!event.matches) finish();
  }

  window.addEventListener('afterprint', finish);
  printMedia?.addEventListener?.('change', onMediaChange);

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        try {
          window.print();
        } catch {
          finish();
        }
      }, SETTLE_MS);
    });
  });
}

export function usePrintMode() {
  const isPrinting = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { printing: isPrinting, printReport };
}
