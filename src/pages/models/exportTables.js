// CSV files of the Models page (ExportMenu). Rows are built at click time from the metric on screen.
// Doctors appear by email or "Doctor NN" plus the stable code (OVERRIDES O2); never a raw uid.
import { csvFilename } from '../../export/csv.js';
import { doctorLabel, errorKindLabel, modelLabel, statusLabel, t } from '../../copy/index.js';
import { causeText, doctorOf, fallbackReasonText, riskText } from './columns.jsx';
import { whereLabel } from './text.js';

const doctorCells = (doctors, pid) => {
  const doctor = doctorOf(doctors, pid);
  return { doctor: doctorLabel(doctor), doctor_code: doctor.code ?? '' };
};

/**
 * @param {{ data: object|null, period: object|null }} metric useModels() result
 * @param {Map<string, object>|undefined} doctors dataset.doctors
 * @returns {Array<{ label: string, filename: () => string, columns: object[], getRows: () => object[] }>}
 */
export function modelsExportTables(metric, doctors) {
  const tables = metric?.data?.tables;
  const period = metric?.period;
  if (!tables || !period) return [];
  const file = (name) => () => csvFilename('models', name, period);
  return [
    {
      label: t('models.slow.title'),
      filename: file('slow_answers'),
      columns: [
        { key: 'at', header: 'at', type: 'datetime' },
        { key: 'doctor', header: 'doctor', type: 'text' },
        { key: 'doctor_code', header: 'doctor_code', type: 'text' },
        { key: 'model', header: 'model', type: 'text' },
        { key: 'wait_s', header: 'wait_s', type: 'num' },
        { key: 'request_tokens', header: 'request_tokens', type: 'int' },
        { key: 'answer_tokens', header: 'answer_tokens', type: 'int' },
        { key: 'tokens_per_s', header: 'tokens_per_s', type: 'num' },
        { key: 'likely_cause', header: 'likely_cause', type: 'text' },
      ],
      getRows: () =>
        tables.slow.map((row) => ({
          at: row.t, ...doctorCells(doctors, row.pid), model: row.model, wait_s: row.durMs / 1000, request_tokens: row.inTok,
          answer_tokens: row.outTok, tokens_per_s: row.tokensPerSec, likely_cause: causeText(row),
        })),
    },
    {
      label: t('models.fallbackEvents.title'),
      filename: file('backup_answers'),
      columns: [
        { key: 'at', header: 'at', type: 'datetime' },
        { key: 'doctor', header: 'doctor', type: 'text' },
        { key: 'doctor_code', header: 'doctor_code', type: 'text' },
        { key: 'wait_s', header: 'wait_s', type: 'num' },
        { key: 'reason', header: 'reason', type: 'text' },
        { key: 'request_tokens', header: 'request_tokens', type: 'int' },
        { key: 'cost_eur', header: 'cost_eur', type: 'num' },
      ],
      getRows: () =>
        tables.fallbackEvents.map((row) => ({
          at: row.t, ...doctorCells(doctors, row.pid), wait_s: row.durMs / 1000, reason: fallbackReasonText(row), request_tokens: row.inTok, cost_eur: row.costEur,
        })),
    },
    {
      label: t('models.table.title'),
      filename: file('models'),
      columns: [
        { key: 'model', header: 'model', type: 'text' },
        { key: 'model_name', header: 'model_name', type: 'text' },
        { key: 'role', header: 'role', type: 'text' },
        { key: 'where', header: 'where', type: 'text' },
        { key: 'first', header: 'first', type: 'datetime' },
        { key: 'last', header: 'last', type: 'datetime' },
        { key: 'forms', header: 'forms', type: 'int' },
        { key: 'usual_s', header: 'usual_s', type: 'num' },
        { key: 'nine_of_ten_s', header: 'nine_of_ten_s', type: 'num' },
        { key: 'over_15_s', header: 'over_15_s', type: 'int' },
        { key: 'form_price_eur', header: 'form_price_eur', type: 'num' },
        { key: 'forms_per_doctor_month_eur', header: 'forms_per_doctor_month_eur', type: 'num' },
        { key: 'status', header: 'status', type: 'text' },
        { key: 'shutdown', header: 'shutdown', type: 'date' },
      ],
      getRows: () =>
        tables.modelTable.map((row) => ({
          model: row.model, model_name: modelLabel(row.model), role: t(`models.role.${row.role}`), where: whereLabel(row.where), first: row.firstT,
          last: row.lastT, forms: row.forms, usual_s: row.p50Ms == null ? null : row.p50Ms / 1000, nine_of_ten_s: row.p90Ms == null ? null : row.p90Ms / 1000,
          over_15_s: row.over15, form_price_eur: row.costPerFormEur, forms_per_doctor_month_eur: row.formsPerDoctorMonthEur,
          status: row.status ? statusLabel(row.status) : '', shutdown: row.shutdown,
        })),
    },
    {
      label: t('models.failuresRecent.title'),
      filename: file('failures'),
      columns: [
        { key: 'at', header: 'at', type: 'datetime' },
        { key: 'doctor', header: 'doctor', type: 'text' },
        { key: 'doctor_code', header: 'doctor_code', type: 'text' },
        { key: 'activity', header: 'activity', type: 'text' },
        { key: 'what', header: 'what', type: 'text' },
        { key: 'group', header: 'group', type: 'text' },
        { key: 'http_status', header: 'http_status', type: 'int' },
        { key: 'credit_returned', header: 'credit_returned', type: 'text' },
      ],
      getRows: () =>
        tables.failuresRecent.map((row) => ({
          at: row.t, ...doctorCells(doctors, row.pid), activity: t(`models.activity.${row.activity}`), what: errorKindLabel(row.errorKind), group: row.group,
          http_status: row.httpStatus, credit_returned: row.refunded,
        })),
    },
    {
      label: t('models.risks.title'),
      filename: file('risks'),
      columns: [
        { key: 'what', header: 'what', type: 'text' },
        { key: 'status', header: 'status', type: 'text' },
        { key: 'date', header: 'date', type: 'text' },
        { key: 'days_left', header: 'days_left', type: 'int' },
        { key: 'what_will_happen', header: 'what_will_happen', type: 'text' },
        { key: 'what_to_do', header: 'what_to_do', type: 'text' },
      ],
      getRows: () =>
        tables.risks.map((row) => {
          const text = riskText(row);
          return { what: text.what, status: text.status, date: text.date, days_left: row.daysLeft, what_will_happen: text.happens, what_to_do: text.todo };
        }),
    },
  ];
}
