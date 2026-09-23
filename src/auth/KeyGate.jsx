import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AdminShell from '../app/AdminShell.jsx';
import { apiBaseUrl } from '../app/apiBase.js';
import { sectionFromPath } from '../app/nav.js';
import { AdminProvider } from '../context/AdminContext.jsx';
import { resetAnalyticsCache } from '../context/AnalyticsContext.jsx';
import { resetLiveCache } from '../context/useLive.js';
import { STORAGE } from '../data/constants.js';
import { createClient } from '../data/api/client.js';
import { ROUTES } from '../data/api/endpoints.js';
import { toDataError } from '../data/errors.js';
import { exitDemoMode, isDemoMode } from '../dev/demo.js';
import { clearKey, readKey, saveKey } from './keyStore.js';
import KeyForm from './KeyForm.jsx';

const AUTH_ERROR_KEY = 'common.error.auth';

// Dev only: mock switches in the page URL (`/overview?off=revenue`, `?stripe=test`, `?fail=settings`) are
// passed on to every request, so the mock server (dev/mock-server.js) can act them out.
const MOCK_SWITCHES = ['off', 'stripe', 'fail', 'scenario', 'email'];
const mockSwitches = () => {
  const params = new URLSearchParams(window.location.search);
  const picked = Object.fromEntries(MOCK_SWITCHES.filter((name) => params.get(name)).map((name) => [name, params.get(name)]));
  return Object.keys(picked).length ? picked : null;
};
const extraQuery = import.meta.env.DEV ? mockSwitches : null;

// Everything loaded with the old key goes (sign out, a refused key, a new key).
const forgetData = () => {
  resetAnalyticsCache();
  resetLiveCache();
};

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
 * Provides AdminContext core: { isDemo, demoScenario, signOut, onAuthError, client } plus (additive, for
 * Settings → Access, §4.9) `changeKey` (= signOut: forget the key, show the form) and `keyRemembered`.
 */
export default function KeyGate() {
  const { pathname } = useLocation();
  const [demoScenario] = useState(() => (import.meta.env.DEV ? isDemoMode() || null : null));
  const [stored] = useState(() => (demoScenario ? null : readKey()));
  const [key, setKey] = useState(stored?.key ?? null);
  const [remembered, setRemembered] = useState(Boolean(stored?.remembered));
  const [checking, setChecking] = useState(false);
  const [errorKey, setErrorKey] = useState(null);

  // The client reads the key through a ref, so one client instance serves the whole session.
  const keyRef = useRef(key);
  keyRef.current = key;
  const client = useMemo(() => createClient({ baseUrl: apiBaseUrl(), getKey: () => keyRef.current, extraQuery }), []);

  const signOut = useCallback(() => {
    forgetData();
    if (import.meta.env.DEV && demoScenario) {
      exitDemoMode();
      return;
    }
    clearKey();
    setErrorKey(null);
    setRemembered(false);
    setKey(null);
  }, [demoScenario]);

  const onAuthError = useCallback(() => {
    forgetData();
    clearKey();
    setRemembered(false);
    setErrorKey(AUTH_ERROR_KEY);
    setKey(null);
  }, []);

  const submit = useCallback(
    async (value, remember) => {
      setChecking(true);
      setErrorKey(null);
      const probe = createClient({ baseUrl: apiBaseUrl(), getKey: () => value, extraQuery });
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
      const savedLocally = saveKey(value, { remember });
      forgetData();
      setChecking(false);
      setRemembered(Boolean(remember && savedLocally));
      setKey(value);
    },
    [],
  );

  useEffect(() => {
    if (!key && !demoScenario) rememberReturnTo(pathname);
  }, [key, demoScenario, pathname]);

  const value = useMemo(
    () => ({ isDemo: Boolean(demoScenario), demoScenario, signOut, changeKey: signOut, keyRemembered: remembered, onAuthError, client }),
    [demoScenario, signOut, remembered, onAuthError, client],
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
