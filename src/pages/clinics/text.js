// The Clinics page's answer line and CSV files. Words come from copy/en/clinics.js.
import { doctorLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { csvFilename } from '../../export/csv.js';
import { doctorOf } from './ClinicDoctors.jsx';

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
            price_per_credit_eur: clinic.pricePerCreditEur,
            amount_eur: row.amountEur,
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
