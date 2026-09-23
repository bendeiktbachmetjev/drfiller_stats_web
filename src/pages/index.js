// Page registry (F0-owned; page agents never edit it). One lazy chunk per page, keyed by the
// section id of app/nav.js. AdminShell renders PAGES[id] for every section route.
import { lazy } from 'react';

export const PAGES = Object.freeze({
  overview: lazy(() => import('./OverviewPage.jsx')),
  money: lazy(() => import('./MoneyPage.jsx')),
  costs: lazy(() => import('./CostsPage.jsx')),
  requests: lazy(() => import('./RequestsPage.jsx')),
  recording: lazy(() => import('./RecordingPage.jsx')),
  models: lazy(() => import('./ModelsPage.jsx')),
  prices: lazy(() => import('./PricesPage.jsx')),
  doctors: lazy(() => import('./DoctorsPage.jsx')),
  settings: lazy(() => import('./SettingsPage.jsx')),
});

/** File name of each page (nav.test.mjs checks that every section has one). */
export const PAGE_FILES = Object.freeze({
  overview: 'OverviewPage.jsx',
  money: 'MoneyPage.jsx',
  costs: 'CostsPage.jsx',
  requests: 'RequestsPage.jsx',
  recording: 'RecordingPage.jsx',
  models: 'ModelsPage.jsx',
  prices: 'PricesPage.jsx',
  doctors: 'DoctorsPage.jsx',
  settings: 'SettingsPage.jsx',
});
