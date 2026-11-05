import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  NATIONAL_RATES, RATES_SOURCE, STAFF_ROLES, guessRole, hourDraftOf, hourEurFromDraft, markOf, marksAfter, nationalRates, parseHourEur, sameHourEur, staffPatch,
} from '../staff.js';
import { normalizeClinics } from '../../normalize/clinics.js';
import { withClinic, withMembership, withStaff } from '../edits.js';
import { HOUR_EUR_MAX, validate } from '../../api/contract.js';
import { t } from '../../../copy/index.js';

// Work statistics on the owner's site: the roles and marks of a clinic's staff (PATCH /clinics/:id/staff/:pid)
// and the clinic's own value of an hour (PUT /clinics/:id hourEur). Invented pids and clinics.

const A = 'daaaaaaaaa';
const B = 'dbbbbbbbbb';
const C = 'dccccccccc';
const CLINIC = 'c1a2b3c4d5e6f7a8b';
const OTHER = 'c9f8e7d6c5b4a3f2e';

const rawClinic = (over = {}) => ({
  id: CLINIC, name: 'Testo klinika', billing: 'invoice', active: true, monthlyCapPerDoctor: 3000, note: '',
  credits: { available: 0, used: 0, total: 0 }, createdAt: 1, updatedAt: 1, members: [A, B], ...over,
});
const bundle = (clinics) => ({ clinics: { clinics }, doctors: { doctors: [] } });

test('the value of an hour as typed: euros above 0, at most 500, 2 decimals; blank = the national average', () => {
  assert.equal(parseHourEur(''), null);
  assert.equal(parseHourEur('   '), null);
  assert.equal(parseHourEur('38,56'), 38.56);
  assert.equal(parseHourEur(' 40 '), 40);
  assert.equal(parseHourEur('9.5'), 9.5);
  assert.equal(parseHourEur(String(HOUR_EUR_MAX)), HOUR_EUR_MAX);
  ['0', '0,00', '500,01', '1000', '38,567', '-5', 'abc', '38,5,6', '1e2'].forEach((text) => assert.ok(Number.isNaN(parseHourEur(text)), text));

  assert.deepEqual(hourDraftOf({ doctor: 40.5, admin: 12 }), { doctor: '40,5', nurse: '', other: '', admin: '12' });
  assert.deepEqual(hourEurFromDraft({ doctor: '40,5', nurse: '', other: ' ', admin: '12' }), { hourEur: { doctor: 40.5, admin: 12 } });
  assert.deepEqual(hourEurFromDraft({ doctor: '', nurse: 'x' }), { badRole: 'nurse' });
  assert.deepEqual(hourEurFromDraft({}), { hourEur: {} });
  assert.equal(sameHourEur({ doctor: 40.5 }, { doctor: 40.50000001 }), true);
  assert.equal(sameHourEur({ doctor: 40.5 }, {}), false);
  assert.equal(sameHourEur({}, null), true);
});

test('the national rates: the server’s when it sent them, else the site’s copy, always with a source', () => {
  const rates = nationalRates({ nurse: { eur: 19.5, lo: 18, hi: 21, src: 'https://example.test/vlk' }, admin: { eur: 'x' } });
  assert.deepEqual(rates.nurse, { eur: 19.5, lo: 18, hi: 21, src: 'https://example.test/vlk' });
  assert.deepEqual(rates.doctor, { ...NATIONAL_RATES.doctor, src: RATES_SOURCE });
  assert.equal(rates.admin.eur, NATIONAL_RATES.admin.eur, 'a broken rate falls back');
  assert.deepEqual(Object.keys(nationalRates()), STAFF_ROLES);
});

test('a role is guessed from the specialty like the server does; marks fall back to that guess', () => {
  assert.equal(guessRole('Bendrosios praktikos slaugytojas'), 'nurse');
  assert.equal(guessRole('Akušerė'), 'nurse');
  assert.equal(guessRole('Gydytojas akušeris ginekologas'), 'doctor', 'a doctor’s title wins');
  assert.equal(guessRole('Registratorė'), 'admin');
  assert.equal(guessRole('Kardiologija'), 'doctor');
  assert.equal(guessRole(''), 'doctor');
  assert.equal(guessRole(null), 'doctor');

  const clinic = normalizeClinics({ clinics: [rawClinic({ members: [{ pid: A, role: 'nurse', guessed: false, spec: 'Kita', ex: true, statsOff: false }, B] })] })[0];
  assert.deepEqual(markOf(clinic, A, { specialization: 'Kardiologija' }), { role: 'nurse', guessed: false, spec: 'Kita', ex: true, statsOff: false, known: true });
  assert.deepEqual(markOf(clinic, B, { specialization: 'Slaugytoja' }), { role: 'nurse', guessed: true, spec: 'Slaugytoja', ex: false, statsOff: false, known: false }, 'no marks from the server: a guess');
});

