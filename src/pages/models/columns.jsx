// Table columns of the Models page (§4.6). Built at render time so the headers follow the language.
// Every column declares its phone priority (§3.2): 1 = on the card, 2–3 = behind "More details".
import React from 'react';
import { ModelName, DoctorName } from '../../ui/index.js';
import { doctorLabel, errorKindLabel, statusLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { textOf, whereLabel } from './text.js';

const when = { key: 't', header: () => t('models.col.when'), type: 'text', priority: 1, render: (row) => fmt.dateTime(row.t) };

/** "Deleted account" for rows whose pid has no doctor any more. */
export const doctorOf = (doctors, pid) => doctors?.get?.(pid) ?? { code: null, email: null, noText: null };

const doctorColumn = (doctors) => ({
  key: 'pid',
  header: () => t('models.col.doctor'),
  type: 'text',
  priority: 3,
  sortValue: (row) => doctorLabel(doctorOf(doctors, row.pid)),
  render: (row) => <DoctorName doctor={doctorOf(doctors, row.pid)} stacked />,
});

const modelColumn = (priority) => ({
  key: 'model',
  header: () => t('models.col.model'),
  type: 'text',
  priority,
  render: (row) => <ModelName id={row.model} />,
});

/** Resolves `header` functions into strings (DataTable wants text). */
const done = (columns) => columns.map((column) => ({ ...column, header: typeof column.header === 'function' ? column.header() : column.header }));

/** Likely cause of one slow form (§4.6 rules, computed in the metric). */
export function causeText(row) {
  if (row.cause === 'fallbackReason') return t('models.cause.fallbackReason', { reason: t(`models.reason.${row.reason}`) });
  if (row.cause === 'era') return t('models.cause.era', { era: t(`models.era.${row.era}`) });
  return t(`models.cause.${row.cause}`);
}

/** Why the backup model answered one form. */
export function fallbackReasonText(row) {
  if (row.reason === 'b2') return t(`models.reason.${row.kind}`);
  return t(`models.fbReason.${row.reason}`);
}

export const slowColumns = (doctors) =>
  done([
    when,
    doctorColumn(doctors),
    modelColumn(2),
    { key: 'durMs', header: () => t('models.col.waited'), type: 'sec', priority: 1 },
    { key: 'inTok', header: () => t('models.col.requestPages'), type: 'text', align: 'right', priority: 3, render: (row) => fmt.pages(row.inTok) },
    { key: 'outTok', header: () => t('models.col.answerTokens'), type: 'tokens', priority: 3 },
    { key: 'tokensPerSec', header: () => t('models.col.tokensPerSec'), type: 'int', priority: 3 },
    { key: 'cause', header: () => t('models.col.cause'), type: 'text', priority: 1, sortValue: causeText, render: causeText },
  ]);

export const fallbackColumns = (doctors) =>
  done([
    when,
    doctorColumn(doctors),
    { key: 'durMs', header: () => t('models.col.waited'), type: 'sec', priority: 1 },
    { key: 'reason', header: () => t('models.col.reason'), type: 'text', priority: 1, sortValue: fallbackReasonText, render: fallbackReasonText },
    { key: 'inTok', header: () => t('models.col.requestPages'), type: 'text', align: 'right', priority: 3, render: (row) => fmt.pages(row.inTok) },
    { key: 'costEur', header: () => t('models.col.cost'), type: 'eurUnit', priority: 2 },
  ]);

const eraNote = (row) => (row.current ? t('models.eraNote.current') : row.note ? t(`models.eraNote.${row.note}`) : fmt.empty);

export const eraColumns = () =>
  done([
    { key: 'from', header: () => t('models.col.from'), type: 'text', priority: 1, render: (row) => fmt.date(row.from) },
    { key: 'to', header: () => t('models.col.to'), type: 'text', priority: 1, render: (row) => (row.to == null ? t('models.eras.now') : fmt.date(row.to)) },
    { key: 'main', header: () => t('models.col.main'), type: 'text', priority: 1, render: (row) => <ModelName id={row.main} /> },
    { key: 'fallback', header: () => t('models.col.fallback'), type: 'text', priority: 2, render: (row) => (row.fallback ? <ModelName id={row.fallback} /> : fmt.empty) },
    { key: 'where', header: () => t('models.col.where'), type: 'text', priority: 2, render: (row) => whereLabel(row.where) },
    { key: 'note', header: () => t('models.col.note'), type: 'text', priority: 3, sortValue: eraNote, render: eraNote },
  ]);

const spanText = (row) => (fmt.dayShort(row.firstT) === fmt.dayShort(row.lastT) ? fmt.date(row.firstT) : `${fmt.dayShort(row.firstT)} – ${fmt.date(row.lastT)}`);

export const modelColumns = () =>
  done([
    { key: 'model', header: () => t('models.col.model'), type: 'text', priority: 1, render: (row) => <ModelName id={row.model} /> },
    { key: 'role', header: () => t('models.col.role'), type: 'text', priority: 2, render: (row) => t(`models.role.${row.role}`) },
    { key: 'firstT', header: () => t('models.col.span'), type: 'text', priority: 3, render: spanText },
    { key: 'forms', header: () => t('models.col.forms'), type: 'int', priority: 1 },
    { key: 'p50Ms', header: () => t('models.col.usual'), type: 'sec', priority: 1 },
    { key: 'p90Ms', header: () => t('models.col.p90'), type: 'sec', priority: 3 },
    { key: 'over15', header: () => t('models.col.over15'), type: 'int', priority: 2 },
    { key: 'costPerFormEur', header: () => t('models.col.formPrice'), type: 'eurUnit', priority: 2 },
    { key: 'formsPerDoctorMonthEur', header: () => t('models.col.perDoctor'), type: 'eur', priority: 3 },
    { key: 'status', header: () => t('models.col.status'), type: 'text', priority: 3, render: (row) => (row.status ? statusLabel(row.status) : fmt.empty) },
    { key: 'shutdown', header: () => t('models.col.shutdown'), type: 'text', priority: 3, render: (row) => (row.shutdown ? fmt.date(row.shutdown) : fmt.empty) },
  ]);

const failureWhat = (row) => (row.group === 'refusal' ? `${errorKindLabel(row.errorKind)} (${t('models.group.refusal')})` : errorKindLabel(row.errorKind));

export const failureColumns = (doctors) =>
  done([
    when,
    doctorColumn(doctors),
    { key: 'activity', header: () => t('models.col.activity'), type: 'text', priority: 2, render: (row) => t(`models.activity.${row.activity}`) },
    { key: 'errorKind', header: () => t('models.col.what'), type: 'text', priority: 1, sortValue: failureWhat, render: failureWhat },
    { key: 'httpStatus', header: () => t('models.col.code'), type: 'text', align: 'right', priority: 3, render: (row) => (row.httpStatus == null ? fmt.empty : String(row.httpStatus)) },
    { key: 'refunded', header: () => t('models.col.refunded'), type: 'text', priority: 2, render: (row) => t(row.refunded ? 'models.word.yes' : 'models.word.no') },
  ]);

// --- Risks -------------------------------------------------------------------------------------------

const riskWhat = (row) => {
  if (row.what === 'priceRise') return (row.models ?? []).map((id) => fmt.model(id)).join(' / ');
  return textOf({ key: `models.risk.what.${row.what}`, values: row.values });
};
const riskStatus = (row) => textOf({ key: `models.risk.status.${row.status}`, values: row.values });
const riskDate = (row) => {
  switch (row.dateKind) {
    case 'date':
      return fmt.date(row.date);
    case 'dates':
      return (row.dates ?? []).map((d) => fmt.date(d)).join(' / ');
    case 'notBefore':
      return t('models.risk.date.notBefore', { date: fmt.date(row.date) });
    case 'notAnnounced':
    case 'doctors':
    case 'noLive':
      return textOf({ key: `models.risk.date.${row.dateKind}`, values: row.values });
    default:
      return fmt.empty;
  }
};
const riskHappens = (row) => (row.happens ? textOf({ key: `models.risk.happens.${row.happens}`, values: row.values }) : fmt.empty);
const riskTodo = (row) => (row.todo ? textOf({ key: `models.risk.todo.${row.todo}`, values: row.values }) : fmt.empty);

/** Plain-text cells of one risk row (the table and the CSV use the same words). */
export const riskText = (row) => ({ what: riskWhat(row), status: riskStatus(row), date: riskDate(row), happens: riskHappens(row), todo: riskTodo(row) });

const RiskStatus = ({ row }) =>
  row.tone === 'attention' ? <span className="font-semibold text-warn">{riskStatus(row)}</span> : riskStatus(row);

export const riskColumns = () =>
  done([
    { key: 'what', header: () => t('models.col.risk'), type: 'text', priority: 1, sortable: false, render: riskWhat },
    { key: 'status', header: () => t('models.col.riskStatus'), type: 'text', priority: 1, sortable: false, render: (row) => <RiskStatus row={row} /> },
    { key: 'date', header: () => t('models.col.date'), type: 'text', priority: 2, sortable: false, render: riskDate },
    { key: 'daysLeft', header: () => t('models.col.daysLeft'), type: 'int', priority: 3, sortable: false },
    { key: 'happens', header: () => t('models.col.happens'), type: 'text', priority: 2, sortable: false, render: riskHappens },
    { key: 'todo', header: () => t('models.col.todo'), type: 'text', priority: 1, sortable: false, render: riskTodo },
  ]);
