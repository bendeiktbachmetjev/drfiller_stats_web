import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AdminShell from '../app/AdminShell.jsx';
import { apiBaseUrl } from '../app/apiBase.js';
import { sectionFromPath } from '../app/nav.js';
import { AdminProvider } from '../context/AdminContext.jsx';
import { resetAnalyticsCache } from '../context/AnalyticsContext.jsx';
import { STORAGE } from '../data/constants.js';
import { createClient } from '../data/api/client.js';
import { ROUTES } from '../data/api/endpoints.js';
import { toDataError } from '../data/errors.js';
import { exitDemoMode, isDemoMode } from '../dev/demo.js';
import { clearKey, readKey, saveKey } from './keyStore.js';
import KeyForm from './KeyForm.jsx';

const AUTH_ERROR_KEY = 'common.error.auth';

// A deep link opened before signing in is remembered so the index redirect can return to it.
const rememberReturnTo = (pathname) => {
  if (!sectionFromPath(pathname)) return;
  try {
    window.sessionStorage.setItem(STORAGE.returnTo, pathname);
  } catch {
    // Storage can be blocked; the user then lands on the default section.
  }
};

/**
 * The whole site sits behind the admin key (§5.3.9). The key lives in sessionStorage, or in
 * localStorage `drfiller_admin_secret` (shared with the old page) when remembered; never in a URL.
 * A new key is checked once with /config before the shell opens; any later 401 clears the key and
 * returns to the form with "That key didn't work.". Dev-only `?demo` skips the key entirely.
 *
 * Provides AdminContext core: { isDemo, demoScenario, signOut, onAuthError, client }.
 */
export default function KeyGate() {
  const { pathname } = useLocation();
  const [demoScenario] = useState(() => (import.meta.env.DEV ? isDemoMode() || null : null));
  const [stored] = useState(() => (demoScenario ? null : readKey()));
  const [key, setKey] = useState(stored?.key ?? null);
  const [checking, setChecking] = useState(false);
  const [errorKey, setErrorKey] = useState(null);

  // The client reads the key through a ref, so one client instance serves the whole session.
  const keyRef = useRef(key);
  keyRef.current = key;
  const client = useMemo(() => createClient({ baseUrl: apiBaseUrl(), getKey: () => keyRef.current }), []);

  const signOut = useCallback(() => {
    resetAnalyticsCache();
    if (import.meta.env.DEV && demoScenario) {
      exitDemoMode();
      return;
    }
    clearKey();
    setErrorKey(null);
    setKey(null);
  }, [demoScenario]);

  const onAuthError = useCallback(() => {
    resetAnalyticsCache();
    clearKey();
    setErrorKey(AUTH_ERROR_KEY);
    setKey(null);
  }, []);

  const submit = useCallback(
    async (value, remember) => {
      setChecking(true);
      setErrorKey(null);
      const probe = createClient({ baseUrl: apiBaseUrl(), getKey: () => value });
      try {
        await probe.get(ROUTES.config);
      } catch (err) {
        // Only a refused key stops here; any other trouble is shown by the pages with a Retry button.
        if (toDataError(err).code === 'AUTH') {
          setChecking(false);
          setErrorKey(AUTH_ERROR_KEY);
          return;
        }
      }
      saveKey(value, { remember });
      resetAnalyticsCache();
      setChecking(false);
      setKey(value);
    },
    [],
  );

  useEffect(() => {
    if (!key && !demoScenario) rememberReturnTo(pathname);
  }, [key, demoScenario, pathname]);

  const value = useMemo(
    () => ({ isDemo: Boolean(demoScenario), demoScenario, signOut, onAuthError, client }),
    [demoScenario, signOut, onAuthError, client],
  );

  if (!demoScenario && !key) {
    return <KeyForm onSubmit={submit} busy={checking} errorKey={errorKey} initialRemember={Boolean(stored?.remembered)} />;
  }

  return (
    <AdminProvider value={value}>
      <AdminShell />
    </AdminProvider>
  );
}
