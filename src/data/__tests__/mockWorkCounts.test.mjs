import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createClient } from '../api/client.js';
import { validate } from '../api/contract.js';
import { loadWorkCounts } from '../load.js';
import { normalizeWorkCounts } from '../normalize/workCounts.js';
import { resolvePeriod } from '../period.js';

// The mock server answers GET /work-counts in the contract's shape (npm run dev:mock shows the Doctors columns and
// the Overview card): the demo doctors' forms plus invented extension counts, the clinics' people counted longer,
// BAD_RANGE and 401 like the backend, and the switches ?fail=work413 / work404 / work-counts.

const MOCK = fileURLToPath(new URL('../../../dev/mock-server.js', import.meta.url));
const PREFIX = '/api/admin/v2';

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

async function startMock() {
  const port = await freePort();
  const child = spawn(process.execPath, [MOCK], { env: { ...process.env, MOCK_PORT: String(port), EMAIL_MODE: 'list' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the mock did not start')), 10000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Mock admin API v2')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', (code) => reject(new Error(`the mock stopped (${code})`)));
  });
  const call = async (route, { key = 'dev' } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${PREFIX}${route}`, { headers: key ? { 'x-admin-secret': key } : {} });
    return { status: response.status, json: await response.json() };
  };
  return { port, call, stop: () => child.kill() };
}

test('the mock: /work-counts for the period, in the contract, by the doctors’ pids; its failures', async (t) => {
  const mock = await startMock();
  t.after(mock.stop);
  const period = resolvePeriod('last30', Date.now());
  const query = `from=${encodeURIComponent(new Date(period.fromMs).toISOString())}&to=${encodeURIComponent(new Date(period.effToMs).toISOString())}`;

  const answer = await mock.call(`/work-counts?${query}`);
  assert.equal(answer.status, 200);
  const shape = validate('workCounts', answer.json.data);
  assert.ok(shape.ok, shape.errors.join('; '));
  const data = answer.json.data;
  assert.deepEqual([data.fromDay, data.toDay], [period.from, period.today], 'the Vilnius days of the period');
  const doctors = (await mock.call('/doctors')).json.data.doctors;
  const pids = new Set(doctors.map((d) => d.pid));
  assert.ok(data.people.length >= 4 && data.people.every((p) => pids.has(p.pid)), 'people are the mock’s doctors');
  const members = new Set((await mock.call('/clinics')).json.data.clinics.flatMap((c) => c.members.map((m) => (typeof m === 'string' ? m : m.pid))));
  assert.ok(data.people.some((p) => members.has(p.pid)) && data.people.some((p) => !members.has(p.pid)), 'in a clinic and on their own');
  assert.ok(data.totals.presses > 0 && data.buttons.length > 0 && data.buttons.every((b) => b.en && b.lt));
  const counts = normalizeWorkCounts(data);
  assert.equal(counts.valid, true);
  assert.equal(counts.people.length, data.people.length);

  // The site's own load against the mock: the same answer through the client
  const client = createClient({ baseUrl: `http://127.0.0.1:${mock.port}`, getKey: () => 'dev' });
  const loaded = await loadWorkCounts({ client, period, nowMs: Date.now() });
  assert.equal(loaded.counts.totals.presses, data.totals.presses);

  assert.equal((await mock.call(`/work-counts?from=2026-11-05T00:00:00Z&to=2026-10-01T00:00:00Z`)).json.code, 'BAD_RANGE');
  assert.equal((await mock.call(`/work-counts?from=2026-10-01`)).json.code, 'BAD_RANGE', 'a day is not an instant');
  assert.equal((await mock.call(`/work-counts?${query}`, { key: null })).status, 401);
  const tooMany = await mock.call(`/work-counts?${query}&fail=work413`);
  assert.deepEqual([tooMany.status, tooMany.json.code], [413, 'TOO_MANY_ROWS']);
  assert.equal((await mock.call(`/work-counts?${query}&fail=work404`)).status, 404, 'a server without the route yet');
  assert.equal((await mock.call(`/work-counts?${query}&fail=work-counts`)).status, 500);
  const failing = createClient({ baseUrl: `http://127.0.0.1:${mock.port}`, getKey: () => 'dev', extraQuery: () => ({ fail: 'work413' }) });
  await assert.rejects(loadWorkCounts({ client: failing, period, nowMs: Date.now() }), (err) => err.code === 'TOO_MANY_ROWS');

  // An older period (before anyone was counted): an empty, valid answer
  const old = resolvePeriod('custom', Date.now(), { custom: { from: '2026-04-01', to: '2026-04-30' } });
  const empty = await mock.call(`/work-counts?from=${encodeURIComponent(new Date(old.fromMs).toISOString())}&to=${encodeURIComponent(new Date(old.effToMs).toISOString())}`);
  assert.ok(validate('workCounts', empty.json.data).ok);
  assert.deepEqual([empty.json.data.people.length, empty.json.data.firstDay, empty.json.data.totals.presses], [0, null, 0]);
});
