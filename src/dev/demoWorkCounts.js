// Demo work counts for the mock server and ?demo (never in the build): GET /work-counts in the exact shape of the
// backend's answer (services/stats/peopleCounts.js sumRows, data/api/contract.js WorkCountsApi).
//
// The world: every form a demo doctor made (the demo requests) is a form Dr. Filler counted, and the extension's
// own counts (presses per button, Express forms, prescriptions, „Užpildyti visus“, services …) are drawn per
// person-day from a seeded stream, by how the person works: every fourth person uses Dr. Filler Express, and one
// account uses only Express (no request at all). Counting starts as on the live server:
//   - the clinics' people: 18 days ago, everything (as src/dev/demoWork.js)
//   - everyone else: the forms from the day the server began to count personal rows (8 days ago), the
//     extension's own counts from the day their extension updated (1–5 days ago); one person in nine never
//     updated (an old extension: forms only)
// so older periods show little or nothing. An erased account's last days are counted apart, never as a person.
// Each person-day has its own seed: the same day always has the same numbers.

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = (t) => DAY.format(new Date(t));
const addDays = (key, n) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isWeekend = (key) => [0, 6].includes(new Date(`${key}T00:00:00Z`).getUTCDay());

/** FNV-1a → a 32-bit seed; mulberry32 → a stream in [0, 1). */
const streamOf = (seedText) => {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const between = (rand, lo, hi) => lo + (hi - lo) * rand();
const about = (rand, mean) => Math.max(0, Math.round(mean * between(rand, 0.6, 1.4)));

/** Button ids with their LT and EN labels (backend services/stats/registry.js BUTTONS). */
export const DEMO_BUTTONS = Object.freeze({
  gen: ['Generuoti formas', 'Generate forms'],
  fill: ['Užpildyti E025/a, apžiūrą ar statusą', 'Fill the form (E025, exam or status)'],
  mic: ['Įrašyti (diktavimas)', 'Dictation microphone (start or stop)'],
  conv: ['Pokalbis: įrašyti visą pokalbį', 'Record the whole conversation (start or stop)'],
  clear: ['Išvalyti viską', 'Clear all'],
  day_new: ['Naujas vizitas', 'New visit'],
  close: ['Uždaryti / Suskleisti skydelį', 'Close or fold the panel'],
  doc_pill: ['+ Dr. Filler (dokumento eilutėje)', '+ Dr. Filler on a document row'],
  doc_all: ['Visus / Pridėti visus į Dr. Filler', 'Add all documents'],
  tlk_chip: ['TLK pasiūlymas (pridėti diagnozę)', 'TLK suggestion chip (add a diagnosis)'],
  ref_list: ['Siuntimai / Užpildyti E027/a', 'Referral list'],
  ref_ins: ['Įterpti siuntimą', 'Insert a referral'],
  skl_kartoti: ['Kartoti (receptą)', 'Repeat a prescription'],
  x_rx: ['Express: Receptai', 'Express: prescription renewal'],
  x_fill: ['Express: Užpildyti visus', 'Express: fill all prescriptions'],
  x_cal: ['Express: Kalendorius', 'Express: calendar (visit marked done)'],
  x_svc3665: ['Express: Paslauga 3665', 'Express: service 3665'],
  x_svc3: ['Express: Paslaugos 1 + 3200 + 3199', 'Express: services 1 + 3200 + 3199'],
  x_ref: ['Express: Siuntimas', 'Express: referral'],
  x_doctor: ['Express: Gydytojas (pasirinkimas)', 'Express: doctor picker'],
  x_days: ['Gydymo trukmė (receptų sąraše)', 'Treatment days badge'],
});

/** The main buttons (backend services/stats/registry.js MAIN_BUTTONS): the server marks them `main`. */
export const DEMO_MAIN_BUTTONS = Object.freeze(new Set([
  'tlk_chip', 'x_rx', 'x_ref', 'x_fill', 'x_cal', 'x_svc1', 'x_svc3665', 'x_svc3', 'x_svc4', 'x_e027', 'x_new',
  'rx_shift', 'rx_dlg', 'rx_comp', 'abx_close', 'abx_tesiu', 'abx_keiciu', 'abx_dx', 'abx_hide',
  'ana_start', 'ana_zip', 'echo_send', 'skl_fill', 'skl_replace', 'skl_ekg_norm', 'skl_ekg_lvh', 'skl_plan_new', 'skl_plan1',
  'skl_plan2', 'skl_e025_new', 'skl_e025_res', 'skl_e027_new', 'skl_025_card', 'skl_025_btn', 'skl_025_svc', 'skl_kartoti',
  'f025_search', 'f025_start', 'f025_answer',
]));

const COUNT_KEYS = ['forms', 'formsAuto', 'inserts', 'referrals', 'rxNew', 'rxRep', 'rxSaved', 'fillRuns', 'services', 'servicesAuto', 'visitsDone', 'formsSaved', 'docs', 'dx', 'presses'];
const zero = () => Object.fromEntries(COUNT_KEYS.map((key) => [key, 0]));
const add = (into, values) => {
  COUNT_KEYS.forEach((key) => {
    into[key] += values[key] ?? 0;
  });
};

const CLINIC_SINCE_DAYS = 18; // the clinics' people (src/dev/demoWork.js firstWorkDay)
const SERVER_SINCE_DAYS = 8; // personal rows: the server's own counts (forms)
const UPDATE_DAYS = [1, 3, 5, 2, 4]; // when a person's extension updated (by their place in the doctor list)
const EXPRESS_ONLY_INDEX = 28; // 'today' world: a free account that never made a request, Express only
const ERASED_DAYS = [12, 11, 10]; // days ago an erased account still worked

/**
 * How one person-day goes: the server's forms plus, once their extension sends counts, its own counts.
 * @returns {{ values: object, buttons: Record<string, number> }|null} null = nothing that day
 */
function personDay({ pid, forms, express, expressOnly, sends, day }) {
  const rand = streamOf(`work-counts|${pid}|${day}`);
  const onlyExpressToday = expressOnly && sends && !isWeekend(day);
  if (forms === 0 && !onlyExpressToday) return null;
  const values = zero();
  const buttons = {};
  values.forms = forms;
  if (!sends) return { values, buttons };
  const press = (id, n) => {
    const k = Math.max(0, Math.round(n));
    if (k > 0) buttons[id] = (buttons[id] ?? 0) + k;
  };

  values.formsAuto = express ? Math.min(forms, about(rand, forms * 0.3)) : 0;
  values.inserts = Math.max(0, forms - about(rand, forms * 0.08));
  values.referrals = about(rand, forms * 0.1);
  values.rxNew = express ? about(rand, forms * 0.6) : 0;
  values.rxRep = express ? 0 : about(rand, forms * 0.06);
  values.services = express ? about(rand, forms * 0.5) : 0;
  values.visitsDone = express ? about(rand, forms * 0.3) : 0;
  values.formsSaved = express ? about(rand, forms * 0.25) : 0;
  values.docs = about(rand, forms * 1.1);
  values.dx = about(rand, forms * 0.6);
  if (onlyExpressToday) {
    // Express on the clinic's pages only: renewals, services and closed visits, no form of Dr. Filler's own
    values.rxNew += Math.round(between(rand, 8, 20));
    values.services += Math.round(between(rand, 4, 10));
    values.visitsDone += Math.round(between(rand, 3, 8));
  }
  values.rxSaved = Math.min(values.rxNew + values.rxRep, about(rand, (values.rxNew + values.rxRep) * 0.85));
  values.fillRuns = values.rxNew > 0 ? Math.max(1, Math.round(values.rxNew / between(rand, 3, 6))) : 0;
  values.servicesAuto = Math.min(values.services, about(rand, values.services * 0.7));

  const manual = forms - values.formsAuto;
  press('gen', manual * between(rand, 1, 1.15));
  press('fill', values.inserts * between(rand, 0.8, 1));
  press('mic', manual * between(rand, 0.8, 1.8));
  press('conv', manual * between(rand, 0, 0.3));
  press('clear', manual * between(rand, 0.1, 0.4));
  press('day_new', manual * between(rand, 0.2, 0.5));
  press('close', forms * between(rand, 0.05, 0.25));
  press('doc_all', values.docs * between(rand, 0.3, 0.5));
  press('doc_pill', values.docs * between(rand, 0.1, 0.3));
  press('tlk_chip', values.dx * between(rand, 0.3, 0.7));
  press('ref_list', values.referrals * between(rand, 0.6, 1));
  press('ref_ins', values.referrals * between(rand, 0.5, 0.9));
  press('skl_kartoti', values.rxRep);
  if (values.rxNew > 0) {
    press('x_rx', values.fillRuns * between(rand, 1, 1.5));
    press('x_fill', values.fillRuns);
    press('x_days', values.rxNew * between(rand, 0, 0.2));
  }
  press('x_cal', values.visitsDone);
  press('x_svc3665', values.servicesAuto * 0.6);
  press('x_svc3', values.servicesAuto * 0.15);
  press('x_ref', values.formsAuto * between(rand, 0, 0.2));
  if (values.servicesAuto > 0) press('x_doctor', between(rand, 0, 2));
  values.presses = Object.values(buttons).reduce((s, n) => s + n, 0);
  return { values, buttons };
}

/**
 * The /work-counts answer for the Vilnius days of [fromMs, toMs) (the last day holds the instant before `toMs`).
 * @param {{ usage: { rows: object[] }, doctors: { doctors: object[] } }} api makeDemoApi output
 * @param {{ fromMs: number, toMs: number, open?: boolean, nowMs: number, clinicPids?: string[] }} input
 *   clinicPids: the people a clinic pays for now (the mock's members; none in ?demo)
 */
export function demoWorkCounts(api, { fromMs, toMs, open = false, nowMs, clinicPids = [] }) {
  const endMs = open ? nowMs : toMs;
  const fromDay = dayOf(fromMs);
  const toDay = dayOf(endMs - 1);
  const today = dayOf(nowMs);
  const lastDay = toDay < today ? toDay : today;
  const inClinic = new Set(clinicPids);

  // The server's forms of every person-day (one press of „Generuoti“ with a result = one form)
  const formsOf = new Map();
  (api.usage?.rows ?? []).forEach((row) => {
    if (row.action !== 'ai_processing' || row.t >= nowMs) return;
    const day = dayOf(row.t);
    if (day < fromDay || day > lastDay) return;
    const key = `${row.pid}|${day}`;
    formsOf.set(key, (formsOf.get(key) ?? 0) + 1);
  });

  const people = [];
  const allButtons = {};
  const deleted = { days: 0, ...zero() };
  let rows = 0;
  let firstDay = null;
  const seen = (day) => {
    rows += 1;
    if (firstDay === null || day < firstDay) firstDay = day;
  };

  (api.doctors?.doctors ?? []).forEach((doctor, index) => {
    if (!doctor.exists?.auth) return;
    const clinic = inClinic.has(doctor.pid);
    const countsSince = addDays(today, -(clinic ? CLINIC_SINCE_DAYS : SERVER_SINCE_DAYS));
    const oldExtension = !clinic && index % 9 === 8;
    const sendsSince = clinic ? countsSince : addDays(today, -UPDATE_DAYS[index % UPDATE_DAYS.length]);
    const person = { pid: doctor.pid, days: 0, ...zero(), buttons: {} };
    const start = fromDay > countsSince ? fromDay : countsSince;
    for (let day = start; day <= lastDay; day = addDays(day, 1)) {
      const d = personDay({
        pid: doctor.pid,
        forms: formsOf.get(`${doctor.pid}|${day}`) ?? 0,
        express: index % 4 === 0,
        expressOnly: index === EXPRESS_ONLY_INDEX,
        sends: !oldExtension && day >= sendsSince,
        day,
      });
      if (!d) continue;
      seen(day);
      person.days += 1;
      add(person, d.values);
      Object.entries(d.buttons).forEach(([id, n]) => {
        person.buttons[id] = (person.buttons[id] ?? 0) + n;
        allButtons[id] = (allButtons[id] ?? 0) + n;
      });
    }
    if (person.days > 0) people.push(person);
  });

  // An erased account: its rows stay counted, apart from every person (its presses are in the button list)
  ERASED_DAYS.map((n) => addDays(today, -n))
    .filter((day) => day >= fromDay && day <= lastDay)
    .forEach((day) => {
      const rand = streamOf(`work-counts|deleted|${day}`);
      const forms = Math.round(between(rand, 2, 5));
      const gen = forms + Math.round(between(rand, 0, 2));
      const fill = forms;
      seen(day);
      deleted.days += 1;
      add(deleted, { forms, inserts: forms, docs: Math.round(forms * 0.8), dx: Math.round(forms * 0.5), presses: gen + fill });
      allButtons.gen = (allButtons.gen ?? 0) + gen;
      allButtons.fill = (allButtons.fill ?? 0) + fill;
    });

  people.sort((a, b) => b.presses - a.presses || b.forms - a.forms || (a.pid < b.pid ? -1 : 1));
  const totals = { people: people.length, days: people.reduce((n, p) => n + p.days, 0) + deleted.days, ...zero() };
  people.forEach((person) => add(totals, person));
  add(totals, deleted);
  const buttons = Object.entries(allButtons)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ id, lt: DEMO_BUTTONS[id]?.[0] ?? id, en: DEMO_BUTTONS[id]?.[1] ?? id, n, main: DEMO_MAIN_BUTTONS.has(id) }))
    .sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));

  return {
    range: { from: new Date(fromMs).toISOString(), to: new Date(endMs).toISOString(), open },
    fromDay,
    toDay,
    rows,
    firstDay,
    people,
    deleted: deleted.days > 0 ? deleted : null,
    totals,
    buttons,
  };
}
