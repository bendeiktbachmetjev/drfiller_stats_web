import React, { useState } from 'react';
import { Card, CardHeader, DataTable } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { clinicTopups, invoiceMonths } from '../../data/clinics/money.js';
import CreditsForm, { parseEur } from './CreditsForm.jsx';
import { INPUT, PRIMARY, SECONDARY } from './ClinicForm.jsx';
import { priceText, reasonOf } from './reason.js';

const CHIP = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap';
const TONE = { paid: 'bg-brand/10 text-brand', part: 'bg-warn/15 text-warn', open: 'bg-line/40 text-ink-soft', none: 'bg-line/40 text-ink-soft' };
const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const PILL = `relative inline-flex items-center h-7 px-2.5 rounded-full border border-line bg-surface text-xs font-semibold text-brand whitespace-nowrap hover:bg-line/20 after:absolute after:-inset-1.5 ${RING}`;
const LABEL = 'mb-2 block text-xs font-bold uppercase tracking-wide text-ink-mute';

const avgText = (eur) => (eur === null ? fmt.empty : priceText(eur));

/** What one month's payment record says, for a form: the amount, or the invoice amount to start from. */
function PaymentEditor({ month, start, note: startNote, hasRecord, onSave, onRemove, onClose }) {
  const [amount, setAmount] = useState(start == null ? '' : String(start));
  const [note, setNote] = useState(startNote ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const eur = parseEur(amount);
  const run = async (fn) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
      onClose();
    } catch (err) {
      setProblem(t('clinics.money.error', { reason: reasonOf(err) }));
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 rounded-[16px] border border-line/60 bg-line/10 p-4">
      <p className="mb-3 text-sm font-bold text-ink">{t('clinics.months.editTitle', { month: fmt.month(`${month}-01`) })}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className={LABEL}>{t('clinics.months.amount')}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={INPUT} autoFocus />
        </label>
        <label className="block min-w-0">
          <span className={LABEL}>{t('clinics.money.note')}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t('clinics.months.notePlaceholder')} className={INPUT} />
        </label>
      </div>
      {amount !== '' && eur === null && <p className="mt-2 text-xs font-semibold text-bad">{t('clinics.money.badPrice')}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || eur === null} onClick={() => run(() => onSave(month, eur, note.trim()))} className={PRIMARY}>
          {t('clinics.months.save')}
        </button>
        <button type="button" disabled={busy} onClick={onClose} className={SECONDARY}>
          {t('clinics.money.cancel')}
        </button>
        {hasRecord && (
          <button type="button" disabled={busy} onClick={() => window.confirm(t('clinics.months.removeConfirm', { month: fmt.month(`${month}-01`) })) && run(() => onRemove(month))} className={`${SECONDARY} text-bad`}>
            {t('clinics.months.remove')}
          </button>
        )}
        {problem && <p role="status" className="text-sm font-semibold text-bad">{problem}</p>}
      </div>
    </div>
  );
}

/**
 * An invoiced clinic month by month (the period on screen): the credits used, the amount at its price, what it
 * paid, and "Mark paid" / "Edit". The average price of a credit = paid ÷ the credits of the paid months.
 * @param {{ clinic: object, report: object, onSave: (month: string, eur: number, note: string) => Promise<unknown>,
 *   onRemove: (month: string) => Promise<unknown> }} props
 */
