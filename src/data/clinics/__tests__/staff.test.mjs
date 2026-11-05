import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  NATIONAL_RATES, RATES_SOURCE, ROLE_FROM, STAFF_ROLES, guessRole, hourDraftOf, hourEurFromDraft, markOf, marksAfter, nationalRates, parseHourEur, profileRole, roleOf,
  sameHourEur, staffPatch,
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

test('the profile gives the role by the words of its specialty, like the server; none without a specialty', () => {
  assert.equal(profileRole('Bendrosios praktikos slaugytojas'), 'nurse');
  assert.equal(profileRole('Akušerė'), 'nurse');
  assert.equal(profileRole('Gydytojas akušeris ginekologas'), 'doctor', 'a doctor’s title wins');
  assert.equal(profileRole('Registratorė'), 'admin');
  assert.equal(profileRole('Gydytojas kardiologas'), 'doctor');
  assert.equal(profileRole('Kita'), 'doctor', 'the catch-all is a doctor');
  assert.equal(profileRole('Something typed'), 'doctor', 'a value outside the list too');
  [null, undefined, '', '   ', 42, {}].forEach((spec) => assert.equal(profileRole(spec), null, String(spec)));
  // The words alone (no specialty = a doctor): what profileRole uses, kept for the old name
  assert.equal(guessRole(''), 'doctor');
  assert.equal(guessRole('Slaugytoja'), 'nurse');
});

test('the role that counts: the owner’s while the profile still gives what it gave then, else the profile’s, else a guess', () => {
  const NURSE = 'Bendrosios praktikos slaugytojas';
  assert.deepEqual(roleOf(null, NURSE), { role: 'nurse', guessed: false, from: 'profile', profile: 'nurse' }, 'from the profile: a real role (€)');
  assert.deepEqual(roleOf(undefined, null), { role: 'doctor', guessed: true, from: 'guess', profile: null }, 'no specialty: a doctor as a guess');
  assert.deepEqual(roleOf({ ex: true }, 'Kita'), { role: 'doctor', guessed: false, from: 'profile', profile: 'doctor' }, 'an entry without a role');
  assert.deepEqual(roleOf({ role: 'admin', profileRole: 'doctor' }, 'Kita'), { role: 'admin', guessed: false, from: 'owner', profile: 'doctor' }, 'the owner’s role over the profile’s');
  assert.deepEqual(roleOf({ role: 'admin', profileRole: 'doctor' }, 'Šeimos gydytojas'), { role: 'admin', guessed: false, from: 'owner', profile: 'doctor' }, 'another specialty of the same role keeps it');
  assert.deepEqual(roleOf({ role: 'admin', profileRole: 'doctor' }, NURSE), { role: 'nurse', guessed: false, from: 'profile', profile: 'nurse' }, 'a specialty of another role: the profile counts again');
  assert.deepEqual(roleOf({ role: 'admin', profileRole: 'doctor' }, null), { role: 'doctor', guessed: true, from: 'guess', profile: null }, 'the specialty taken away: a guess again');
  assert.deepEqual(roleOf({ role: 'nurse', profileRole: null }, null), { role: 'nurse', guessed: false, from: 'owner', profile: null }, 'set while there was no specialty');
  assert.deepEqual(roleOf({ role: 'nurse', profileRole: null }, 'Kita'), { role: 'doctor', guessed: false, from: 'profile', profile: 'doctor' }, 'none → a specialty: the profile counts');
  assert.deepEqual(roleOf({ role: 'other' }, NURSE), { role: 'other', guessed: false, from: 'owner', profile: 'nurse' }, 'an entry from before the rule always counts');
  assert.deepEqual(roleOf({ role: 'boss', profileRole: 'nurse' }, NURSE).from, 'profile', 'a bad role counts as none');
  assert.deepEqual(roleOf({ role: 'other', profileRole: 'boss' }, NURSE).from, 'owner', 'a bad stored profile role: as an entry from before the rule');
  ROLE_FROM.forEach((from) => assert.ok(['owner', 'profile', 'guess'].includes(from)));
});

test('a member’s marks: the server’s (with where the role comes from), else the role the doctor list’s specialty gives', () => {
  const clinic = normalizeClinics({
    clinics: [rawClinic({ members: [{ pid: A, role: 'nurse', guessed: false, from: 'owner', profile: 'doctor', spec: 'Kita', ex: true, statsOff: false }, B, { pid: C, role: 'doctor', guessed: true }] })],
  })[0];
  assert.deepEqual(markOf(clinic, A, { specialization: 'Gydytojas kardiologas' }), { role: 'nurse', guessed: false, from: 'owner', profile: 'doctor', spec: 'Kita', ex: true, statsOff: false, known: true });
  assert.deepEqual(markOf(clinic, B, { specialization: 'Slaugytoja' }), { role: 'nurse', guessed: false, from: 'profile', profile: 'nurse', spec: 'Slaugytoja', ex: false, statsOff: false, known: false }, 'no marks from the server: the profile’s role');
  assert.deepEqual(markOf(clinic, B, null), { role: 'doctor', guessed: true, from: 'guess', profile: null, spec: null, ex: false, statsOff: false, known: false }, 'no marks, no specialty: a guess');
  assert.deepEqual(markOf(clinic, C, null), { role: 'doctor', guessed: true, from: 'guess', profile: null, spec: null, ex: false, statsOff: false, known: true }, 'an older server’s guess');
});

