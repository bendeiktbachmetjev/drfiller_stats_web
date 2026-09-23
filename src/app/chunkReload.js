// After a deploy the old page chunks are gone: an open tab fails to load a page it has not opened yet
// (the server answers the missing file with index.html). One automatic reload fetches the new version;
// a session flag stops a reload loop when the chunk is missing for another reason.

const FLAG = 'drfiller.admin.chunkReload';
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

/**
 * Is this the error of a page chunk that could not be loaded?
 * @param {unknown} error
 * @returns {boolean}
 */
export const isChunkLoadError = (error) => CHUNK_ERROR.test(String(error?.message ?? error ?? ''));

/**
 * Reloads the page once per session. Returns false (and does nothing) when it already tried, or when
 * session storage is blocked (then the page shows its "new version" message instead of looping).
 * @returns {boolean}
 */
export function reloadOnce() {
  try {
    if (window.sessionStorage.getItem(FLAG)) return false;
    window.sessionStorage.setItem(FLAG, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** A page chunk loaded: the next failed chunk may reload again. */
export function clearChunkReload() {
  try {
    window.sessionStorage.removeItem(FLAG);
  } catch {
    /* storage blocked */
  }
}

/** Vite fires `vite:preloadError` when a lazy chunk (or its CSS) fails to load: reload once. */
export function installChunkReload() {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnce()) event.preventDefault();
  });
}
