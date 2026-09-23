import { createContext, useContext } from 'react';

// Core value, provided by KeyGate once a key (or demo mode) is in place:
//   { isDemo, demoScenario: 'today'|'planned'|null, signOut(), changeKey(), keyRemembered, onAuthError(), client }
// changeKey = signOut (forget the key, back to the form; Settings → Access). keyRemembered: the key sits in
// localStorage ("Remember on this device").
// `client` is the data/api/client.js instance (the email routes of the Doctors page use it).
const AdminContext = createContext(null);
// The server's /config, provided by AnalyticsProvider once the dataset exists (null before / on failure).
const AdminConfigContext = createContext(null);

export const AdminProvider = AdminContext.Provider;
export const AdminConfigProvider = AdminConfigContext.Provider;

/** The key-gate value without the server config (for AnalyticsProvider itself). */
export function useAdminCore() {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin must be used inside KeyGate');
  return value;
}

/**
 * @returns {{ isDemo: boolean, demoScenario: 'today'|'planned'|null, signOut: () => void, changeKey: () => void,
 *   keyRemembered: boolean, onAuthError: () => void,
 *   client: import('../data/api/client.js').ApiClient, config: import('../data/api/contract.js').ConfigApi|null }}
 */
export function useAdmin() {
  const core = useAdminCore();
  const config = useContext(AdminConfigContext);
  return { ...core, config };
}
