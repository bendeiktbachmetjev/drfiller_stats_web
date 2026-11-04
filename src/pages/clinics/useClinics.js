import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext.jsx';
import { useAnalytics } from '../../context/AnalyticsContext.jsx';
import { ROUTES, clinicCreditsRoute, clinicMemberRoute, clinicRoute, clinicUsageRoute } from '../../data/api/endpoints.js';
import { withClinic, withClinicCredits, withMembership } from '../../data/clinics/edits.js';

// A clinic's usage of one period, kept while the site is open: past days never change (credits are counted
// when they are used), so only today's numbers move — a minute-old answer is reloaded.
const usageCache = new Map(); // `${id}|${from}|${to}` → { rows, at }
const FRESH_MS = 60000;

const IDLE = { status: 'idle', rows: [], error: null };

/**
 * The clinic's usage rows of the Vilnius days [from, to) (GET /clinics/:id/usage).
 * @param {string|null} clinicId
 * @param {string|null} from 'YYYY-MM-DD'
 * @param {string|null} to 'YYYY-MM-DD', exclusive
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', rows: object[], error: Error|null, reload: () => void }}
 */
export function useClinicUsage(clinicId, from, to) {
  const { client, isDemo } = useAdmin();
  const key = clinicId && from && to && from < to && !isDemo ? `${clinicId}|${from}|${to}` : null;
  const [state, setState] = useState(IDLE);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!key) {
      setState(IDLE);
      return undefined;
    }
    const hit = usageCache.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) {
      setState({ status: 'ready', rows: hit.rows, error: null });
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: 'loading', rows: hit?.rows ?? [], error: null });
    client
      .get(clinicUsageRoute(clinicId), { from, to }, { signal: controller.signal })
      .then((data) => {
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        usageCache.set(key, { rows, at: Date.now() });
        setState({ status: 'ready', rows, error: null });
      })
      .catch((error) => {
        if (error?.code === 'ABORTED') return;
        setState({ status: 'error', rows: hit?.rows ?? [], error });
      });
    return () => controller.abort();
  }, [key, round, client, clinicId, from, to]);

  const reload = useCallback(() => {
    if (key) usageCache.delete(key);
    setRound((n) => n + 1);
  }, [key]);

  return { ...state, reload };
}

/**
 * Clinic changes (owner actions). Each one saves on the server, then puts the answer into the loaded data
 * (rebuild), so the Doctors and Clinics pages show it at once. Errors are DataErrors for the caller to show.
 */
export function useClinicActions() {
  const { client } = useAdmin();
  const { rebuild } = useAnalytics();

  const createClinic = useCallback(
    async (body) => {
      const data = await client.post(ROUTES.clinics, body);
      rebuild((raw) => withClinic(raw, data.clinic));
      return data.clinic;
    },
    [client, rebuild],
  );

  const updateClinic = useCallback(
    async (id, body) => {
      const data = await client.put(clinicRoute(id), body);
      rebuild((raw) => withClinic(raw, data.clinic));
      return data.clinic;
    },
    [client, rebuild],
  );

  /** Puts the doctor into the clinic (out of any other one). */
  const addMember = useCallback(
    async (id, pid) => {
      const data = await client.put(clinicMemberRoute(id, pid), {});
      rebuild((raw) => withMembership(raw, pid, id));
      return data;
    },
    [client, rebuild],
  );

  /** Takes the doctor out of this clinic. */
  const removeMember = useCallback(
    async (id, pid) => {
      const data = await client.del(clinicMemberRoute(id, pid));
      rebuild((raw) => withMembership(raw, pid, null));
      return data;
    },
    [client, rebuild],
  );

  const addCredits = useCallback(
    async (id, credits, note) => {
      const data = await client.post(clinicCreditsRoute(id), { credits, note });
      rebuild((raw) => withClinicCredits(raw, id, data.credits));
      return data;
    },
    [client, rebuild],
  );

  return { createClinic, updateClinic, addMember, removeMember, addCredits };
}