test('the PATCH body holds only valid marks; the marks after a save follow the server’s answer', () => {
  assert.deepEqual(staffPatch({ role: 'doctor', ex: true, statsOff: false, other: 1 }), { role: 'doctor', ex: true, statsOff: false });
  assert.deepEqual(staffPatch({ role: null }), { role: null });
  assert.equal(staffPatch({ role: 'boss', ex: 'yes' }), null);
  assert.equal(staffPatch(null), null);
  assert.ok(validate('staffPatch', staffPatch({ role: null, ex: false, statsOff: true })).ok);

  assert.deepEqual(marksAfter({ role: 'admin' }, null), { role: 'admin', guessed: false });
  assert.deepEqual(marksAfter({ role: null }, {}, 'Slaugytojas'), { role: 'nurse', guessed: true }, 'back to the guess');
  assert.deepEqual(marksAfter({ role: null }, { role: 'doctor', guessed: true, spec: 'Kita' }), { role: 'doctor', guessed: true, spec: 'Kita' }, 'the server’s guess wins');
  assert.deepEqual(marksAfter({ statsOff: true }, { entry: { ex: true }, statsOff: true, member: true }), { statsOff: true });
  // The backend's answer: { clinicId, staff: { pid, role, guessed, spec, ex, statsOff, member } }
  const answer = { clinicId: CLINIC, staff: { pid: A, role: 'nurse', guessed: true, spec: 'Slaugytoja', ex: false, statsOff: false, member: true } };
  assert.ok(validate('staffAnswer', answer).ok);
  assert.deepEqual(marksAfter({ role: null }, answer), { role: 'nurse', guessed: true, ex: false, statsOff: false, spec: 'Slaugytoja' });
});

test('members come as pids or with their marks; a separate staff list or map is read too', () => {
  const [clinic] = normalizeClinics({
    clinics: [
      rawClinic({
        members: [{ pid: B, role: 'nurse', guessed: false, spec: 'Kita', ex: false, statsOff: true }, A, { pid: 'bad' }, A],
        staff: { [A]: { role: 'doctor', ex: true }, [C]: { role: 'admin' } },
        hourEur: { doctor: 41.256, nurse: 0, admin: 12, boss: 50 },
        statsShown: true,
      }),
    ],
  });
  assert.deepEqual(clinic.members, [A, B], 'pids of both shapes, once each');
  assert.deepEqual(clinic.staff[A], { role: 'doctor', guessed: false, spec: null, ex: true, statsOff: false });
  assert.equal(clinic.staff[B].statsOff, true);
  assert.equal(clinic.staff[C].role, 'admin', 'a past member the owner marked keeps the marks (their rows stay in the clinic)');
  assert.deepEqual(clinic.members, [A, B], 'but is not a member');
  assert.deepEqual(clinic.hourEur, { doctor: 41.26, admin: 12 });
  assert.equal(clinic.statsShown, true);

  const [plain] = normalizeClinics({ clinics: [rawClinic({ staff: [{ pid: B, role: 'other' }] })] });
  assert.deepEqual(plain.staff, { [B]: { role: 'other', guessed: false, spec: null, ex: false, statsOff: false } });
  assert.deepEqual([plain.hourEur, plain.statsShown], [{}, false], 'an older server: no own rates, not shown');
  assert.ok(validate('clinic', rawClinic()).ok, 'plain pids are still the contract');
  assert.ok(validate('clinic', rawClinic({ members: [{ pid: A, role: null, guessed: true }, B], hourEur: { doctor: 40 }, statsShown: false })).ok);
  assert.equal(validate('clinic', rawClinic({ members: [{ pid: A, role: 'boss' }] })).ok, false);
});