export function ClinicMonths({ clinic, report, onSave, onRemove }) {
  const [editing, setEditing] = useState(null); // month
  const months = invoiceMonths(report.days, clinic);
  const record = (month) => clinic.payments.find((p) => p.month === month) ?? null;
  const columns = [
    { key: 'month', header: t('clinics.months.month'), type: 'node', priority: 1, sortValue: (row) => row.month, render: (row) => fmt.month(`${row.month}-01`) },
    { key: 'credits', header: t('clinics.col.credits'), type: 'int', priority: 1 },
    { key: 'amountEur', header: t('clinics.months.invoiced'), type: 'eur', priority: 1 },
    { key: 'paidEur', header: t('clinics.months.paid'), type: 'eur', priority: 1 },
    {
      key: 'status',
      header: t('clinics.months.status'),
      type: 'node',
      priority: 2,
      sortable: false,
      printHide: true,
      render: (row) => (
        <span className="inline-flex items-center gap-2">
          <span className={`${CHIP} ${TONE[row.status]}`}>{t(`clinics.months.state.${row.status}`)}</span>
          <button type="button" onClick={() => setEditing(row.month)} className={PILL}>
            {t(row.paidEur === null ? 'clinics.months.mark' : 'clinics.months.edit')}
          </button>
        </span>
      ),
    },
  ];
  const open = editing ? months.rows.find((row) => row.month === editing) : null;
  // What is still owed: a month not paid at all, and the rest of one paid in part
  const unpaid = months.rows.reduce((s, row) => s + Math.max(0, row.amountEur - (row.paidEur ?? 0)), 0);
  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
      <CardHeader title={t('clinics.months.title')} hintKey="clinics.months" />
      <p className="-mt-2 mb-4 text-sm font-medium text-ink-soft">
        {t('clinics.months.summary', {
          invoiced: fmt.eur(months.amountEur),
          paid: fmt.eur(months.paidEur),
          unpaid: fmt.eur(unpaid),
        })}
      </p>
      <DataTable columns={columns} rows={months.rows.map((row) => ({ ...row, key: row.month }))} limit={12} emptyText={t('common.list.empty')} caption={t('clinics.months.title')} />
      {open && (
        <PaymentEditor
          key={open.month}
          month={open.month}
          start={open.paidEur ?? open.amountEur}
          note={record(open.month)?.note}
          hasRecord={open.paidEur !== null}
          onSave={onSave}
          onRemove={onRemove}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

/**
 * A prepaid clinic's purchases: add credits with what was paid, and every top-up of the period with its price
 * per credit; the average price, what its doctors used in the period and what is left.
 * @param {{ clinic: object, report: object|null, grants: object[], period: object,
 *   onAdd: (credits: number, priceEur: number, note: string) => Promise<{ credits: { available: number } }> }} props
 */
export function ClinicTopups({ clinic, report, grants, period, onAdd }) {
  const topups = clinicTopups(grants, clinic.id, { fromMs: period.fromMs, toMs: period.effToMs });
  const columns = [
    { key: 't', header: t('clinics.topups.date'), type: 'date', priority: 1 },
    { key: 'credits', header: t('clinics.col.credits'), type: 'int', priority: 1 },
    { key: 'priceEur', header: t('clinics.topups.paid'), type: 'eur', priority: 1 },
    { key: 'perCredit', header: t('clinics.topups.perCredit'), type: 'node', priority: 2, sortValue: (row) => row.perCreditEur, render: (row) => (row.perCreditEur === null ? fmt.empty : priceText(row.perCreditEur)) },
    { key: 'note', header: t('clinics.topups.note'), type: 'text', priority: 3 },
  ];
  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
      <CardHeader title={t('clinics.topups.title')} hintKey="clinics.topups" />
      <p className="-mt-2 mb-5 text-sm font-medium text-ink-soft">
        {t('clinics.topups.summary', {
          credits: fmt.int(topups.credits),
          paid: fmt.eur(topups.paidEur),
          avg: avgText(topups.avgEur),
          used: report ? fmt.int(report.totals.credits) : fmt.empty,
          left: fmt.int(clinic.credits.available),
        })}
      </p>
      <div className="print:hidden">
        <CreditsForm
          presets={[500, 1500, 5000]}
          target={clinic.name}
          onSubmit={async (credits, priceEur, note) => {
            const data = await onAdd(credits, priceEur, note);
            return t('clinics.money.done', { n: fmt.int(credits), left: fmt.int(data.credits.available) });
          }}
        />
      </div>
      <div className="mt-6">
        <DataTable columns={columns} rows={topups.rows.map((row) => ({ ...row, key: row.id }))} limit={10} emptyText={t('clinics.topups.empty')} caption={t('clinics.topups.title')} />
      </div>
    </Card>
  );
}
