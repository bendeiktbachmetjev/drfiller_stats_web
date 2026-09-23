// State hooks of the Doctors page: marking "mine / test" accounts (server settings) and revealing an
// email in click mode. Nothing here is stored: emails live until the page is left.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdmin } from '../../context/AdminContext.jsx';
import { useSettings } from '../../context/useSettings.js';
import { doctorEmailRoute } from '../../data/api/endpoints.js';
import { errorText } from '../../ui/index.js';

const SUGGESTION_KEY = 'drfiller.admin.doctors.suggestionNo';

/**
 * Toggles a pid in `settings.internalPids` (PUT settings → the dataset is rebuilt, so the scope switch
 * turns on without a reload). `message` says what happened: { tone: 'good'|'bad', key, reason? }.
 * @returns {{ busy: boolean, message: object|null, toggle: (pid: string, on: boolean) => Promise<void> }}
 */
export function useInternalToggle() {
  const { settings, save, status } = useSettings();
  const [message, setMessage] = useState(null);

  const toggle = useCallback(
    async (pid, on) => {
      if (!settings) return;
      const current = settings.internalPids ?? [];
      const internalPids = on ? [...new Set([...current, pid])] : current.filter((item) => item !== pid);
      setMessage(null);
      try {
        await save({ ...settings, internalPids });
        setMessage({ tone: 'good', key: on ? 'doctors.mine.savedOn' : 'doctors.mine.savedOff' });
      } catch (err) {
        setMessage({ tone: 'bad', key: 'doctors.mine.error', reason: errorText(err) });
      }
    },
    [settings, save],
  );

  return { busy: status === 'saving' || !settings, message, toggle };
}

/**
 * "Show email" in click mode: one GET per doctor, kept in memory until the page unmounts.
 * @returns {{ emails: Map<string, { loading?: boolean, email?: string|null, error?: string }>, reveal: (pid: string) => void }}
 */
export function useEmailReveal() {
  const { client } = useAdmin();
  const [emails, setEmails] = useState(() => new Map());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const put = (pid, state) => {
    if (!alive.current) return;
    setEmails((prev) => new Map(prev).set(pid, state));
  };

  const reveal = useCallback(
    async (pid) => {
      put(pid, { loading: true });
      try {
        const data = await client.get(doctorEmailRoute(pid));
        put(pid, { email: data?.email ?? null });
      } catch (err) {
        put(pid, { error: errorText(err) });
      }
    },
    [client],
  );

  return { emails, reveal };
}

/**
 * "No" on the "Is this your account?" row hides it on this device (localStorage, per pid).
 * @param {string|null} pid
 * @returns {[boolean, () => void]} [dismissed, dismiss]
 */
export function useSuggestionDismissed(pid) {
  const read = () => {
    try {
      return Boolean(pid) && window.localStorage.getItem(SUGGESTION_KEY) === pid;
    } catch {
      return false;
    }
  };
  const [dismissed, setDismissed] = useState(read);
  useEffect(() => setDismissed(read()), [pid]); // eslint-disable-line react-hooks/exhaustive-deps
  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(SUGGESTION_KEY, pid);
    } catch {
      // Private mode: the row just hides until the next visit.
    }
    setDismissed(true);
  }, [pid]);
  return [dismissed, dismiss];
}