test('a saved change shows at once: marks onto the member, membership with marks, the clinic’s own fields', () => {
  let raw = bundle([rawClinic({ members: [A, { pid: B, role: 'nurse', guessed: false }] }), rawClinic({ id: OTHER, name: 'Kita klinika', members: [] })]);
  raw = withStaff(raw, CLINIC, A, { role: 'admin', guessed: false, ex: true });
  raw = withStaff(raw, CLINIC, B, { statsOff: true });
  const ours = () => normalizeClinics(raw.clinics).find((c) => c.id === CLINIC);
  let clinic = ours();
  assert.deepEqual(clinic.staff[A], { role: 'admin', guessed: false, spec: null, ex: true, statsOff: false });
  assert.deepEqual(clinic.staff[B], { role: 'nurse', guessed: false, spec: null, ex: false, statsOff: true });

  raw = withMembership(raw, C, CLINIC);
  clinic = ours();
  assert.deepEqual(clinic.members, [A, B, C]);
  assert.equal(clinic.staff[A].role, 'admin', 'the marks stay when someone joins');
  raw = withMembership(raw, B, OTHER);
  const [first, second] = normalizeClinics(raw.clinics);
  assert.deepEqual([first.members, second.members], [[B], [A, C]], 'Kita klinika sorts first; B moved there');

  raw = withClinic(raw, { ...rawClinic(), members: undefined, hourEur: { doctor: 40 }, statsShown: true });
  const after = normalizeClinics(raw.clinics).find((c) => c.id === CLINIC);
  assert.deepEqual([after.members, after.hourEur, after.statsShown, after.staff[A]?.role], [[A, C], { doctor: 40 }, true, 'admin']);

  const keyed = withStaff(bundle([rawClinic({ staff: { [A]: { role: 'doctor' } } })]), CLINIC, A, { role: 'nurse', guessed: false });
  assert.equal(normalizeClinics(keyed.clinics)[0].staff[A].role, 'nurse', 'a pid-keyed staff map is changed too');

  // The backend's shape: pids in `members`, the marks in the `staff` list (a past member there too)
  let backend = bundle([rawClinic({ members: [A, B], staff: [{ pid: A, role: 'doctor', guessed: false, spec: 'Kita', ex: false, statsOff: false, member: true }, { pid: B, role: 'doctor', guessed: true, spec: null, ex: false, statsOff: false, member: true }] })]);
  backend = withStaff(backend, CLINIC, B, { role: 'nurse', guessed: false });
  backend = withStaff(backend, CLINIC, C, { ex: true });
  const shaped = normalizeClinics(backend.clinics)[0];
  assert.deepEqual([shaped.staff[A].role, shaped.staff[B].role, shaped.staff[B].guessed, shaped.staff[C].ex], ['doctor', 'nurse', false, true]);
  assert.deepEqual(shaped.members, [A, B], 'a past worker gets marks without becoming a member');
  assert.equal(backend.clinics.clinics[0].staff.find((m) => m.pid === C).member, false);
});

test('roles have their English names in the copy', () => {
  STAFF_ROLES.forEach((role) => assert.notEqual(t(`clinics.role.${role}`), `clinics.role.${role}`, role));
});

// The site's copies of the backend's rates, roles and role guess (when ../backend sits next to this repo)
const backend = (file) => fileURLToPath(new URL(`../../../../../backend/services/stats/${file}`, import.meta.url));
const hasBackend = existsSync(backend('timeModel.js')) && existsSync(backend('registry.js'));

test('the site’s copies agree with the backend', { skip: !hasBackend && 'backend repo not next to admin' }, () => {
  const require = createRequire(import.meta.url);
  const model = require(backend('timeModel.js'));
  const registry = require(backend('registry.js'));
  STAFF_ROLES.forEach((role) => {
    const r = model.RATES[role];
    assert.deepEqual(NATIONAL_RATES[role], { eur: r.eur, lo: r.lo, hi: r.hi }, role);
    assert.equal(RATES_SOURCE, r.src, `${role} source`);
    assert.equal(t(`clinics.role.${role}`), registry.ROLES[role].en, `${role} label`);
  });
  assert.deepEqual([...STAFF_ROLES], [...registry.ROLE_IDS]);
  assert.equal(HOUR_EUR_MAX, model.MAX_HOUR_EUR);
  if (existsSync(backend('roles.js'))) {
    const roles = require(backend('roles.js'));
    ['Bendrosios praktikos slaugytojas', 'Akušerė', 'Gydytojas akušeris ginekologas', 'Registratorė', 'Administratorius', 'Kardiologija', 'Kita', '', null].forEach((spec) =>
      assert.equal(guessRole(spec), roles.guessRole(spec), String(spec)),
    );
  }
});
