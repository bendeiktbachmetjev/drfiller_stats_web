// Server settings and hand-entered invoices (§5.3.9): PUT, then reload that source and rebuild the
// dataset, so every page recounts with the new assumptions. Demo mode keeps changes in memory.
import { useCallback, useState } from 'react';
import { useAdminCore } from './AdminContext.jsx';
import { useAnalytics } from './AnalyticsContext.jsx';
import { toDataError } from '../data/errors.js';
import { ROUTES, costsMonthRoute } from '../data/api/endpoints.js';

/**
 * @returns {{ settings: import('../data/api/contract.js').Settings|null,
 *   save: (next: import('../data/api/contract.js').Settings) => Promise<import('../data/api/contract.js').Settings>,
 *   status: 'idle'|'saving'|'saved'|'error', error: import('../data/errors.js').DataError|null,
 *   saveMonth: (month: string, fields: object) => Promise<import('../data/api/contract.js').MonthCost>,
 *   months: import('../data/api/contract.js').MonthCost[] }}
 *   `save` and `saveMonth` reject with a DataError (CONFLICT for 409, SERVER with apiCode 'INVALID_BODY' for 400).
 */
export function useSettings() {
  const { client, isDemo } = useAdminCore();
  const { dataset, refreshSource } = useAnalytics();
  const demo = import.meta.env.DEV && Boolean(isDemo);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const run = useCallback(async (work) => {
    setStatus('saving');
    setError(null);
    try {
      const result = await work();
      setStatus('saved');
      return result;
    } catch (err) {
      const dataError = toDataError(err);
      setError(dataError);
      setStatus('error');
      throw dataError;
    }
  }, []);

  const save = useCallback(
    (next) =>
      run(async () => {
        if (demo) {
          const settings = { ...next, updatedAt: Date.now() };
          await refreshSource('settings', { settings });
          return settings;
        }
        const { settings } = await client.put(ROUTES.settings, next);
        await refreshSource('settings');
        return settings;
      }),
    [demo, client, refreshSource, run],
  );

  const saveMonth = useCallback(
    (month, fields) =>
      run(async () => {
        if (demo) {
          const before = (dataset?.costsMonthly ?? []).find((m) => m.month === month) ?? { month, note: '' };
          const row = { googleInvoiceEur: null, googlePromoCreditsEur: null, railwayUsd: null, sonioxInvoiceUsd: null, openaiInvoiceUsd: null, otherEur: null, ...before, ...fields, month, updatedAt: Date.now() };
          const months = [...(dataset?.costsMonthly ?? []).filter((m) => m.month !== month), row];
          await refreshSource('costs', { months });
          return row;
        }
        const { month: saved } = await client.put(costsMonthRoute(month), fields);
        await refreshSource('costs');
        return saved;
      }),
    [demo, client, dataset, refreshSource, run],
  );

  return { settings: dataset?.settings ?? null, save, status, error, saveMonth, months: dataset?.costsMonthly ?? [] };
}

export default useSettings;
