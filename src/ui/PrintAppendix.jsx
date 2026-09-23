import React, { createContext, useContext, useEffect, useId, useSyncExternalStore } from 'react';
import { SECTIONS } from '../app/nav.js';
import { t } from '../copy/index.js';

/**
 * Tiny store of everything that is only reachable by a click on screen and would be lost on
 * paper: InfoHint popover texts and the page's data notes. Components register while they
 * are mounted; PrintAppendix prints what is registered. Analytics pages unmount when left,
 * so the store always describes the page that is on screen.
 */
export function createHintRegistry() {
  const entries = new Map();
  const listeners = new Set();
  let snapshot = [];

  const emit = () => {
    snapshot = Array.from(entries.values());
    listeners.forEach((listener) => listener());
  };

  return {
    set(id, entry) {
      entries.set(id, entry);
      emit();
    },
    remove(id) {
      if (entries.delete(id)) emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}

// The default value is a shared registry, so no provider is needed. Wrap a subtree in
// <PrintHintsContext.Provider value={createHintRegistry()}> only to give it its own appendix.
export const PrintHintsContext = createContext(createHintRegistry());

/** Registers one hint: `{ key?, label?, short?, long?, node? }`. Pass null to register nothing. */
export function usePrintHint(hint) {
  const registry = useContext(PrintHintsContext);
  const id = useId();
  const active = Boolean(hint);
  const key = hint?.key ?? null;
  const label = hint?.label ?? null;
  const short = hint?.short ?? null;
  const long = hint?.long ?? null;
  const node = hint?.node ?? null;

  useEffect(() => {
    if (!active) {
      registry.remove(id);
      return;
    }
    registry.set(id, { kind: 'hint', id, key, label, short, long, node });
  }, [registry, id, active, key, label, short, long, node]);

  useEffect(() => () => registry.remove(id), [registry, id]);
}

/** Registers the page's data notes (plain sentences). */
export function usePrintNotes(notes) {
  const registry = useContext(PrintHintsContext);
  const id = useId();
  // Callers build the array on every render; the text is what decides a re-registration.
  const signature = JSON.stringify(Array.isArray(notes) ? notes.filter(Boolean) : []);

  useEffect(() => {
    const list = JSON.parse(signature);
    if (list.length === 0) {
      registry.remove(id);
      return;
    }
    registry.set(id, { kind: 'notes', id, notes: list });
  }, [registry, id, signature]);

  useEffect(() => () => registry.remove(id), [registry, id]);
}

// The same hint is often used twice on a page (a tile and the chart under it).
const uniqueHints = (entries) => {
  const seen = new Set();
  return entries.filter((entry) => {
    if (entry.kind !== 'hint') return false;
    const text = [entry.short, entry.long].filter(Boolean).join(' ');
    const identity = entry.key || text || entry.id;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

const uniqueNotes = (entries, extra) => {
  const registered = entries.filter((entry) => entry.kind === 'notes').flatMap((entry) => entry.notes);
  return Array.from(new Set([...registered, ...(Array.isArray(extra) ? extra.filter(Boolean) : [])]));
};

/**
 * Print-only closing block: every "how we count" text used on the page, the data notes,
 * and the privacy line. `notes` is optional; notes shown with <DataNotes> arrive on their own.
 */
export default function PrintAppendix({ section, notes }) {
  const registry = useContext(PrintHintsContext);
  const entries = useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
  const hints = uniqueHints(entries);
  const allNotes = uniqueNotes(entries, notes);
  const sectionLabel = SECTIONS.find((item) => item.id === section)?.label ?? section ?? null;

  return (
    <section
      className="hidden print:block break-inside-avoid mt-8 pt-4 border-t border-line text-ink"
      aria-label={sectionLabel ? `${t('common.hint.title')}: ${sectionLabel}` : t('common.hint.title')}
    >
      {hints.length > 0 && (
        <>
          <h2 className="mb-2 text-[11pt] font-extrabold">{t('common.hint.title')}</h2>
          <div className="columns-2 gap-8 text-[8.5pt] leading-snug text-ink-soft">
            {hints.map((hint) => (
              <div key={hint.id} className="mb-2 break-inside-avoid">
                {hint.label && <span className="font-extrabold text-ink">{hint.label}. </span>}
                {hint.node ?? [hint.short, hint.long].filter(Boolean).join(' ')}
              </div>
            ))}
          </div>
        </>
      )}

      {allNotes.length > 0 && (
        <>
          <h3 className="mt-3 mb-1.5 text-[9pt] font-extrabold">{t('common.notes.title')}</h3>
          <ul className="list-disc pl-4 text-[8.5pt] leading-snug text-ink-soft">
            {allNotes.map((note) => (
              <li key={note} className="mb-1 break-inside-avoid">
                {note}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-3 text-[8.5pt] font-semibold text-ink-soft">{t('common.print.privacy')}</p>
    </section>
  );
}
