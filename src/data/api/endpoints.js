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
  clinics: '/clinics',
});

/** @param {string} pid @returns {string} '/doctors/:pid/email' (email mode click or list) */
export const doctorEmailRoute = (pid) => `/doctors/${encodeURIComponent(pid)}/email`;

/** @param {string} month 'YYYY-MM' @returns {string} '/costs-monthly/:month' */
export const costsMonthRoute = (month) => `/costs-monthly/${encodeURIComponent(month)}`;


/** @param {string} pid @returns {string} '/doctors/:pid/credits' (POST { credits, note }) */
export const doctorCreditsRoute = (pid) => `/doctors/${encodeURIComponent(pid)}/credits`;

/** @param {string} id @returns {string} '/clinics/:id' (PUT { name?, billing?, active?, monthlyCapPerDoctor?, pricePerCreditEur?, note? }) */
export const clinicRoute = (id) => `/clinics/${encodeURIComponent(id)}`;

/** @param {string} id @param {string} pid @returns {string} '/clinics/:id/members/:pid' (PUT adds, DELETE takes out) */
export const clinicMemberRoute = (id, pid) => `/clinics/${encodeURIComponent(id)}/members/${encodeURIComponent(pid)}`;

/** @param {string} id @returns {string} '/clinics/:id/credits' (POST { credits, note }) — prepaid clinics only */
export const clinicCreditsRoute = (id) => `/clinics/${encodeURIComponent(id)}/credits`;

/** @param {string} id @returns {string} '/clinics/:id/usage' (GET ?from=YYYY-MM-DD&to=YYYY-MM-DD, `to` exclusive) */
export const clinicUsageRoute = (id) => `/clinics/${encodeURIComponent(id)}/usage`;