test('the PATCH body holds only valid marks; the marks after a save follow the server’s answer', () => {
  assert.deepEqual(staffPatch({ role: 'doctor', ex: true, statsOff: false, other: 1 }), { role: 'doctor', ex: true, statsOff: false });
  assert.deepEqual(staffPatch({ role: null }), { role: null });
  assert.equal(staffPatch({ role: 'boss', ex: 'yes' }), null);
  assert.equal(staffPatch(null), null);
  assert.ok(validate('staffPatch', staffPatch({ role: null, ex: false, statsOff: true })).ok);

  assert.deepEqual(marksAfter({ role: 'admin' }, null, 'Kita'), { role: 'admin', guessed: false, from: 'owner', profile: 'doctor' });
  assert.deepEqual(marksAfter({ role: 'admin' }, null), { role: 'admin', guessed: false, from: 'owner', profile: null });
  assert.deepEqual(marksAfter({ role: null }, {}, 'Slaugytojas'), { role: 'nurse', guessed: false, from: 'profile', profile: 'nurse' }, 'back to the profile');
  assert.deepEqual(marksAfter({ role: null }, {}, null), { role: 'doctor', guessed: true, from: 'guess', profile: null }, 'no specialty: back to the guess');
  // An older server: no `from` in its answer, its guessed role was a guess
  assert.deepEqual(marksAfter({ role: null }, { role: 'doctor', guessed: true, spec: 'Kita' }, 'Kita'), { role: 'doctor', guessed: true, from: 'guess', profile: 'doctor', spec: 'Kita' }, 'the server’s word wins');
  assert.deepEqual(marksAfter({ statsOff: true }, { entry: { ex: true }, statsOff: true, member: true }), { statsOff: true });
  // The backend's answer: { clinicId, staff: { pid, role, guessed, from, profile, spec, ex, statsOff, member } }
  const answer = { clinicId: CLINIC, staff: { pid: A, role: 'nurse', guessed: false, from: 'profile', profile: 'nurse', spec: 'Bendrosios praktikos slaugytojas', ex: false, statsOff: false, member: true } };
  assert.ok(validate('staffAnswer', answer).ok);
  assert.deepEqual(marksAfter({ role: null }, answer), { role: 'nurse', guessed: false, from: 'profile', profile: 'nurse', ex: false, statsOff: false, spec: 'Bendrosios praktikos slaugytojas' });
  const none = { clinicId: CLINIC, staff: { pid: A, role: 'doctor', guessed: true, from: 'guess', profile: null, spec: null, ex: false, statsOff: false, member: true } };
  assert.ok(validate('staffAnswer', none).ok);
  assert.deepEqual(marksAfter({ ex: false }, none), { role: 'doctor', guessed: true, from: 'guess', profile: null, ex: false, statsOff: false, spec: null }, 'a missing specialty is null, as sent');
  assert.equal(validate('staffAnswer', { clinicId: CLINIC, staff: { ...answer.staff, from: 'clinic' } }).ok, false);
  assert.equal(validate('staffAnswer', { clinicId: CLINIC, staff: { ...answer.staff, profile: 'boss' } }).ok, false);
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
  assert.deepEqual(clinic.staff[A], { role: 'doctor', guessed: false, from: 'owner', profile: null, spec: null, ex: true, statsOff: false }, 'an older answer: not guessed = the owner’s');
  assert.equal(clinic.staff[B].statsOff, true);
  assert.equal(clinic.staff[C].role, 'admin', 'a past member the owner marked keeps the marks (their rows stay in the clinic)');
  assert.deepEqual(clinic.members, [A, B], 'but is not a member');
  assert.deepEqual(clinic.hourEur, { doctor: 41.26, admin: 12 });
  assert.equal(clinic.statsShown, true);

  const [plain] = normalizeClinics({ clinics: [rawClinic({ staff: [{ pid: B, role: 'other' }] })] });
  assert.deepEqual(plain.staff, { [B]: { role: 'other', guessed: false, from: 'owner', profile: null, spec: null, ex: false, statsOff: false } });
  assert.deepEqual([plain.hourEur, plain.statsShown], [{}, false], 'an older server: no own rates, not shown');
  assert.ok(validate('clinic', rawClinic()).ok, 'plain pids are still the contract');
  assert.ok(validate('clinic', rawClinic({ members: [{ pid: A, role: null, guessed: true }, B], hourEur: { doctor: 40 }, statsShown: false })).ok);
  assert.equal(validate('clinic', rawClinic({ members: [{ pid: A, role: 'boss' }] })).ok, false);
});

