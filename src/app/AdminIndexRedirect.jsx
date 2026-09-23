import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { STORAGE } from '../data/constants.js';
import { DEFAULT_SECTION, isSectionId, sectionFromPath } from './nav.js';

const readReturnTo = () => {
  try {
    return sectionFromPath(window.sessionStorage.getItem(STORAGE.returnTo));
  } catch {
    return null;
  }
};

const readLastSection = () => {
  try {
    const stored = window.localStorage.getItem(STORAGE.lastSection);
    return isSectionId(stored) ? stored : null;
  } catch {
    return null;
  }
};

/**
 * `/` → the deep link saved before signing in → the last visited section → Overview (§3.1).
 * Renders inside the shell, i.e. only after the key gate let the user in.
 */
export default function AdminIndexRedirect() {
  // Read during the first render only; removed in an effect so a StrictMode double render still sees it.
  const [target] = useState(() => readReturnTo() || readLastSection() || DEFAULT_SECTION);

  useEffect(() => {
    try {
      window.sessionStorage.removeItem(STORAGE.returnTo);
    } catch {
      // Nothing to clean up when storage is blocked.
    }
  }, []);

  return <Navigate replace to={`/${target}`} />;
}
