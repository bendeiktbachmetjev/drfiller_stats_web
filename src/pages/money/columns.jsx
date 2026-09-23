// DataTable columns of the Money page. Every column declares its phone priority (§3.2): 1 = on the card,
// 2–3 = behind "More details".
import React from 'react';
import { DoctorName, SignedMoney } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { creditedLabel, creditsText, doctorOf, doctorText, methodLabel, packName } from './text.js';

/** Table twin of the money chart: bucket · income · forms · recording · medical history · server · result. */
export const moneyChartColumns = (showIncome) =>
  [
    { key: 'bucket', header: t('money.col.bucket'), type: 'text', priority: 1, sortValue: (row) => row.key },
    showIncome && { key: 'income', header: t('common.row.income'), type: 'eur', priority: 1 },
    { key: 'costForm', header: t('money.part.form'), type: 'eur', priority: 2 },
    { key: 'costRecording', header: t('money.part.recording'), type: 'eur', priority: 2 },
    { key: 'costAnamnesis', header: t('money.part.anamnesis'), type: 'eur', priority: 3 },
    { key: 'costFixed', header: t('money.part.fixed'), type: 'eur', priority: 3 },
    { key: 'cost', header: t('common.row.cost'), type: 'eur', priority: 1 },
    showIncome && { key: 'result', header: t('common.row.result'), type: 'eurSigned', priority: 1, render: (row) => <SignedMoney value={row.result} /> },
  ].filter(Boolean);

const CREDITED_TONE = { no: 'font-semibold text-bad', pending: 'text-ink-soft', unknown: 'text-ink-mute' };

/** "Purchases" (§4.2 A): Date · Pack · Income · Credits arrived on the phone card; the rest behind "More details". */
export const paymentColumns = ({ ds, vatPayer }) =>
  [
    {
      key: 't',
      header: t('money.col.date'),
      type: 'node',
      priority: 1,
      sortValue: (row) => row.t,
      render: (row) => (row.total ? t('money.payments.total') : fmt.date(row.t)),
    },
    {
      key: 'pid',
      header: t('money.col.doctor'),
      type: 'node',
      priority: 2,
      sortValue: (row) => doctorText(ds, row.pid),
      render: (row) => (row.pid ? <DoctorName doctor={doctorOf(ds, row.pid)} stacked /> : fmt.empty),
    },
    { key: 'packId', header: t('money.col.pack'), type: 'node', priority: 1, sortValue: (row) => row.credits, render: (row) => packName(row.packId) },
    { key: 'grossEur', header: t('money.col.paid'), type: 'eur', priority: 2 },
    { key: 'discountEur', header: t('money.col.discount'), type: 'eur', priority: 3 },
    { key: 'feeEur', header: t('money.col.fee'), type: 'eur', priority: 3 },
    vatPayer && { key: 'vatEur', header: t('money.col.vat'), type: 'eur', priority: 3 },
    { key: 'netEur', header: t('money.col.income'), type: 'eur', priority: 1 },
    { key: 'method', header: t('money.col.method'), type: 'node', priority: 3, sortValue: (row) => methodLabel(row.method), render: (row) => methodLabel(row.method) },
    { key: 'refundEur', header: t('money.col.refund'), type: 'eur', priority: 2 },
    {
      key: 'credited',
      header: t('money.col.credited'),
      type: 'node',
      priority: 1,
      sortValue: (row) => row.credited,
      render: (row) => <span className={CREDITED_TONE[row.credited] ?? ''}>{creditedLabel(row.credited)}</span>,
    },
  ].filter(Boolean);

/** "Packs" (§4.2 A, inside "Show the math"). */
export const packColumns = ({ vatPayer }) =>
  [
    { key: 'key', header: t('money.col.pack'), type: 'node', priority: 1, sortValue: (row) => row.credits, render: (row) => packName(row.key) },
    { key: 'credits', header: t('money.col.credits'), type: 'int', priority: 2 },
    { key: 'priceEur', header: t('money.col.price'), type: 'eur', priority: 1 },
    { key: 'feeEur', header: t('money.col.feeCard'), type: 'eur', priority: 3 },
    vatPayer && { key: 'vatEur', header: t('money.col.vat'), type: 'eur', priority: 3 },
    { key: 'netEur', header: t('money.col.netPack'), type: 'eur', priority: 2 },
    { key: 'perCreditEur', header: t('money.col.perCredit'), type: 'eurUnit', priority: 1 },
    { key: 'bought', header: t('money.col.bought'), type: 'int', priority: 2 },
    { key: 'boughtEur', header: t('money.col.boughtEur'), type: 'eur', priority: 2 },
  ].filter(Boolean);

/** "3.8¢ (52%)"; "—" when unknown. */
export const keptText = (leftEur, share) =>
  Number.isFinite(leftEur) ? (Number.isFinite(share) ? t('money.kept', { left: fmt.eurUnit(leftEur), pct: fmt.pct(share) }) : fmt.eurUnit(leftEur)) : fmt.empty;

const keptCell = (row) => <span className="whitespace-nowrap">{keptText(row.leftEur, row.shareLeft)}</span>;

