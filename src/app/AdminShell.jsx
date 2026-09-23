import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './admin.css';
import { AnalyticsProvider, useAnalytics } from '../context/AnalyticsContext.jsx';
import { usePrintMode } from '../context/usePrintMode.js';
import { STORAGE } from '../data/constants.js';
import { t } from '../copy/index.js';
import { PAGES } from '../pages/index.js';
import AdminHeader from './AdminHeader.jsx';
import AdminIndexRedirect from './AdminIndexRedirect.jsx';
import PageErrorBoundary from './PageErrorBoundary.jsx';
import { DEFAULT_SECTION, SECTIONS, sectionFromPath } from './nav.js';

// Dev server only: `/_kit` shows every kit component with sample data (visual QA before the pages have
// data). `import.meta.env.DEV` is false in production builds, so the gallery never ships.
const KitGallery = import.meta.env.DEV ? lazy(() => import('./KitGallery.jsx')) : null;

const SKIP_LINK_CLASS =
  'sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-40 focus:px-4 focus:py-2 focus:rounded-full focus:bg-surface focus:text-sm focus:font-bold focus:text-brand focus:shadow-card focus:outline-none focus:ring-2 focus:ring-accent';

// Quiet placeholder while a page's code arrives (pages are lazy chunks).
function PageFallback() {
  return (
    <div role="status" className="py-24 flex justify-center">
      <div aria-hidden="true" className="animate-spin rounded-full h-7 w-7 border-2 border-line border-t-brand" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

// A page switch after a long pause refreshes the data in the background (STALE_MS, like a tab coming back).
function StaleOnNavigate({ section }) {
  const { refreshIfStale } = useAnalytics();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refreshIfStale();
  }, [section, refreshIfStale]);
  return null;
}

/**
 * The signed-in site: header + one page per route, all inside AnalyticsProvider (one dataset for
 * every page). `/` → AdminIndexRedirect; unknown paths → Overview. Each page sits in its own
 * PageErrorBoundary keyed by section, so one broken page never blanks the others.
 */
export default function AdminShell() {
  const { pathname } = useLocation();
  const { printing } = usePrintMode();
  const section = sectionFromPath(pathname);

  useEffect(() => {
    if (!section) return;
    try {
      window.localStorage.setItem(STORAGE.lastSection, section);
      window.sessionStorage.removeItem(STORAGE.returnTo);
    } catch {
      // Storage can be blocked; `/` then simply opens Overview.
    }
  }, [section]);

  // A new section starts at its top; the first render keeps the browser's restored position.
  const previousSection = useRef(section);
  useEffect(() => {
    if (previousSection.current === section) return;
    previousSection.current = section;
    window.scrollTo(0, 0);
  }, [section]);

  // Print mode narrows the page to A4 width so the charts re-measure before the dialog opens.
  const pagesStyle = printing ? { width: 700, margin: '0 auto' } : undefined;

  return (
    <AnalyticsProvider>
      <div className="sf-admin min-h-screen bg-gradient-to-b from-surface via-page-mid to-surface text-ink font-sans">
        <a href="#sf-main" className={SKIP_LINK_CLASS}>
          {t('common.skipToContent')}
        </a>
        <StaleOnNavigate section={section} />
        <AdminHeader />
        <main id="sf-main" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 focus:outline-none">
          <div style={pagesStyle}>
            <PageErrorBoundary key={section || 'index'}>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route index element={<AdminIndexRedirect />} />
                  {KitGallery && <Route path="/_kit" element={<KitGallery />} />}
                  {SECTIONS.map(({ id, path }) => {
                    const Page = PAGES[id];
                    return <Route key={id} path={path} element={<Page />} />;
                  })}
                  <Route path="*" element={<Navigate to={`/${DEFAULT_SECTION}`} replace />} />
                </Routes>
              </Suspense>
            </PageErrorBoundary>
          </div>
        </main>
        {printing && (
          <div role="status" className="fixed inset-0 z-40 bg-surface flex items-center justify-center text-sm font-semibold text-ink-soft print:hidden">
            {t('common.print.preparing')}
          </div>
        )}
      </div>
    </AnalyticsProvider>
  );
}
