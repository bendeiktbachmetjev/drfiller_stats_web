import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Users } from 'lucide-react';
import { MenuPanel } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { STAFF_ROLES } from '../../data/clinics/staff.js';
import { filterWorkers } from '../../data/clinics/work.js';
import { INPUT, PRIMARY, SECONDARY } from './ClinicForm.jsx';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const TRIGGER = `inline-flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink whitespace-nowrap hover:bg-line/20 transition-colors max-w-[280px] ${RING}`;
const CHIP = `inline-flex items-center h-8 px-3 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors ${RING}`;
const ROW = 'flex items-start gap-3 px-2 py-2 rounded-[10px] hover:bg-line/20 cursor-pointer';

/**
 * "Whose work to show?": a pill with the choice ("All staff", "3 people", one e-mail) that opens a panel with a
 * search, quick picks by role and a tick box per person; "Show" applies, "Cancel" forgets the draft.
 * Nobody picked = everyone (the server then counts the whole clinic).
 * @param {{ options: Array<{ pid: string, label: string, code?: string|null, role: string|null, detail?: string }>,
 *   value: string[], onChange: (pids: string[]) => void }} props
 */
export default function WorkersPicker({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState('');
  const anchorRef = useRef(null);

  const picked = new Set(draft);
  const shown = useMemo(() => filterWorkers(options, { query }), [options, query]);
  const rolesPresent = STAFF_ROLES.filter((role) => options.some((o) => o.role === role));

  const label = (() => {
    if (!value.length) return t('clinics.work.workers.all');
    if (value.length === 1) return options.find((o) => o.pid === value[0])?.label ?? t('clinics.work.workers.some', { n: fmt.int(1) });
    return t('clinics.work.workers.some', { n: fmt.int(value.length) });
  })();

  const openPanel = () => {
    setDraft(value);
    setQuery('');
    setOpen((was) => !was);
  };
  const close = () => setOpen(false);
  const toggle = (pid) => setDraft((list) => (list.includes(pid) ? list.filter((p) => p !== pid) : [...list, pid]));
  const pickRole = (role) => setDraft(role ? options.filter((o) => o.role === role).map((o) => o.pid) : []);
  const apply = () => {
    // Everyone ticked is the same as no pick: the server counts the whole clinic
    const next = draft.length === options.length ? [] : draft;
    onChange([...next].sort());
    close();
  };

  return (
    <>
      <button ref={anchorRef} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={openPanel} className={TRIGGER}>
        <Users className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
        <span className="sr-only">{t('clinics.work.workers.label')}: </span>
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="w-4 h-4 text-ink-mute shrink-0" aria-hidden="true" />
      </button>
      <MenuPanel open={open} anchorRef={anchorRef} onClose={close} width="w-[340px]" align="start" ariaLabel={t('clinics.work.workers.title')}>
        <div className="p-2">
          <p className="mb-2 text-sm font-bold text-ink">{t('clinics.work.workers.title')}</p>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-mute" aria-hidden="true" />
            <input
              data-autofocus=""
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('clinics.work.workers.search')}
              aria-label={t('clinics.work.workers.search')}
              className={`${INPUT} pl-10`}
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t('clinics.work.workers.label')}>
            <button type="button" onClick={() => pickRole(null)} className={`${CHIP} ${draft.length === 0 ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-soft hover:bg-line/20'}`}>
              {t('clinics.work.workers.everyone')}
            </button>
            {rolesPresent.map((role) => (
              <button key={role} type="button" onClick={() => pickRole(role)} className={`${CHIP} border-line bg-surface text-ink-soft hover:bg-line/20`}>
                {t(`clinics.role.${role}`)}
              </button>
            ))}
          </div>
          <ul className="mt-2 max-h-[300px] overflow-y-auto" role="list">
            {shown.map((o) => (
              <li key={o.pid}>
                <label className={ROW}>
                  <input type="checkbox" checked={picked.has(o.pid)} onChange={() => toggle(o.pid)} className={`mt-0.5 w-4 h-4 shrink-0 accent-brand ${RING}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink sf-wrap-any">{o.label}</span>
                    {o.detail && <span className="block text-xs font-medium text-ink-mute sf-wrap-any">{o.detail}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="px-2 py-3 text-sm font-medium text-ink-mute">{t('clinics.work.workers.none', { q: query.trim() })}</p>}
          {draft.length === 0 && options.length > 0 && <p className="px-2 pt-2 text-xs font-medium text-ink-mute">{t('clinics.work.workers.all')}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={apply} className={PRIMARY}>
              {t('clinics.work.workers.show')}
            </button>
            <button type="button" onClick={close} className={SECONDARY}>
              {t('clinics.work.workers.cancel')}
            </button>
          </div>
        </div>
      </MenuPanel>
    </>
  );
}
