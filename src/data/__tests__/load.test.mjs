import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../api/client.js';
import { envelope, errorBody } from '../api/contract.js';
import { loadAll } from '../load.js';
import { makeDemoApi } from '../../dev/demoData.js';

// §5.3.7 loading: /usage + /doctors are required; the rest fail alone; 413 / BAD_RANGE → the last 90 days.

const NOW = Date.parse('2026-09-23T07:30:00Z');
const api = makeDemoApi(NOW);
const DATA = {
  '/usage': api.usage, '/doctors': api.doctors, '/config': api.config, '/revenue': api.revenue,
  '/soniox-usage': api.soniox, '/costs-monthly': api.costsMonthly, '/settings': api.settings,
};

/** A fetch that answers from DATA; `answer(path, url)` may return [status, body] to override. */
const fakeFetch = (answer = () => null, calls = []) => async (url) => {
  const parsed = new URL(url, 'http://x');
  const path = parsed.pathname.replace('/api/admin/v2', '');
  calls.push(`${path}${parsed.search}`);
  const [status, body] = answer(path, parsed) ?? [200, envelope(DATA[path], { nowMs: NOW })];
  return { ok: status < 400, status, json: async () => body };
};

const clientWith = (answer, calls) => createClient({ baseUrl: '', getKey: () => 'dev', fetchImpl: fakeFetch(answer, calls) });

test('a full history that is too big is retried once with the last 90 days (413 and BAD_RANGE)', async () => {
  for (const [status, code] of [[413, 'TOO_MANY_ROWS'], [400, 'BAD_RANGE']]) {
    const calls = [];
    const client = clientWith((path, url) => (path === '/usage' && url.searchParams.get('from') === '2026-03-04T22:00:00.000Z' ? [status, errorBody(code, 'too big')] : null), calls);
    const raw = await loadAll({ client, nowMs: NOW });
    assert.equal(raw.sources.usage.status, 'limited');
    assert.ok(calls.some((c) => c.startsWith('/usage?from=2026-06-25')), 'second call from now − 90 days');
  }
});

test('optional sources fail alone; required ones fail the load', async () => {
  const client = clientWith((path) => (path === '/revenue' || path === '/settings' ? [500, errorBody('INTERNAL', 'x')] : null));
  const raw = await loadAll({ client, nowMs: NOW });
  assert.equal(raw.sources.revenue.status, 'error');
  assert.equal(raw.sources.settings.status, 'error');
  assert.equal(raw.revenue, null);
  assert.equal(raw.sources.usage.status, 'ok');
  assert.equal(raw.sources.config.status, 'ok');

  const broken = clientWith((path) => (path === '/doctors' ? [401, { success: false, error: 'Invalid or missing admin secret' }] : null));
  await assert.rejects(loadAll({ client: broken, nowMs: NOW }), (error) => error.code === 'AUTH');
});

test('source states: Stripe off / test mode, Soniox partial', async () => {
  const client = clientWith((path) => {
    if (path === '/revenue') return [200, envelope({ ...api.revenue, livemode: false }, { nowMs: NOW })];
    if (path === '/soniox-usage') return [200, envelope({ ...api.soniox, status: 'partial', reason: 'soniox_error' }, { nowMs: NOW })];
    return null;
  });
  const raw = await loadAll({ client, nowMs: NOW });
  assert.equal(raw.sources.revenue.status, 'test');
  assert.equal(raw.sources.soniox.status, 'limited');
});

test('the client adds dev-only extra parameters (mock toggles) to every request', async () => {
  const calls = [];
  const client = createClient({ baseUrl: '', getKey: () => 'dev', fetchImpl: fakeFetch(() => null, calls), extraQuery: () => ({ off: 'revenue' }) });
  await client.get('/revenue');
  assert.deepEqual(calls, ['/revenue?off=revenue']);
});
