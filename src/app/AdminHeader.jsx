import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { History, LogOut, MoreHorizontal, Settings } from 'lucide-react';
import { useAdmin } from '../context/AdminContext.jsx';
import { useAnalytics } from '../context/AnalyticsContext.jsx';
import { t } from '../copy/index.js';
import AppMark from '../ui/AppMark.jsx';
import MenuPanel from '../ui/MenuPanel.jsx';
import { LEGACY_PATH, PILL_SECTIONS, sectionById } from './nav.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

const PILL_BASE = `shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${RING}`;
const PILL_ACTIVE = 'bg-brand text-white';
const PILL_IDLE = 'text-ink-soft hover:bg-line/40';
const ROUND_BUTTON = `sf-hit w-9 h-9 shrink-0 flex items-center justify-center rounded-full border border-line text-ink-soft hover:bg-line/30 transition-colors ${RING}`;
const TEXT_BUTTON = `flex items-center gap-2 px-3 sm:px-4 h-9 rounded-full border border-line text-[13px] text-ink font-semibold hover:bg-line/30 transition-colors ${RING}`;
const MENU_ITEM = `w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-sm font-semibold text-ink hover:bg-line/30 transition-colors ${RING}`;

const SETTINGS_PATH = sectionById('settings').path;

/** Section pills; groups 0–3 stand apart (`ml-4`). Scrolls sideways on phones. */
function SectionPills({ navRef, className = '' }) {
  return (
    <nav ref={navRef} aria-label={t('common.sections')} className={`sf-nav-scroll relative min-w-0 flex overflow-x-auto ${className}`}>
      <div className="flex items-center gap-1 p-1 sm:mx-auto">
        {PILL_SECTIONS.map((section, index) => {
          const newGroup = index > 0 && PILL_SECTIONS[index - 1].group !== section.group;
          return (
            <NavLink
              key={section.id}
              to={section.path}
              className={({ isActive }) => `${PILL_BASE} ${isActive ? PILL_ACTIVE : PILL_IDLE}${newGroup ? ' ml-4' : ''}`}
            >
              {section.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

/** Phone "⋯" menu: Settings, Old version, Sign out. */
function PhoneMenu({ signOut }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const close = () => setOpen(false);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={t('common.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={ROUND_BUTTON}
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>
      <MenuPanel open={open} anchorRef={anchorRef} onClose={close} width="w-56" role="menu" ariaLabel={t('common.menu')}>
        <Link to={SETTINGS_PATH} role="menuitem" onClick={close} className={MENU_ITEM}>
          <Settings className="w-4 h-4 text-ink-soft" aria-hidden="true" />
          {t('common.settings')}
        </Link>
        <a href={LEGACY_PATH} role="menuitem" className={MENU_ITEM}>
          <History className="w-4 h-4 text-ink-soft" aria-hidden="true" />
          {t('common.legacy')}
        </a>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            close();
            signOut();
          }}
          className={MENU_ITEM}
        >
          <LogOut className="w-4 h-4 text-ink-soft" aria-hidden="true" />
          {t('common.signOut')}
        </button>
      </MenuPanel>
    </>
  );
}

/**
 * Sticky glass header (§3.1).
 * ≥ 640 px: logo + "Dr.Filler · stats" · pills in groups · demo badge (dev) · gear → Settings ·
 * "Old version" → /legacy/index.html · "Sign out".
 * < 640 px: row 1 = logo + "⋯" menu; row 2 = the pills, scrolling sideways with the active pill in view.
 */
export default function AdminHeader() {
  const { signOut, isDemo } = useAdmin();
  const { isRefetching } = useAnalytics();
  const { pathname } = useLocation();
  const navRef = useRef(null);
  const phoneNavRef = useRef(null);

  // Keep the active pill in view after a navigation (only matters when the pills scroll).
  useEffect(() => {
    [navRef.current, phoneNavRef.current].forEach((nav) => {
      const active = nav?.querySelector('[aria-current="page"]');
      if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      if (left < nav.scrollLeft) nav.scrollLeft = left - 8;
      else if (right > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = right - nav.clientWidth + 8;
    });
  }, [pathname]);

  const settingsActive = pathname.toLowerCase() === SETTINGS_PATH;

  return (
    <header className="bg-surface/80 backdrop-blur border-b border-line/60 shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-4">
        <Link to="/" className={`flex items-center gap-2.5 shrink-0 rounded-[12px] ${RING}`}>
          <AppMark size={32} className="rounded-[10px] shadow-card" />
          <span className="text-[17px] sm:text-lg font-extrabold text-ink leading-6 whitespace-nowrap">{t('common.appName')}</span>
        </Link>

        <SectionPills navRef={navRef} className="hidden sm:flex flex-1" />

        <div className="flex items-center gap-2 shrink-0">
          {import.meta.env.DEV && isDemo && (
            <span className="hidden xl:inline-flex px-3 py-1.5 rounded-full text-xs font-semibold bg-line/40 text-ink-soft">{t('common.demo')}</span>
          )}
          <div className="hidden sm:flex items-center gap-2">
            <Link
              to={SETTINGS_PATH}
              aria-label={t('common.settings')}
              aria-current={settingsActive ? 'page' : undefined}
              className={`${ROUND_BUTTON}${settingsActive ? ' bg-brand border-brand text-white hover:bg-brand-strong' : ''}`}
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
            </Link>
            <a href={LEGACY_PATH} className={`hidden md:inline-flex px-2 text-[13px] font-semibold text-ink-soft hover:text-ink underline-offset-4 hover:underline rounded ${RING}`}>
              {t('common.legacy')}
            </a>
            <button type="button" onClick={signOut} aria-label={t('common.signOut')} className={TEXT_BUTTON}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">{t('common.signOut')}</span>
            </button>
          </div>
          <div className="sm:hidden">
            <PhoneMenu signOut={signOut} />
          </div>
        </div>
      </div>

      <div className="sm:hidden px-2 pb-1.5">
        <SectionPills navRef={phoneNavRef} />
      </div>

      {isRefetching && (
        <div className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden" role="progressbar" aria-label={t('common.refreshing')}>
          <div className="sf-progress h-full w-1/4 bg-brand" />
        </div>
      )}
    </header>
  );
}
