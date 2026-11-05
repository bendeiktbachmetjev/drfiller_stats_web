import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { validate } from '../api/contract.js';
import { normalizeClinics } from '../normalize/clinics.js';
import { normalizeWork, partsOf } from '../clinics/work.js';
import { DEMO_CLINIC_IDS } from '../../dev/demoClinics.js';

// FROZEN CONTRACT 1 for the work statistics (spec v1 §7.2): the mock server answers the clinic routes in the
// contract's shapes, and its changes (roles, marks, own rates, statsShown) show in the next answers. Roles follow
// the backend's rule: the owner's while the profile gives what it gave then, else the profile's, else a guess.

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
  const call = async (method, route, body) => {
    const response = await fetch(`http://127.0.0.1:${port}${PREFIX}${route}`, {
      method,
      headers: { 'x-admin-secret': 'dev', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, json: await response.json() };
  };
  return { call, stop: () => child.kill() };
}

const day = (offset) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius' }).format(new Date(Date.now() + offset * 86400000));

test('the mock: clinics with staff marks, the work answer, and the owner’s changes', async (t) => {
  const mock = await startMock();
  t.after(mock.stop);
  const id = DEMO_CLINIC_IDS.invoice;

  const clinics = await mock.call('GET', '/clinics');
  assert.equal(clinics.status, 200);
  const shape = validate('clinics', clinics.json.data);
  assert.ok(shape.ok, shape.errors.join('; '));
  const clinic = normalizeClinics(clinics.json.data).find((c) => c.id === id);
  assert.equal(clinic.members.length, 8);
  const marks = Object.values(clinic.staff);
  assert.ok(marks.some((m) => m.guessed) && marks.some((m) => m.ex) && marks.some((m) => m.statsOff), 'a guessed role, a shared login and an objection');
  assert.deepEqual(new Set(marks.map((m) => m.role)), new Set(['doctor', 'nurse', 'admin', 'other']));
  // Every source of a role: four from the profile (one over a role set while the profile was empty), three set by
  // the owner, one guessed without a specialty
  const bySource = marks.reduce((n, m) => ({ ...n, [m.from]: (n[m.from] ?? 0) + 1 }), {});
  assert.deepEqual(bySource, { profile: 4, owner: 3, guess: 1 });
  assert.ok(marks.every((m) => (m.from === 'guess') === m.guessed && (m.from === 'guess') === (m.spec === null)), 'a guess = no specialty');
  assert.ok(marks.some((m) => m.from === 'owner' && m.profile && m.profile !== m.role), 'the owner’s role over another one of the profile');

  const range = `from=${day(-30)}&to=${day(0)}`;
  const first = await mock.call('GET', `/clinics/${id}/work?${range}`);
  assert.equal(first.status, 200);
  const workShape = validate('clinicWork', first.json.data);
  assert.ok(workShape.ok, workShape.errors.join('; '));
  const work = normalizeWork(first.json.data);
  assert.ok(work.totals.savedMin > 0 && work.byWorker.length === 8);
  assert.deepEqual(new Set(work.byWorker.map((w) => w.from)), new Set(['owner', 'profile', 'guess']), 'the mock’s answer says where each role comes from');
  assert.equal(work.byWorker.find((w) => w.guessed).spec, 'Nenurodyta', 'no specialty is „Nenurodyta“ in the work answer, as the backend has it');
  assert.ok(work.firstWorkDay > work.from, 'old days without the extension’s counts');
  assert.ok(Math.abs(work.byWorker.reduce((s, w) => s + (w.savedMin ?? 0), 0) - work.totals.netMin) < 1, 'people add up to the total');
  assert.ok(Math.abs(work.daily.reduce((s, d) => s + d.savedMin, 0) - work.totals.netMin) < 1, 'days add up to the total');
  assert.equal(work.daily.length, 31, 'every day of the period, both ends included');
  const parts = partsOf(work);
  assert.ok(Math.abs(parts.handMin - parts.dfMin - work.totals.netMin) < 1, 'the parts add up to the net (the day rule is a part)');
  assert.equal(parts.dayRuleMin, 0);
  const off = work.byWorker.find((w) => w.statsOff);
  assert.deepEqual([off.savedMin, off.valueEur, off.forms > 0], [null, null, true], 'an objection keeps only the billing');
  assert.equal(work.byWorker.find((w) => w.ex).savedMin, null, 'a shared login gets no time');
  assert.ok(work.health.versions.length >= 5 && work.health.checks.formsVsBilling.length === 1);

  const guessed = work.byWorker.find((w) => w.guessed);
  assert.equal(guessed.valueEur, null, 'a guessed role shows hours only');
  const patched = await mock.call('PATCH', `/clinics/${id}/staff/${guessed.pid}`, { role: 'doctor', ex: false });
  assert.equal(patched.status, 200);
  assert.ok(validate('staffAnswer', patched.json.data).ok);
  assert.deepEqual([patched.json.data.staff.role, patched.json.data.staff.guessed, patched.json.data.staff.from, patched.json.data.staff.profile], ['doctor', false, 'owner', null]);
  const refused = await mock.call('PATCH', `/clinics/${id}/staff/${guessed.pid}`, { role: 'boss' });
  assert.deepEqual([refused.status, refused.json.code], [400, 'INVALID_BODY']);

  const put = await mock.call('PUT', `/clinics/${id}`, { hourEur: { doctor: 45, nurse: null }, statsShown: false });
  assert.equal(put.status, 200);
  assert.deepEqual([put.json.data.clinic.hourEur, put.json.data.clinic.statsShown], [{ doctor: 45 }, false], 'the whole map is replaced');
  assert.equal((await mock.call('PUT', `/clinics/${id}`, { hourEur: { doctor: 0 } })).status, 400);

  const second = normalizeWork((await mock.call('GET', `/clinics/${id}/work?${range}&workers=${guessed.pid}`)).json.data);
  assert.deepEqual(second.byWorker.map((w) => [w.pid, w.guessed]), [[guessed.pid, false]], 'only the picked person, with the new role');
  assert.equal(second.byRole[0].rateEur, 45, 'the clinic’s own doctor hour');
  assert.equal(second.clinic.statsShown, false);

  const prepaid = normalizeWork((await mock.call('GET', `/clinics/${DEMO_CLINIC_IDS.prepaid}/work?${range}`)).json.data);
  assert.equal(prepaid.totals.paidEur, null, 'credits that came free have no price');
  assert.equal((await mock.call('GET', `/clinics/${id}/work?from=${day(0)}&to=${day(-1)}`)).status, 400);

  // The person picks a nurse's specialty: the owner set Doctor while the profile was empty, so the profile counts again
  const NURSE = 'Bendrosios praktikos slaugytojas';
  const staffOf = async () => normalizeClinics((await mock.call('GET', '/clinics')).json.data).find((c) => c.id === id).staff[guessed.pid];
  assert.equal((await mock.call('GET', `/__mock?spec=${encodeURIComponent(`${guessed.pid}:${NURSE}`)}`)).status, 200);
  const changed = await staffOf();
  assert.deepEqual([changed.role, changed.guessed, changed.from, changed.profile, changed.spec], ['nurse', false, 'profile', 'nurse', NURSE]);
  const doctors = (await mock.call('GET', '/doctors')).json.data.doctors;
  assert.equal(doctors.find((d) => d.pid === guessed.pid).specialization, NURSE, 'the doctor list has the new specialty too');
  // Back to no specialty: the owner's old Doctor does not come back (the change took it out, as the backend does)
  await mock.call('GET', `/__mock?spec=${encodeURIComponent(`${guessed.pid}:`)}`);
  const back = await staffOf();
  assert.deepEqual([back.role, back.guessed, back.from], ['doctor', true, 'guess'], 'a return to the old role brings no old role back');
  await mock.call('GET', `/__mock?spec=${encodeURIComponent(`${guessed.pid}:${NURSE}`)}`);
  // Set again: it counts while the profile says nurse; cleared: the profile's role
  const again = (await mock.call('PATCH', `/clinics/${id}/staff/${guessed.pid}`, { role: 'other' })).json.data.staff;
  assert.deepEqual([again.role, again.from, again.profile], ['other', 'owner', 'nurse']);
  const cleared = (await mock.call('PATCH', `/clinics/${id}/staff/${guessed.pid}`, { role: null })).json.data.staff;
  assert.deepEqual([cleared.role, cleared.guessed, cleared.from, cleared.profile], ['nurse', false, 'profile', 'nurse']);
  // The specialty taken away: a guess again
  await mock.call('GET', `/__mock?spec=${encodeURIComponent(`${guessed.pid}:`)}`);
  const emptied = await staffOf();
  assert.deepEqual([emptied.role, emptied.guessed, emptied.from, emptied.spec], ['doctor', true, 'guess', null]);
});
