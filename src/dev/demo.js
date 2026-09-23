// Dev-server-only demo mode (SimuFlow pattern): visual QA with generated data and no key.
// `import.meta.env.DEV` is `false` in production builds, so isDemoMode() is constant false there, and
// every use site loads the generator with a dynamic import behind the same guard: the demo code never
// ships and cannot skip the key gate in production.
import { STORAGE } from '../data/constants.js';

const SCENARIOS = ['today', 'planned'];

const readFlag = () => {
  try {
    const stored = window.localStorage.getItem(STORAGE.demo);
    return SCENARIOS.includes(stored) ? stored : null;
  } catch {
    return null;
  }
};

const writeFlag = (scenario) => {
  try {
    if (scenario) window.localStorage.setItem(STORAGE.demo, scenario);
    else window.localStorage.removeItem(STORAGE.demo);
  } catch {
    // Storage can be blocked; demo mode then lasts only while ?demo stays in the URL.
  }
};

/**
 * `?demo` → 'today', `?demo=planned` → 'planned', `?demo=0` → off; remembered for in-app navigation.
 * @returns {false|'today'|'planned'}
 */
export const isDemoMode = () => {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has('demo')) {
    const value = params.get('demo');
    const scenario = value === '0' ? null : value === 'planned' ? 'planned' : 'today';
    writeFlag(scenario);
    return scenario ?? false;
  }
  return readFlag() ?? false;
};

/** "Sign out" in demo mode: forget the flag and reload without the query string. */
export const exitDemoMode = () => {
  if (!import.meta.env.DEV) return;
  writeFlag(null);
  window.location.replace(window.location.pathname);
};
