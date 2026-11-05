import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext.jsx';
import { useAnalytics } from '../../context/AnalyticsContext.jsx';
import {
  ROUTES, clinicCreditsRoute, clinicMemberRoute, clinicPaymentRoute, clinicRoute, clinicShareRoute, clinicStaffRoute, clinicUsageRoute, clinicWorkRoute, doctorCreditsRoute,
} from '../../data/api/endpoints.js';
import { withClinic, withClinicCredits, withClinicPayment, withClinicShare, withDoctorCredits, withGrant, withMembership, withStaff, withoutClinic } from '../../data/clinics/edits.js';
import { marksAfter, staffPatch } from '../../data/clinics/staff.js';
import { normalizeWork, queryFrom, workersParam } from '../../data/clinics/work.js';
import { addDays } from '../../data/period.js';

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
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', rows: object[], error: Error|null, reload: () => void,
 *   clampedFrom: string|null }} clampedFrom: the first day asked when the period was longer than the route takes
 */
export function useClinicUsage(clinicId, periodFrom, to) {
  const { client, isDemo } = useAdmin();
  const from = queryFrom(periodFrom, to);
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

  return { ...state, reload, clampedFrom: from !== periodFrom ? from : null };
}

// A clinic's work statistics of one period and set of workers, kept a minute like the usage. A change of
// roles, marks or rates makes every kept answer of that clinic old (forgetClinicWork).
const workCache = new Map(); // `${id}|${from}|${to}|${workers}` → { work, at }
const WORK_IDLE = { status: 'idle', work: null, error: null, forClinic: null };

/** Drops the kept work answers of a clinic (after a change that moves its numbers). */
export function forgetClinicWork(clinicId) {
  [...workCache.keys()].forEach((key) => {
    if (key.startsWith(`${clinicId}|`)) workCache.delete(key);
  });
}

/**
 * The clinic's work statistics for the Vilnius days [from, to) (GET /clinics/:id/work?from&to with `to` = the
 * period's last day: that route counts both ends), normalized.
 * @param {string|null} clinicId
 * @param {string|null} from 'YYYY-MM-DD'
 * @param {string|null} to 'YYYY-MM-DD', exclusive
 * @param {string[]} [workers] picked pids; empty = everyone
 * @param {string|number} [version] any value: a new one looks again (after forgetClinicWork, that loads anew)
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', work: import('../../data/clinics/work.js').WorkReport|null, error: Error|null, reload: () => void,
 *   clampedFrom: string|null }} clampedFrom: the first day asked when the period was longer than the route takes
 */
export function useClinicWork(clinicId, periodFrom, to, workers = [], version = 0) {
  const { client, isDemo } = useAdmin();
  const from = queryFrom(periodFrom, to);
  const picked = workersParam(workers);
  const key = clinicId && from && to && from < to && !isDemo ? `${clinicId}|${from}|${to}|${picked ?? ''}` : null;
  const [state, setState] = useState(WORK_IDLE);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!key) {
      setState(WORK_IDLE);
      return undefined;
    }
    const hit = workCache.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) {
      setState({ status: 'ready', work: hit.work, error: null, forClinic: clinicId });
      return undefined;
    }
    const controller = new AbortController();
    // The clinic's last answer stays on screen while the next one loads, so the view does not jump; another
    // clinic's numbers never do
    const keep = (current) => hit?.work ?? (current.forClinic === clinicId ? current.work : null);
    setState((current) => ({ status: 'loading', work: keep(current), error: null, forClinic: clinicId }));
    // The work route counts both ends: it gets the last day, not the day after (/usage takes the day after)
    client
      .get(clinicWorkRoute(clinicId), { from, to: addDays(to, -1), workers: picked }, { signal: controller.signal })
      .then((data) => {
        const work = normalizeWork(data);
        workCache.set(key, { work, at: Date.now() });
        setState({ status: 'ready', work, error: null, forClinic: clinicId });
      })
      .catch((error) => {
        if (error?.code === 'ABORTED') return;
        setState((current) => ({ status: 'error', work: keep(current), error, forClinic: clinicId }));
      });
    return () => controller.abort();
  }, [key, round, version, client, clinicId, from, to, picked]);

  const reload = useCallback(() => {
    if (key) workCache.delete(key);
    setRound((n) => n + 1);
  }, [key]);

  const { forClinic, ...shown } = state;
  return { ...shown, reload, clampedFrom: from !== periodFrom ? from : null };
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
      // New rates or a new name change the work numbers too
      forgetClinicWork(id);
      rebuild((raw) => withClinic(raw, data.clinic));
      return data.clinic;
    },
    [client, rebuild],
  );

  /** Puts the doctor into the clinic (out of any other one). */
  const addMember = useCallback(
    async (id, pid) => {
      const data = await client.put(clinicMemberRoute(id, pid), {});
      forgetClinicWork(id);
      rebuild((raw) => withMembership(raw, pid, id));
      return data;
    },
    [client, rebuild],
  );

  /** Takes the doctor out of this clinic. */
  const removeMember = useCallback(
    async (id, pid) => {
      const data = await client.del(clinicMemberRoute(id, pid));
      forgetClinicWork(id);
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

  /**
   * Work statistics: the owner's marks on one worker — { role?: role|null, ex?, statsOff? } (statsOff is kept
   * with the worker's account). The clinic's kept work answers are dropped: its numbers move.
   * @param {string} id clinic
   * @param {string} pid
   * @param {{ role?: string|null, ex?: boolean, statsOff?: boolean }} change
   * @param {string|null} [specialization] the worker's specialty (a role set back to "From the profile" is the
   *   role it gives, until the server's answer says otherwise)
   */
  const setStaff = useCallback(
    async (id, pid, change, specialization = null) => {
      const body = staffPatch(change);
      if (!body) return null;
      const data = await client.patch(clinicStaffRoute(id, pid), body);
      const marks = marksAfter(body, data, specialization);
      forgetClinicWork(id);
      rebuild((raw) => withStaff(raw, id, pid, marks));
      return marks;
    },
    [client, rebuild],
  );

  return { createClinic, updateClinic, addMember, removeMember, addCredits, addDoctorCredits, savePayment, removePayment, shareClinic, stopSharing, deleteClinic, setStaff };
}
