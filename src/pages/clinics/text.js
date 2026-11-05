// The Clinics page's answer line and CSV files. Words come from copy/en/clinics.js.
import { doctorLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { csvFilename } from '../../export/csv.js';
import { hasWork, workTiles } from '../../data/clinics/work.js';
import { doctorOf } from './ClinicDoctors.jsx';
import { reasonOf } from './reason.js';

/** The last day of [from, effTo) for sentences ("1 Nov – 4 Nov"). */
const lastDay = (period) => {
  const d = new Date(`${period.effTo}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * @param {{ clinics: object[], clinic: object|null, report: object|null, period: object }} args
 * @returns {Array<{ text: string, tone: string }>}
 */
export function answerItemsOf({ clinics, clinic, report, period }) {
  if (!clinics.length) return [{ text: t('clinics.answer.none'), tone: 'neutral' }];
  if (!clinic) return [{ text: t('clinics.answer.pick'), tone: 'neutral' }];
  if (!clinic.active) return [{ text: t('clinics.answer.paused', { name: clinic.name }), tone: 'warn' }];
  if (!report) return [{ text: t('clinics.usage.loading'), tone: 'neutral' }];
  const values = {
    name: clinic.name,
    credits: fmt.int(report.totals.credits),
    from: fmt.date(period.from),
    to: fmt.date(lastDay(period)),
  };
  if (clinic.billing === 'prepaid') {
    return [{ text: t('clinics.answer.prepaid', { ...values, left: fmt.int(clinic.credits.available) }), tone: 'neutral' }];
  }
  if (report.totals.amountEur == null) return [{ text: t('clinics.answer.invoiceNoPrice', values), tone: 'neutral' }];
  return [{ text: t('clinics.answer.invoice', { ...values, amount: fmt.eur(report.totals.amountEur) }), tone: 'neutral' }];
}

const col = (key, type = 'num') => ({ key, header: key, type });

/**
 * The CSV files of the chosen clinic and period: one line per doctor (the invoice's annex), one per day.
 * @param {{ clinic: object|null, report: object|null, period: object, ds: object }} args
 */
export function exportTablesOf({ clinic, report, period, ds }) {
  if (!clinic || !report) return [];
  const slug = clinic.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || clinic.id;
  const file = (name) => () => csvFilename('clinics', `${slug}_${name}`, { from: period.from, to: period.effTo });
  return [
    {
      label: t('clinics.export.doctors'),
      filename: file('doctors'),
      columns: [
        col('doctor', 'text'), col('email', 'text'), col('code', 'text'), col('in_clinic_now', 'text'), col('forms', 'int'),
        col('recording_min'), col('recording_credits', 'int'), col('history_credits', 'int'), col('given_back', 'int'),
        col('days_used', 'int'), col('credits', 'int'), col('price_per_credit_eur'), col('amount_eur'),
      ],
      getRows: () =>
        report.doctors.map((row) => {
          const doctor = doctorOf(ds, row.pid);
          return {
            doctor: doctorLabel(doctor),
            email: doctor.email ?? null,
            code: doctor.code ?? null,
            in_clinic_now: row.member ? 'yes' : 'no',
            forms: row.forms,
            recording_min: Math.round(row.audioMin * 10) / 10,
            recording_credits: row.audioCredits,
            history_credits: row.anamnesisCredits,
            given_back: row.refunded,
            days_used: row.activeDays,
            credits: row.credits,
            cost_eur: Math.round(row.costEur * 10000) / 10000,
            amount_eur: Math.round(row.amountEur * 100) / 100,
          };
        }),
    },
    {
      label: t('clinics.export.days'),
      filename: file('days'),
      columns: [col('day', 'date'), col('doctors', 'int'), col('forms', 'int'), col('recording_min'), col('recording_credits', 'int'), col('history_credits', 'int'), col('given_back', 'int'), col('credits', 'int'), col('amount_eur')],
      getRows: () =>
        report.days.map((row) => ({
          day: row.day,
          doctors: row.doctors,
          forms: row.forms,
          recording_min: Math.round(row.audioMin * 10) / 10,
          recording_credits: row.audioCredits,
          history_credits: row.anamnesisCredits,
          given_back: row.refunded,
          credits: row.credits,
          amount_eur: row.amountEur,
        })),
    },
  ];
}

/** '13 h 12 min' for minutes, never below zero ('0 min'). */
const savedText = (min) => fmt.duration(Math.max(0, min) * 60000);
const slugOf = (clinic) => clinic.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || clinic.id;

/**
 * The answer line of the Work and time view: time saved, what it is worth, what the clinic paid.
 * @param {{ clinic: object|null, work: object|null, status: string, error?: Error|null, period: object }} args
 * @returns {Array<{ text: string, tone: string }>}
 */
export function workAnswerItemsOf({ clinic, work, status, error = null, period }) {
  if (!clinic) return [{ text: t('clinics.answer.pick'), tone: 'neutral' }];
  if (!work && status === 'error') {
    return [{ text: error?.status === 404 ? t('clinics.work.notOnServer') : t('clinics.work.error', { reason: reasonOf(error) }), tone: 'warn' }];
  }
  if (!work) return [{ text: t('clinics.work.loading'), tone: 'neutral' }];
  const values = { name: clinic.name, from: fmt.date(period.from), to: fmt.date(lastDay(period)) };
  if (!hasWork(work)) return [{ text: t('clinics.answer.workNone', values), tone: 'neutral' }];
  const tiles = workTiles(work);
  // Counts, but no measured person-day: no "≈ 0 saved"
  if (!tiles.measured) return [{ text: t('clinics.answer.workNoTime', values), tone: 'neutral' }];
  const filled = { ...values, saved: savedText(tiles.savedMin), value: fmt.eur(tiles.valueEur), paid: fmt.eur(tiles.paidEur) };
  if (tiles.valueEur === null) return [{ text: t('clinics.answer.workNoValue', filled), tone: 'neutral' }];
  if (tiles.paidEur === null) return [{ text: t('clinics.answer.workNoPaid', filled), tone: 'neutral' }];
  return [{ text: t('clinics.answer.work', filled), tone: 'neutral' }];
}

const round1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const round2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

/**
 * The CSV files of the Work and time view: one line per person, one per day, one per activity.
 * @param {{ clinic: object|null, work: object|null, period: object, ds: object }} args
 */
export function workExportTablesOf({ clinic, work, period, ds }) {
  if (!clinic || !work) return [];
  const file = (name) => () => csvFilename('clinics', `${slugOf(clinic)}_${name}`, { from: period.from, to: period.effTo });
  return [
    {
      label: t('clinics.export.workPeople'),
      filename: file('work_people'),
      columns: [
        col('person', 'text'), col('email', 'text'), col('code', 'text'), col('role', 'text'), col('role_guessed', 'text'), col('specialty', 'text'),
        col('shared_login', 'text'), col('stats_off', 'text'), col('in_clinic_now', 'text'), col('days', 'int'), col('forms', 'int'), col('forms_automatic', 'int'),
        col('referrals', 'int'), col('prescriptions_made', 'int'), col('prescriptions_saved', 'int'), col('services', 'int'), col('saved_min'), col('value_eur'), col('paid_eur'),
      ],
      getRows: () =>
        work.byWorker.map((row) => {
          const doctor = doctorOf(ds, row.pid);
          return {
            person: row.pid === 'deleted' ? t('clinics.work.tag.deleted') : doctorLabel(doctor),
            email: row.email ?? doctor.email ?? null,
            code: doctor.code ?? null,
            role: row.role,
            role_guessed: row.guessed ? 'yes' : 'no',
            specialty: row.spec,
            shared_login: row.ex ? 'yes' : 'no',
            stats_off: row.statsOff ? 'yes' : 'no',
            in_clinic_now: row.member ? 'yes' : 'no',
            days: row.days,
            forms: row.forms,
            forms_automatic: row.formsAuto,
            referrals: row.referrals,
            prescriptions_made: row.rxNew,
            prescriptions_saved: row.rxSaved,
            services: row.services,
            saved_min: row.statsOff ? null : round1(row.savedMin),
            value_eur: round2(row.valueEur),
            paid_eur: round2(row.paidEur),
          };
        }),
    },
    {
      label: t('clinics.export.workDays'),
      filename: file('work_days'),
      columns: [col('day', 'date'), col('saved_min'), col('spent_min'), col('by_hand_min')],
      getRows: () => work.daily.map((row) => ({ day: row.day, saved_min: round1(row.savedMin), spent_min: round1(row.spentMin), by_hand_min: round1(row.savedMin + row.spentMin) })),
    },
    {
      label: t('clinics.export.workActivities'),
      filename: file('work_activities'),
      columns: [col('activity', 'text'), col('times', 'int'), col('saved_min'), col('min_each_time')],
      getRows: () => work.byActivity.map((row) => ({ activity: row.label, times: row.count, saved_min: round1(row.savedMin), min_each_time: round2(row.perUnitMin) })),
    },
  ];
}
