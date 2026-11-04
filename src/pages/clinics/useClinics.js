import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext.jsx';
import { useAnalytics } from '../../context/AnalyticsContext.jsx';
import { ROUTES, clinicCreditsRoute, clinicMemberRoute, clinicPaymentRoute, clinicRoute, clinicShareRoute, clinicUsageRoute, doctorCreditsRoute } from '../../data/api/endpoints.js';
import { withClinic, withClinicCredits, withClinicPayment, withClinicShare, withDoctorCredits, withGrant, withMembership, withoutClinic } from '../../data/clinics/edits.js';

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

  /** A prepaid clinic's purchase: credits and what it paid for them (priceEur, 0 = free). */
  const addCredits = useCallback(
    async (id, credits, priceEur, note) => {
      const data = await client.post(clinicCreditsRoute(id), { credits, priceEur, note });
      const t = Date.now();
      rebuild((raw) => withGrant(withClinicCredits(raw, id, data.credits), { clinicId: id, credits, priceEur, note, t }));
      return data;
    },
    [client, rebuild],
  );

  /** A doctor who pays us directly: credits and what was paid (0 = free). Refused while a clinic pays for them. */
  const addDoctorCredits = useCallback(
    async (pid, credits, priceEur, note) => {
      const data = await client.post(doctorCreditsRoute(pid), { credits, priceEur, note });
      const t = Date.now();
      rebuild((raw) => withGrant(withDoctorCredits(raw, pid, data.credits), { pid, credits, priceEur, note, t }));
      return data;
    },
    [client, rebuild],
  );

  /** What an invoiced clinic paid for a month (written again = corrected). */
  const savePayment = useCallback(
    async (id, month, amountEur, note) => {
      const data = await client.put(clinicPaymentRoute(id, month), { amountEur, note });
      rebuild((raw) => withClinicPayment(raw, id, month, data.payment));
      return data.payment;
    },
    [client, rebuild],
  );

  const removePayment = useCallback(
    async (id, month) => {
      await client.del(clinicPaymentRoute(id, month));
      rebuild((raw) => withClinicPayment(raw, id, month, null));
    },
    [client, rebuild],
  );

  /** A new read-only link + password for the clinic (the old link stops). Returns { url, password } — shown once. */
  const shareClinic = useCallback(
    async (id) => {
      const data = await client.post(clinicShareRoute(id), {});
      rebuild((raw) => withClinicShare(raw, id, { createdAt: data.createdAt ?? Date.now(), lastOpenedAt: null, opens: 0 }));
      return { url: data.url, password: data.password };
    },
    [client, rebuild],
  );

  /** Stops the clinic's read-only link. */
  const stopSharing = useCallback(
    async (id) => {
      await client.del(clinicShareRoute(id));
      rebuild((raw) => withClinicShare(raw, id, null));
    },
    [client, rebuild],
  );

  /** Deletes a clinic without doctors (the server refuses otherwise); its records stay on the server. */
  const deleteClinic = useCallback(
    async (id) => {
      await client.del(clinicRoute(id));
      rebuild((raw) => withoutClinic(raw, id));
    },
    [client, rebuild],
  );

  return { createClinic, updateClinic, addMember, removeMember, addCredits, addDoctorCredits, savePayment, removePayment, shareClinic, stopSharing, deleteClinic };
}
