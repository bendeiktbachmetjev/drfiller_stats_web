// Routes of the admin API v2 (SPEC §5.2.3), relative to `API_PREFIX` ('/api/admin/v2').

export const ROUTES = Object.freeze({
  usage: '/usage',
  doctors: '/doctors',
  doctorEmails: '/doctors/emails',
  revenue: '/revenue',
  soniox: '/soniox-usage',
  liveNow: '/live-now',
  config: '/config',
  costsMonthly: '/costs-monthly',
  settings: '/settings',
});

/** @param {string} pid @returns {string} '/doctors/:pid/email' (email mode click or list) */
export const doctorEmailRoute = (pid) => `/doctors/${encodeURIComponent(pid)}/email`;

/** @param {string} month 'YYYY-MM' @returns {string} '/costs-monthly/:month' */
export const costsMonthRoute = (month) => `/costs-monthly/${encodeURIComponent(month)}`;

/** Routes the dataset needs: all-or-nothing. */
export const REQUIRED_SOURCES = Object.freeze(['usage', 'doctors']);
/** Routes that may fail alone (the page shows a SourceBanner). */
export const OPTIONAL_SOURCES = Object.freeze(['config', 'revenue', 'soniox', 'costs', 'settings']);

/** Dataset source name → route. */
export const SOURCE_ROUTES = Object.freeze({
  usage: ROUTES.usage,
  doctors: ROUTES.doctors,
  config: ROUTES.config,
  revenue: ROUTES.revenue,
  soniox: ROUTES.soniox,
  costs: ROUTES.costsMonthly,
  settings: ROUTES.settings,
});
