// Sections of the stats site, in navigation order (SPEC §3.1, OVERRIDES O1: English labels).
//   usesPeriod  the page shows the period picker (Prices always covers the last 30 days)
//   group       pill group in the header (0–3, a gap between groups); 'gear' = Settings on the right
//   service     service page: all traffic, the scope switch is replaced by a static chip

export const SECTIONS = Object.freeze([
  { id: 'overview', path: '/overview', label: 'Overview', usesPeriod: true, group: 0, service: false },
  { id: 'money', path: '/money', label: 'Money', usesPeriod: true, group: 1, service: false },
  { id: 'costs', path: '/costs', label: 'Costs', usesPeriod: true, group: 1, service: false },
  { id: 'requests', path: '/requests', label: 'Requests', usesPeriod: true, group: 2, service: false },
  { id: 'recording', path: '/recording', label: 'Recording', usesPeriod: true, group: 2, service: false },
  { id: 'models', path: '/models', label: 'Models', usesPeriod: true, group: 2, service: true },
  { id: 'prices', path: '/prices', label: 'Prices', usesPeriod: false, group: 2, service: true },
  { id: 'doctors', path: '/doctors', label: 'Doctors', usesPeriod: true, group: 3, service: false },
  { id: 'settings', path: '/settings', label: 'Settings', usesPeriod: false, group: 'gear', service: false },
]);

export const DEFAULT_SECTION = 'overview';

/** Sections shown as pills (everything but the gear). */
export const PILL_SECTIONS = Object.freeze(SECTIONS.filter((section) => section.group !== 'gear'));

/** @param {string} id */
export const isSectionId = (id) => SECTIONS.some((section) => section.id === id);

/** @param {string} id */
export const sectionById = (id) => SECTIONS.find((section) => section.id === id) ?? null;

/**
 * '/money' → 'money'; '/', unknown paths and sub-paths → null. Case-insensitive like the router.
 * @param {string|null|undefined} pathname
 */
export const sectionFromPath = (pathname) => {
  const match = /^\/([^/?#]+)\/?$/i.exec(pathname || '');
  const id = match ? match[1].toLowerCase() : null;
  return id && isSectionId(id) ? id : null;
};

/** Path of the old dashboard (served as a static file, not by the router). */
export const LEGACY_PATH = '/legacy/index.html';
