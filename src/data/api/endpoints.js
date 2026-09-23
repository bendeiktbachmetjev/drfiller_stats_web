// Routes of the admin API v2 (SPEC §5.2.3), relative to `API_PREFIX` ('/api/admin/v2').

export const ROUTES = Object.freeze({
  usage: '/usage',
  doctors: '/doctors',
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