test('where a role comes from: the server’s word; an older answer’s from its guess; unknown values dropped', () => {
  const NURSE = 'Bendrosios praktikos slaugytojas';
  const staff = [
    { pid: A, role: 'nurse', guessed: false, from: 'profile', profile: 'nurse', spec: NURSE, ex: false, statsOff: false, member: true },
    { pid: B, role: 'doctor', guessed: true, from: 'guess', profile: null, spec: null, ex: false, statsOff: false, member: true },
    { pid: C, role: 'admin', guessed: false, from: 'owner', profile: 'doctor', spec: 'Kita', ex: false, statsOff: false, member: false },
  ];
  assert.ok(validate('clinic', rawClinic({ staff })).ok, 'the new keys are the contract');
  const [clinic] = normalizeClinics({ clinics: [rawClinic({ staff })] });
  assert.deepEqual(clinic.staff[A], { role: 'nurse', guessed: false, from: 'profile', profile: 'nurse', spec: NURSE, ex: false, statsOff: false });
  assert.deepEqual(clinic.staff[B], { role: 'doctor', guessed: true, from: 'guess', profile: null, spec: null, ex: false, statsOff: false });
  assert.deepEqual(clinic.staff[C], { role: 'admin', guessed: false, from: 'owner', profile: 'doctor', spec: 'Kita', ex: false, statsOff: false });

  const odd = [{ pid: A, role: 'nurse', guessed: false, from: 'clinic', profile: 'boss' }, { pid: B, role: 'doctor', guessed: true, from: 7 }];
  assert.equal(validate('clinic', rawClinic({ staff: odd })).ok, false);
  const [older] = normalizeClinics({ clinics: [rawClinic({ staff: odd })] });
  assert.deepEqual([older.staff[A].from, older.staff[A].profile], ['owner', null], 'as an older answer: not guessed = the owner’s');
  assert.deepEqual([older.staff[B].from, older.staff[B].profile], ['guess', null]);
});

test('a saved change shows at once: marks onto the member, membership with marks, the clinic’s own fields', () => {
  let raw = bundle([rawClinic({ members: [A, { pid: B, role: 'nurse', guessed: false }] }), rawClinic({ id: OTHER, name: 'Kita klinika', members: [] })]);
  raw = withStaff(raw, CLINIC, A, { role: 'admin', guessed: false, ex: true });
  raw = withStaff(raw, CLINIC, B, { statsOff: true });
  const ours = () => normalizeClinics(raw.clinics).find((c) => c.id === CLINIC);
  let clinic = ours();
  assert.deepEqual(clinic.staff[A], { role: 'admin', guessed: false, from: 'owner', profile: null, spec: null, ex: true, statsOff: false });
  assert.deepEqual(clinic.staff[B], { role: 'nurse', guessed: false, from: 'owner', profile: null, spec: null, ex: false, statsOff: true });

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

  // Where the role comes from travels with the change: set by the owner, then back to the profile
  let fromBackend = bundle([rawClinic({ members: [A], staff: [{ pid: A, role: 'nurse', guessed: false, from: 'profile', profile: 'nurse', spec: 'Bendrosios praktikos slaugytojas', ex: false, statsOff: false, member: true }] })]);
  fromBackend = withStaff(fromBackend, CLINIC, A, marksAfter({ role: 'other' }, null, 'Bendrosios praktikos slaugytojas'));
  assert.deepEqual(normalizeClinics(fromBackend.clinics)[0].staff[A], { role: 'other', guessed: false, from: 'owner', profile: 'nurse', spec: 'Bendrosios praktikos slaugytojas', ex: false, statsOff: false });
  fromBackend = withStaff(fromBackend, CLINIC, A, marksAfter({ role: null }, null, 'Bendrosios praktikos slaugytojas'));
  assert.deepEqual(normalizeClinics(fromBackend.clinics)[0].staff[A], { role: 'nurse', guessed: false, from: 'profile', profile: 'nurse', spec: 'Bendrosios praktikos slaugytojas', ex: false, statsOff: false });
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
    const specs = ['Bendrosios praktikos slaugytojas', 'Akušerė', 'Gydytojas akušeris ginekologas', 'Registratorė', 'Administratorius', 'Kardiologija', 'Kita', '', '  ', null, undefined, 7];
    if (typeof roles.guessRole === 'function') specs.forEach((spec) => assert.equal(guessRole(spec), roles.guessRole(spec), `guessRole ${String(spec)}`));
    if (typeof roles.profileRole === 'function') specs.forEach((spec) => assert.equal(profileRole(spec), roles.profileRole(spec), `profileRole ${String(spec)}`));
    // The rule itself, once the backend knows where a role comes from
    if (typeof roles.roleOf === 'function' && 'from' in roles.roleOf(null, 'Kita')) {
      const entries = [
        null, {}, { ex: true }, { role: 'admin' }, { role: 'admin', profileRole: 'doctor' }, { role: 'nurse', profileRole: null }, { role: 'other', profileRole: 'nurse' },
        { role: 'boss' }, { role: 'other', profileRole: 'boss' }, { profileRole: 'nurse' }, [],
      ];
      entries.forEach((entry) =>
        specs.forEach((spec) => assert.deepEqual(roleOf(entry, spec), roles.roleOf(entry, spec), `roleOf ${JSON.stringify(entry)} ${String(spec)}`)),
      );
    }
  }
});
