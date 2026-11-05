// Demo work statistics for the mock server (never in the build): GET /clinics/:id/work in the exact shape of
// the backend's answer (spec v1 §7.2, data/api/contract.js ClinicWorkApi), made from an invented world.
// Every person-day is drawn from a seeded random stream, so the same day always has the same numbers.
//
// The world of a clinic (src/dev/demoClinics.js picks the people and their marks):
//   doctors write forms (some with Dr. Filler Express: renewals, services), nurses everyday statuses, the
//   registry marks services and visits; a shared login is counted without time saved; a worker who objected
//   has no work statistics (billing only); one person still runs an old extension (no counts at all); days
//   before `firstWorkDay` (18 days ago) have counts only, like days before the extension sent them.
// These numbers are not the Usage and invoice view's (that one comes from the demo requests), on purpose: the
// mock only has to show every state of the page.

const DAY_MS = 86400000;
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = (t) => DAY.format(new Date(t));
const addDays = (key, n) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (key) => new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;

/** FNV-1a → a 32-bit seed; mulberry32 → a stream in [0, 1). */
const seedOf = (textValue) => {
  let h = 2166136261;
  for (let i = 0; i < textValue.length; i += 1) {
    h ^= textValue.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const streamOf = (textValue) => {
  let a = seedOf(textValue);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const between = (rand, lo, hi) => lo + (hi - lo) * rand();
const count = (rand, mean) => Math.max(0, Math.round(mean * between(rand, 0.6, 1.4)));

// The national averages (backend services/stats/timeModel.js RATES)
const RATE_SRC = 'https://ligoniukasa.lrv.lt/lt/atviri-duomenys-1/informacija-apie-gydymo-istaigu-darbuotoju-darbo-uzmokesti/';
export const DEMO_RATES = Object.freeze({
  doctor: { eur: 38.56, lo: 36.1, hi: 42.03, src: RATE_SRC },
  nurse: { eur: 18.95, lo: 17.65, hi: 20.65, src: RATE_SRC },
  other: { eur: 16.53, lo: 15.51, hi: 18.01, src: RATE_SRC },
  admin: { eur: 9.91, lo: 9.23, hi: 10.8, src: RATE_SRC },
});

// A part of the model's constants (backend services/stats/timeModel.js CONSTANTS), enough for the view
const SAURO = 'https://measuringu.com/papers/Sauro_HCII2009.pdf';
const MODEL = {
  version: 'v1',
  constants: {
    R_type: { v: 117, lo: 95, hi: 173, unit: 'chars/min', src: 'https://doi.org/10.2196/jmir.5072', lt: 'Rašymo ranka greitis', en: 'Typing speed, incl. thinking and corrections' },
    R_scan: { v: 2360, lo: 1250, hi: 3400, unit: 'chars/min', src: 'https://doi.org/10.1016/j.jml.2019.104047', lt: 'Greito peržvelgimo greitis', en: 'Skimming speed' },
    R_rev: { v: 946, lo: 525, hi: 1250, unit: 'chars/min', src: 'https://www.humanfactors.com/newsletters/human_interaction_speeds.asp', lt: 'Atidaus skaitymo greitis', en: 'Careful review speed' },
    SHARE: { v: 0.392, lo: 0.225, hi: 1, unit: 'share', src: 'https://doi.org/10.1001/jamainternmed.2020.7071', lt: 'Ranka rašoma įrašo dalis', en: 'Share of a note typed by hand' },
    SCAN: { v: 0.5, lo: 0.25, hi: 0.75, unit: 'share', src: 'assumption', lt: 'Įskaitoma peržvelgimo dalis', en: 'Share of skimming credited' },
    EDIT: { v: 0.05, lo: 0.02, hi: 0.15, unit: 'share', src: 'assumption', lt: 'Perrašoma teksto dalis', en: 'Share of the inserted text retyped' },
    CAP_FORM: { v: 1, lo: 0.57, hi: 2.1, unit: 'min', src: 'https://doi.org/10.1093/jamia/ocae304', lt: 'Lubos vienai formai', en: 'Ceiling: minutes per first-credit insert' },
    K_click: { v: 3.73, lo: 3.36, hi: 4.1, unit: 's', src: SAURO, lt: 'Vienas paspaudimas', en: 'One click, incl. finding it' },
    K_pick: { v: 3.04, lo: 2.74, hi: 3.96, unit: 's', src: SAURO, lt: 'Vienas pasirinkimas', en: 'One select' },
    K_chk: { v: 20, lo: 9, hi: 20, unit: 's', src: 'assumption', lt: 'Recepto patikrinimas', en: 'Checking one prescription' },
    K_code: { v: 10.4, lo: 6.3, hi: 13.7, unit: 's', src: SAURO, lt: 'Paslaugos kodas', en: 'One service code' },
    W_show: { v: 1, lo: 0.5, hi: 2, unit: 's', src: 'assumption', lt: 'Atsakymo parodymas', en: 'Transfer and display of one answer' },
  },
};
const DRIVERS = [['EDIT', 0.36], ['R_rev', 0.27], ['SHARE', 0.17], ['R_type', 0.12], ['CAP_FORM', 0.1], ['K_chk', 0.07], ['SCAN', 0.05], ['K_click', 0.03]];

// The parts and activities of the backend's report (clinicView/page/report.js PARTS, ACTIVITIES): the day
// rule's cut is a negative "by hand" part and its own activity, so the parts add up to the net
const PARTS = [
  ['hand_text', 'hand', 'Teksto rašymas', 'Writing the text'],
  ['hand_docs', 'hand', 'Dokumentų peržiūra', 'Reading the documents'],
  ['hand_fields', 'hand', 'Formos laukai ir TLK kodai', 'Form fields and TLK codes'],
  ['hand_rx', 'hand', 'Receptai', 'Prescriptions'],
  ['hand_svc', 'hand', 'Paslaugos ir vizitų užbaigimas', 'Services and closing visits'],
  ['hand_tools', 'hand', 'ŠKL, echoskopija, F025', 'ŠKL, echo, F025'],
  ['hand_sys', 'hand', 'Klinikos sistemos laukimas', 'Waiting for the clinic system'],
  ['hand_cap', 'hand', 'Neįskaityta: riba vienai formai', 'Not counted: the ceiling per form'],
  ['hand_day', 'hand', 'Neįskaityta: dienos riba (30 min.)', 'Not counted: the day rule (30 min)'],
  ['df_input', 'df', 'Aprašymo diktavimas ir rašymas', 'Dictating and typing the description'],
  ['df_wait', 'df', 'Laukimas, kol sugeneruojama', 'Waiting for the answer'],
  ['df_read', 'df', 'Teksto skaitymas ir taisymas', 'Reading and fixing the text'],
  ['df_rx', 'df', 'Receptų patikra', 'Checking prescriptions'],
  ['df_express', 'df', 'Dr. Filler Express darbas', 'Watching Dr. Filler Express'],
  ['df_press', 'df', 'Mygtukų paspaudimai', 'Button presses'],
];
const ACTIVITIES = [
  ['e025', 'E025 konsultacijos', 'E025 visits'],
  ['exam', 'Pirminės apžiūros', 'First exams'],
  ['daily', 'Kasdienė būklė', 'Everyday status'],
  ['form_other', 'Kitos formos', 'Other forms'],
  ['ref', 'Siuntimai (E027)', 'Referrals (E027)'],
  ['rx', 'Receptų pratęsimas', 'Prescription renewal'],
  ['svc', 'Paslaugos ir „Atlikti“', 'Services and „Atlikti“'],
  ['skl', 'ŠKL programa', 'ŠKL programme'],
  ['echo', 'Echoskopija', 'Echo'],
  ['f025', 'F025 įrašai', 'F025 notes'],
  ['ana', 'Anamnezės santraukos', 'Anamnesis summaries'],
  ['other', 'Kiti veiksmai', 'Other actions'],
  ['limit', 'Neįskaityta: dienos riba (30 min.)', 'Not counted: the day rule (30 min)'],
];
// Button ids with their labels (backend services/stats/registry.js BUTTONS) and who presses them how often
const BUTTONS = [
  ['gen', 'Generuoti formas', 'Generate forms', { doctor: 1, nurse: 1, other: 1 }],
  ['fill', 'Užpildyti E025/a, apžiūrą ar statusą', 'Fill the form (E025, exam or status)', { doctor: 0.9, nurse: 1, other: 0.9 }],
  ['mic', 'Įrašyti (diktavimas)', 'Dictation microphone (start or stop)', { doctor: 1.6, nurse: 0.6, other: 1 }],
  ['doc_all', 'Visus / Pridėti visus į Dr. Filler', 'Add all documents', { doctor: 0.5, other: 0.3 }],
  ['doc_pill', '+ Dr. Filler (dokumento eilutėje)', '+ Dr. Filler on a document row', { doctor: 0.4, nurse: 0.2 }],
  ['tlk_chip', 'TLK pasiūlymas (pridėti diagnozę)', 'TLK suggestion chip (add a diagnosis)', { doctor: 0.6 }],
  ['x_rx', 'Express: Receptai', 'Express: prescription renewal', { doctor: 0.25 }],
  ['x_fill', 'Express: Užpildyti visus', 'Express: fill all prescriptions', { doctor: 0.22 }],
  ['x_cal', 'Express: Kalendorius', 'Express: calendar (visit marked done)', { doctor: 0.2, admin: 1.2 }],
  ['x_svc3665', 'Express: Paslauga 3665', 'Express: service 3665', { admin: 0.6 }],
  ['x_svc3', 'Express: Paslaugos 1 + 3200 + 3199', 'Express: services 1 + 3200 + 3199', { admin: 0.4 }],
  ['x_ref', 'Express: Siuntimas', 'Express: referral', { doctor: 0.08 }],
  ['x_doctor', 'Express: Gydytojas (pasirinkimas)', 'Express: doctor picker', { admin: 0.3 }],
  ['ref_list', 'Siuntimai / Užpildyti E027/a', 'Referral list', { doctor: 0.15 }],
  ['ref_ins', 'Įterpti siuntimą', 'Insert a referral', { doctor: 0.13 }],
  ['clear', 'Išvalyti viską', 'Clear all', { doctor: 0.3, nurse: 0.4, other: 0.3 }],
  ['day_new', 'Naujas vizitas', 'New visit', { doctor: 0.4, other: 0.3 }],
  ['day_cont', 'Tęsti', 'Continue with the earlier data', { doctor: 0.1 }],
  ['new_form', 'Nauja forma', 'New form', { nurse: 0.5 }],
  ['conv', 'Pokalbis: įrašyti visą pokalbį', 'Record the whole conversation (start or stop)', { doctor: 0.2 }],
  ['phone', 'Iš telefono', 'From the phone', { doctor: 0.05 }],
  ['close', 'Uždaryti / Suskleisti skydelį', 'Close or fold the panel', { doctor: 0.2, nurse: 0.3, admin: 0.1 }],
  ['settings', 'Nustatymai', 'Settings', { doctor: 0.01, nurse: 0.01 }],
  ['skl_fill', 'ŠKL anketa: Užpildyti automatiškai', 'ŠKL questionnaire: fill automatically', { cardio: 0.3 }],
  ['skl_plan1', 'ŠKL planas: ŠKL-1', 'ŠKL plan: ŠKL-1 (initial)', { cardio: 0.15 }],
  ['echo_gen', 'Echoskopija: Generuoti', 'Echo: generate the table', { cardio: 0.1 }],
  ['echo_send', 'Echoskopija: Išsaugoti ir siųsti į kortelę', 'Echo: save and attach the PDF', { cardio: 0.1 }],
];

// What one form, referral, … takes by hand and with Dr. Filler, in minutes (the demo's own rough model)
const HAND_PER_FORM = { doctor: 5.6, nurse: 2.6, other: 3.4, admin: 2.2 };
const DF_PER_FORM = { doctor: 5.0, nurse: 1.2, other: 2.8, admin: 1.9 };
const COST_PER_FORM_EUR = 0.025;
const COST_PER_AUDIO_MIN_EUR = 0.0015;

// Counts that only the extension reports (its events): unknown before it sent them, or from an old extension
const EVENT_COUNTS = ['formsAuto', 'inserts', 'referrals', 'referralsProposed', 'rxNew', 'rxSaved', 'fillRuns', 'services', 'visitsDone', 'formsSaved', 'docs', 'dx', 'skl', 'f025', 'echoPdf', 'anamnesis', 'presses'];

/**
 * One person's invented day: counts and minutes. Before `firstWorkDay`, and with an old extension, only what
 * the server books itself is known (forms, recordings); a shared login is counted but gets no minutes.
 */
function personDay(person, day, { firstWorkDay, clinicId }) {
  const rand = streamOf(`${clinicId}|${person.pid}|${day}`);
  const weekend = [0, 6].includes(weekday(day));
  const p = person.profile ?? {};
  // A heavy user has a long day now and then: it goes through the 30-minute day rule
  const busy = (weekend ? 0.08 : between(rand, 0.75, 1.25)) * (p.heavy && rand() < 0.12 ? 3 : 1);
  const role = person.role;
  const forms = count(rand, (role === 'doctor' ? p.forms ?? 14 : role === 'nurse' ? 7 : role === 'other' ? 4 : 0.6) * busy);
  const formsAuto = Math.min(forms, count(rand, forms * (p.express ?? 0)));
  const referrals = role === 'doctor' ? count(rand, forms * 0.12) : 0;
  const rxNew = p.express ? count(rand, forms * 0.5) : 0;
  const rxSaved = Math.min(rxNew, count(rand, rxNew * 0.85));
  const services = role === 'admin' ? count(rand, 14 * busy) : p.express ? count(rand, forms * 0.45) : 0;
  const visitsDone = role === 'admin' ? count(rand, 10 * busy) : p.express ? count(rand, forms * 0.3) : 0;
  const formsSaved = p.express ? count(rand, forms * 0.25) : 0;
  const skl = p.cardio ? count(rand, 3 * busy) : 0;
  const echoPdf = p.cardio ? count(rand, 1.2 * busy) : 0;
  const f025 = p.f025 ? count(rand, 6 * busy) : 0;
  const docs = role === 'doctor' ? count(rand, forms * 1.1) : count(rand, forms * 0.3);
  const dx = role === 'doctor' ? count(rand, forms * 0.7) : 0;
  const audioMin = round1(forms * between(rand, 0.4, 1.1) * (role === 'doctor' ? 1 : 0.4));
  const presses = Math.round(forms * 5.5 + services * 1.3 + skl * 2 + echoPdf * 4);
  const counts = {
    forms, formsAuto, formsHelper: p.helper && forms ? 1 : 0, regenerated: count(rand, forms * 0.06), inserts: Math.max(0, forms - count(rand, forms * 0.08)),
    referrals, referralsProposed: count(rand, referrals * 0.6), rxNew, rxSaved, fillRuns: p.express ? count(rand, forms * 0.2) : 0, services, visitsDone, formsSaved,
    docs, dx, skl, f025, echoPdf, anamnesis: role === 'doctor' && rand() < 0.15 ? 1 : 0, audioMin, phone: role === 'doctor' && rand() < 0.1 ? 1 : 0, presses,
  };
  // Codes of the services (one code = one service)
  const codes = {};
  const addCode = (code, n) => {
    if (n > 0) codes[code] = (codes[code] ?? 0) + n;
  };
  if (role === 'admin') {
    const sets = Math.round(services / 3);
    addCode('1', sets);
    addCode('3200', sets);
    addCode('3199', services - 2 * sets);
  } else addCode('3665', services);
  if (skl) addCode(rand() < 0.5 ? '4257' : '4259', Math.round(skl / 2));
  counts.services = Object.values(codes).reduce((s, n) => s + n, 0);

  const sends = Boolean(firstWorkDay) && day >= firstWorkDay && !person.oldApp;
  if (!sends) {
    EVENT_COUNTS.forEach((key) => { counts[key] = 0; });
    Object.keys(codes).forEach((code) => delete codes[code]);
  }
  const counted = sends && !person.ex;
  const hand = Object.fromEntries(PARTS.map(([key]) => [key, 0]));
  if (counted) {
    const perForm = HAND_PER_FORM[role];
    const dfForm = DF_PER_FORM[role];
    hand.hand_text = forms * perForm * 0.55 + referrals * 1.6;
    hand.hand_docs = forms * perForm * 0.27;
    hand.hand_fields = forms * perForm * 0.18 + dx * 0.12;
    hand.hand_rx = rxNew * 1.15 + rxSaved * 0.68;
    hand.hand_svc = counts.services * 0.35 + visitsDone * 0.19 + formsSaved * 0.06;
    hand.hand_tools = skl * 2 + f025 * 0.29 + echoPdf * 3.5;
    hand.hand_sys = counts.fillRuns * 0.1;
    hand.df_input = forms * dfForm * 0.2;
    hand.df_wait = forms * dfForm * 0.05;
    hand.df_read = forms * dfForm * 0.75 + referrals * 1.04;
    hand.df_rx = rxNew * 1.0;
    hand.df_express = counts.fillRuns * 0.6 + visitsDone * 0.12;
    hand.df_press = presses * 0.062;
  }
  const byHandMin = PARTS.filter(([, side]) => side === 'hand').reduce((s, [key]) => s + hand[key], 0);
  const spentMin = PARTS.filter(([, side]) => side === 'df').reduce((s, [key]) => s + hand[key], 0);
  return { counts, codes, parts: hand, byHandMin, spentMin, netMin: byHandMin - spentMin, counted, sends };
}

/**
 * The work answer of a clinic for the days from … to, both included (as the backend counts them).
 * @param {{
 *   clinic: { id: string, name: string, billing: 'invoice'|'prepaid', markupPct?: number, statsShown?: boolean, hourEur?: object, createdAt?: number|null },
 *   people: Array<{ pid: string, email: string|null, role: string, guessed: boolean, spec: string|null, ex: boolean,
 *     statsOff: boolean, member: boolean, profile?: object, oldApp?: boolean }>,
 *   from: string, to: string, workers?: string[]|null, nowMs: number, creditPriceEur?: number|null
 * }} input creditPriceEur: a prepaid clinic's average price of a paid credit (null = its credits came free)
 */
export function demoWork({ clinic, people, from, to, workers = null, nowMs, creditPriceEur = null }) {
  const today = dayOf(nowMs);
  const firstWorkDay = addDays(today, -18);
  // Both days are included; days after today have nothing yet
  const last = to < today ? to : today;
  const end = addDays(last, 1);
  const picked = Array.isArray(workers) && workers.length ? new Set(workers) : null;
  const shown = people.filter((p) => !picked || picked.has(p.pid));
  const hourEur = clinic.hourEur ?? {};
  const rateOf = (role) => (Number.isFinite(hourEur[role]) ? hourEur[role] : DEMO_RATES[role].eur);

  const totals = { savedMin: 0, netMin: 0, spentMin: 0, byHandMin: 0, valueEur: 0, paidEur: 0, ourCostEur: 0, forms: 0, formsAuto: 0, formsHelper: 0, inserts: 0, regenerated: 0, referrals: 0, referralsProposed: 0, rxNew: 0, rxSaved: 0, fillRuns: 0, services: 0, servicesByCode: {}, visitsDone: 0, formsSaved: 0, docs: 0, dx: 0, skl: 0, f025: 0, echoPdf: 0, anamnesis: 0, audioMin: 0, phone: 0, presses: 0 };
  const parts = Object.fromEntries(PARTS.map(([key]) => [key, 0]));
  const activities = Object.fromEntries(ACTIVITIES.map(([key]) => [key, { count: 0, savedMin: 0 }]));
  const daily = new Map();
  const buttons = new Map();
  const byWorker = [];
  const versions = [];
  let daysCapped = 0;
  let anyEvents = false;
  const cardioOf = (p) => (p.profile?.cardio ? 'cardio' : null);

  shown.forEach((person) => {
    const w = { pid: person.pid, email: person.email, role: person.role, guessed: person.guessed, spec: person.spec, ex: person.ex, statsOff: person.statsOff, nt: false, member: person.member, gone: false, days: 0, credits: 0, forms: 0, formsAuto: 0, referrals: 0, rxNew: 0, rxSaved: 0, services: 0, savedMin: 0, valueEur: null, paidEur: 0, workDays: 0 };
    let sentLast = null; // the last day this person's extension sent its counts
    const credits = { forms: 0, audioMin: 0 };
    for (let day = from; day < end; day = addDays(day, 1)) {
      if (clinic.createdAt && day < dayOf(clinic.createdAt - 40 * DAY_MS)) continue;
      const d = personDay(person, day, { firstWorkDay, clinicId: clinic.id });
      if (d.counts.forms === 0 && d.counts.services === 0) continue;
      w.days += 1;
      w.forms += d.counts.forms;
      credits.forms += d.counts.forms;
      credits.audioMin += d.counts.audioMin;
      // A worker who objected: billing only (the forms), nothing about the work
      if (person.statsOff) continue;
      if (d.sends) anyEvents = true;
      ['formsAuto', 'referrals', 'rxNew', 'rxSaved', 'services'].forEach((key) => { w[key] += d.counts[key]; });
      Object.keys(d.counts).forEach((key) => { totals[key] += d.counts[key]; });
      Object.entries(d.codes).forEach(([code, n]) => { totals.servicesByCode[code] = (totals.servicesByCode[code] ?? 0) + n; });
      // The day rule: above 30 minutes a day counts 30 (the demo has no median to compare with)
      let net = d.netMin;
      let cut = 0;
      if (d.counted && net > 30) {
        cut = net - 30;
        net = 30;
        daysCapped += 1;
      }
      if (d.counted) {
        w.workDays += 1;
        PARTS.forEach(([key]) => { parts[key] += d.parts[key]; });
        parts.hand_day -= cut;
        activities.limit.savedMin -= cut;
        totals.byHandMin += d.byHandMin - cut;
        totals.spentMin += d.spentMin;
        totals.netMin += net;
        w.savedMin += net;
        const row = daily.get(day) ?? { day, savedMin: 0, spentMin: 0, byHandMin: 0 };
        row.savedMin += net;
        row.spentMin += d.spentMin;
        row.byHandMin += d.byHandMin - cut;
        daily.set(day, row);
        const perForm = d.counts.forms ? (HAND_PER_FORM[person.role] - DF_PER_FORM[person.role]) : 0;
        const formKey = person.role === 'nurse' ? 'daily' : 'e025';
        activities[formKey].count += d.counts.forms;
        activities[formKey].savedMin += d.counts.forms * perForm;
        activities.ref.count += d.counts.referrals;
        activities.ref.savedMin += d.counts.referrals * 0.48;
        activities.rx.count += d.counts.rxNew;
        activities.rx.savedMin += d.counts.rxNew * 0.15 + d.counts.rxSaved * 0.68;
        activities.svc.count += d.counts.services + d.counts.visitsDone;
        activities.svc.savedMin += d.counts.services * 0.3 + d.counts.visitsDone * 0.19;
        activities.skl.count += d.counts.skl;
        activities.skl.savedMin += d.counts.skl * 1.6;
        activities.echo.count += d.counts.echoPdf;
        activities.echo.savedMin += d.counts.echoPdf * 2.9;
      }
      // Presses per button, by who the person is (the click counter is part of the extension's counts)
      if (!d.sends) continue;
      sentLast = day;
      const rand = streamOf(`${clinic.id}|${person.pid}|${day}|buttons`);
      BUTTONS.forEach(([id, , , weights]) => {
        const weight = weights[person.role] ?? weights[cardioOf(person)] ?? 0;
        const n = Math.round(d.counts.forms * weight * between(rand, 0.7, 1.3) + (person.role === 'admin' ? d.counts.services * (weights.admin ?? 0) * 0.3 : 0));
        if (n > 0) buttons.set(id, (buttons.get(id) ?? 0) + n);
      });
    }
    // What the clinic paid for this person: an invoice at our cost + markup, prepaid at the price of a credit
    const ourCost = credits.forms * COST_PER_FORM_EUR + credits.audioMin * COST_PER_AUDIO_MIN_EUR;
    totals.ourCostEur += ourCost;
    if (clinic.billing === 'invoice') w.paidEur = round2(ourCost * (1 + (clinic.markupPct ?? 30) / 100));
    else w.paidEur = creditPriceEur === null ? null : round2((credits.forms + Math.floor(credits.audioMin / 10)) * creditPriceEur);
    if (w.paidEur === null) totals.paidEur = null;
    else if (totals.paidEur !== null) totals.paidEur += w.paidEur;
    if (person.statsOff) totals.forms += w.forms;
    w.credits = credits.forms + Math.floor(credits.audioMin / 10);
    // No time at all for a shared login or a worker who objected (null, not 0)
    w.savedMin = person.ex || person.statsOff ? null : round1(w.savedMin);
    w.valueEur = person.guessed || person.ex || person.statsOff ? null : round2((w.savedMin * rateOf(person.role)) / 60);
    if (w.valueEur !== null) totals.valueEur += w.valueEur;
    if (sentLast) versions.push({ pid: person.pid, app: person.app ?? '3.2.190', lastDay: sentLast });
    byWorker.push(w);
  });

  const roles = ['doctor', 'nurse', 'other', 'admin'];
  const byRole = roles
    .map((role) => {
      const group = byWorker.filter((w) => w.role === role);
      const workDays = group.reduce((s, w) => s + w.workDays, 0);
      const savedMin = round1(group.reduce((s, w) => s + (w.savedMin ?? 0), 0));
      const set = group.filter((w) => w.valueEur !== null);
      const label = { doctor: ['Gydytojas', 'Doctor'], nurse: ['Slaugytojas', 'Nurse'], other: ['Kitas specialistas', 'Other clinical'], admin: ['Administracija', 'Registry & admin'] }[role];
      return {
        role,
        lt: label[0],
        en: label[1],
        workers: group.filter((w) => w.days > 0).length,
        guessed: group.filter((w) => w.guessed).length,
        savedMin,
        perWorkerDayMin: workDays ? round1(savedMin / workDays) : null,
        rateEur: rateOf(role),
        rateOwn: Number.isFinite(hourEur[role]),
        valueEur: set.length ? round2(set.reduce((s, w) => s + w.valueEur, 0)) : null,
      };
    })
    .filter((r) => byWorker.some((w) => w.role === r.role));
  const specs = new Map();
  byWorker.forEach((w) => {
    const spec = w.spec ?? 'Kita';
    const row = specs.get(spec) ?? { spec, workers: 0, savedMin: 0, perWorkerDayMin: null, valueEur: null };
    if (w.days > 0) row.workers += 1;
    row.savedMin = round1(row.savedMin + (w.savedMin ?? 0));
    if (w.valueEur !== null) row.valueEur = round2((row.valueEur ?? 0) + w.valueEur);
    specs.set(spec, row);
  });

  const netMin = round1(totals.netMin);
  const savedMin = Math.max(0, netMin);
  const swings = DRIVERS.map(([key, share]) => {
    const c = MODEL.constants[key];
    const swingMin = round1(savedMin * share);
    return { key, lt: c.lt, en: c.en, swingMin, atLoMin: round1(savedMin + swingMin * 0.6), atHiMin: round1(savedMin - swingMin) };
  });
  const spread = Math.sqrt(swings.reduce((s, d) => s + d.swingMin ** 2, 0));
  // Every day of the period has a line, as the backend sends it
  const days = [];
  for (let day = from; day <= last; day = addDays(day, 1)) {
    const d = daily.get(day);
    days.push({ day, savedMin: round1(d?.savedMin ?? 0), spentMin: round1(d?.spentMin ?? 0), byHandMin: round1(d?.byHandMin ?? 0), workers: 0 });
  }
  const busiest = byWorker.filter((w) => w.forms > 0 && !w.statsOff).sort((a, b) => b.forms - a.forms)[0];

  return {
    clinic: { id: clinic.id, name: clinic.name, billing: clinic.billing, statsShown: clinic.statsShown === true, hourEur: { ...hourEur }, markupPct: clinic.markupPct ?? 30 },
    from,
    to,
    today,
    // The clinic's first day with the extension's counts (the same for every period)
    firstWorkDay,
    model: MODEL,
    rates: DEMO_RATES,
    totals: {
      ...totals,
      savedMin,
      netMin,
      spentMin: round1(totals.spentMin),
      byHandMin: round1(totals.byHandMin),
      // null when nobody of the selection has a role the owner set (a guess earns no €)
      valueEur: byWorker.some((w) => w.valueEur !== null) ? round2(Math.max(0, totals.valueEur)) : null,
      paidEur: totals.paidEur === null ? null : round2(totals.paidEur),
      ourCostEur: round2(totals.ourCostEur),
      audioMin: round1(totals.audioMin),
      inserts: totals.inserts,
      workers: byWorker.filter((w) => w.days > 0).length,
      daysCapped,
    },
    parts: PARTS.map(([key, side, lt, en]) => ({ key, lt, en, side, min: round1(parts[key]) })),
    byRole,
    bySpecialty: [...specs.values()],
    byWorker: byWorker.map(({ workDays, ...w }) => w),
    // Every activity, as the backend sends them; 'other' and 'limit' have no count
    byActivity: ACTIVITIES.map(([key, lt, en]) => {
      const a = activities[key];
      const counted = key !== 'other' && key !== 'limit';
      return { key, lt, en, count: counted ? a.count : null, savedMin: round1(a.savedMin), perUnitMin: counted && a.count ? round2(a.savedMin / a.count) : null };
    }),
    daily: days,
    buttons: BUTTONS.filter(([id]) => buttons.has(id)).map(([id, lt, en]) => ({ id, lt, en, n: buttons.get(id) })).sort((a, b) => b.n - a.n),
    range: anyEvents
      ? { centralMin: netMin, lowMin: round1(Math.max(0, savedMin - spread)), highMin: round1(savedMin + 0.6 * spread), drivers: swings }
      : { centralMin: null, lowMin: null, highMin: null, drivers: [] },
    health: {
      versions,
      quality: { dup: anyEvents ? 4 : 0, bad: anyEvents ? 1 : 0, later: anyEvents ? 2 : 0, skip: 0, lost: 0, capped: 0 },
      checks: {
        // One invented person-day where the forms booked by the server and the credits disagree
        formsVsBilling: busiest && anyEvents ? [{ day: addDays(today, -3) < from ? from : addDays(today, -3), pid: busiest.pid, gen: 11, billed: 12 }] : [],
        insertsOverForms: anyEvents ? 1 : 0,
        daysCapped,
      },
    },
  };
}
