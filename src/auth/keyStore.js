// Where the admin key lives in the browser (§5.3.9): sessionStorage by default, or
// localStorage `drfiller_admin_secret` (shared with the old page) when "Remember on this device" is on.
// Never in a URL. Every storage access is in try/catch: blocked storage must not crash the site.
import { STORAGE } from '../data/constants.js';

const defaultStores = () => ({
  session: typeof window !== 'undefined' ? safe(() => window.sessionStorage) : null,
  local: typeof window !== 'undefined' ? safe(() => window.localStorage) : null,
});

function safe(read) {
  try {
    return read() ?? null;
  } catch {
    return null;
  }
}

const readFrom = (store, key) => safe(() => store?.getItem(key) ?? null);
const writeTo = (store, key, value) => {
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
const removeFrom = (store, key) => {
  try {
    store?.removeItem(key);
  } catch {
    // Nothing to clean when storage is blocked.
  }
};

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * The saved key: this tab's session first, then the remembered one.
 * @param {{ session?: Storage|null, local?: Storage|null }} [stores]
 * @returns {{ key: string, remembered: boolean } | null}
 */
export function readKey(stores = defaultStores()) {
  const session = clean(readFrom(stores.session, STORAGE.keySession));
  if (session) return { key: session, remembered: false };
  const remembered = clean(readFrom(stores.local, STORAGE.keyRemembered));
  if (remembered) return { key: remembered, remembered: true };
  return null;
}

/**
 * Saves a key. `remember` puts it in localStorage (survives the browser), else only in this tab.
 * The other store is cleared so there is only one copy.
 * @param {string} key
 * @param {{ remember?: boolean }} [options]
 * @param {{ session?: Storage|null, local?: Storage|null }} [stores]
 * @returns {boolean} false when the key is empty or storage refused it (the key then lives in memory only)
 */
export function saveKey(key, { remember = false } = {}, stores = defaultStores()) {
  const value = clean(key);
  if (!value) return false;
  if (remember) {
    removeFrom(stores.session, STORAGE.keySession);
    return writeTo(stores.local, STORAGE.keyRemembered, value);
  }
  removeFrom(stores.local, STORAGE.keyRemembered);
  return writeTo(stores.session, STORAGE.keySession, value);
}

/**
 * Forgets the key everywhere (sign out, "Change key", or a 401).
 * @param {{ session?: Storage|null, local?: Storage|null }} [stores]
 */
export function clearKey(stores = defaultStores()) {
  removeFrom(stores.session, STORAGE.keySession);
  removeFrom(stores.local, STORAGE.keyRemembered);
}