/** Table twin of the anatomy (4 rows): credit price, VAT, fee, costs, kept. */
export const anatomyColumns = [
  { key: 'key', header: t('money.col.visit'), type: 'node', priority: 1, sortable: false, render: (row) => t(`money.anatomy.${row.key}`) },
  { key: 'priceEur', header: t('money.col.creditPrice'), type: 'eurUnit', priority: 2, sortable: false },
  { key: 'vatEur', header: t('money.col.vat'), type: 'eurUnit', priority: 3, sortable: false },
  { key: 'feeEur', header: t('money.col.fee'), type: 'eurUnit', priority: 3, sortable: false },
  { key: 'costEur', header: t('money.col.cost'), type: 'eurUnit', priority: 1, sortable: false },
  { key: 'leftEur', header: t('money.col.kept'), type: 'eurUnit', priority: 1, sortable: false, render: keptCell },
];

/** Cents with at most one decimal and no unit: 0.075 → '7.5', 0.05 → '5'. */
const centsNumber = (eur) => {
  const cents = Math.round(eur * 1000) / 10;
  return Number.isInteger(cents) ? fmt.int(cents) : fmt.dec(cents);
};

/** "2.5 credits ≈ 7.5–12.5¢": credits × the gross price of a credit, cheapest to dearest pack (in cents below €1). */
const doctorPaysText = (row) => {
  if (!row.doctorPaysEur) return fmt.empty;
  const { min, max } = row.doctorPaysEur;
  const range = max < 1 ? `${centsNumber(min)}–${centsNumber(max)}${t('common.unit.cent')}` : `${fmt.eur(min)}–${fmt.eur(max)}`;
  return <span className="whitespace-nowrap">{t('money.doctorPays', { credits: creditsText(row.credits), range })}</span>;
};

/** "A whole visit" (§4.2 C): Visit · Costs · Kept on the phone card. The given order is kept. */
export const visitColumns = [
  { key: 'key', header: t('money.col.visit'), type: 'node', priority: 1, sortable: false, render: (row) => t(`money.visit.${row.key}`) },
  { key: 'doctorPaysEur', header: t('money.col.doctorPays'), type: 'node', priority: 2, sortable: false, render: doctorPaysText },
  { key: 'costEur', header: t('money.col.cost'), type: 'eurUnit', priority: 1, sortable: false },
  { key: 'netEur', header: t('money.col.income'), type: 'eurUnit', priority: 2, sortable: false },
  { key: 'leftEur', header: t('money.col.kept'), type: 'node', align: 'right', priority: 1, sortable: false, render: keptCell },
];

const COUNT_STEPS = new Set(['visits', 'creditsSpent']);

/** How a step value is written: counts, % or money (cents in the one-visit column). */
const stepText = (key, column, value) => {
  if (key === 'marginPct') return fmt.pct(value);
  if (COUNT_STEPS.has(key)) return column === 'visit' ? fmt.value(value, Number.isInteger(value) ? 'int' : 'dec') : fmt.int(value);
  if (column === 'visit') return fmt.eurUnit(value);
  return key === 'resultEur' ? <SignedMoney value={value} /> : fmt.eur(value);
};

/** "Show the math step by step" (13 rows × the plan columns; "Now" also unconverted). */
export const stepColumns = ({ scales, showNow }) =>
  [
    { key: 'key', header: t('money.col.step'), type: 'node', priority: 1, sortable: false, render: (row) => t(`money.step.${row.key}`) },
    showNow && { key: 'now', header: t('common.col.now'), type: 'node', priority: 1, sortable: false, render: (row) => stepText(row.key, 'now', row.now) },
    showNow && { key: 'nowTotal', header: t('money.col.nowTotal'), type: 'node', priority: 3, sortable: false, render: (row) => stepText(row.key, 'nowTotal', row.nowTotal) },
    { key: 'visit', header: t('common.col.visit'), type: 'node', priority: 2, sortable: false, render: (row) => stepText(row.key, 'visit', row.visit) },
    { key: 'doctor', header: t('common.col.doctor'), type: 'node', priority: 2, sortable: false, render: (row) => stepText(row.key, 'doctor', row.doctor) },
    { key: 's0', header: t('common.col.scale', { n: fmt.int(scales[0]) }), type: 'node', priority: 1, sortable: false, render: (row) => stepText(row.key, 's0', row.s0) },
    { key: 's1', header: t('common.col.scale', { n: fmt.int(scales[1]) }), type: 'node', priority: 1, sortable: false, render: (row) => stepText(row.key, 's1', row.s1) },
  ]
    .filter(Boolean)
    .map((column) => (column.key === 'key' ? column : { ...column, align: 'right' }));

/** Every one-change variant of the plan: Assumption · Result per month · Difference (bar left/right of 0). */
export const sensitivityColumns = (maxAbs) => [
  { key: 'key', header: t('money.col.assumption'), type: 'node', priority: 1, sortable: false, render: (row) => t(`money.sensitivity.change.${row.key}`) },
  { key: 'resultEur', header: t('money.col.resultMonth'), type: 'eurSigned', priority: 1, render: (row) => <SignedMoney value={row.resultEur} /> },
  { key: 'diffEur', header: t('money.col.diff'), type: 'signedBar', format: 'eurSigned', max: maxAbs, priority: 1, sortValue: (row) => Math.abs(row.diffEur) },
];
