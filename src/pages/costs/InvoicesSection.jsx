import React, { useMemo, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { useSettings } from '../../context/useSettings.js';
import { Card, CardHeader, DataTable, SectionTitle } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import InvoiceEditor from './InvoiceEditor.jsx';
import { invoiceLead } from './view.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
// A quiet icon button: seven outlined buttons were the loudest thing in the table.
const CHANGE = `sf-hit shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full text-ink-mute hover:text-brand hover:bg-line/20 transition-colors ${RING}`;
/** Phones show the latest months as cards; "Show all N" opens the rest. */
const PHONE_MONTHS = 3;

/** Invoices in dollars are shown in € (§2 rule 5); the dollar amount stays in the tooltip. */
const usdAsEurCell = (usdKey, eurKey) => (row) =>
  Number.isFinite(row[usdKey]) ? <span title={fmt.usd(row[usdKey])}>{fmt.eur(row[eurKey])}</span> : fmt.empty;

/** A header on two lines on a laptop (the table does not wrap headers), one line in a phone card. */
const twoLines = (key) => {
  const [first, second] = t(key).split('|');
  if (!second) return first;
  return (
    <>
      <span className="sm:block">{first}</span> <span className="sm:block">{second}</span>
    </>
  );
};

/**
 * «List price and real invoices» (§4.3): every month since March, list price next to what was paid,
 * with the inline form that saves a month's invoices (PUT → reload → rebuild). The month cell also
 * carries the note and the "Change" button, so both stay in view on a laptop and on a phone card.
 */
export default function InvoicesSection({ data, usdPerEur }) {
  const { saveMonth } = useSettings();
  const [editing, setEditing] = useState(null);
  const [savedMonth, setSavedMonth] = useState(null);
  const rows = data.tables.invoices;

  const columns = useMemo(() => {
    const monthCell = (row) => (
      <span className="block min-w-[168px]">
        <span className="flex items-center justify-between gap-3">
          <span className="whitespace-nowrap">{fmt.monthShortYear(row.month)}</span>
          <button
            type="button"
            className={CHANGE}
            aria-label={t('costs.invoices.changeAria', { month: fmt.month(row.month) })}
            aria-expanded={editing === row.month}
            onClick={() => {
              setSavedMonth(null);
              setEditing(row.month);
            }}
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
        </span>
        {row.note && (
          <span className="mt-0.5 block text-xs font-medium text-ink-mute sm:max-w-[220px] sm:truncate" title={row.note}>
            {row.note}
          </span>
        )}
      </span>
    );
    const money = (key, header, priority, eurKey) => ({
      key, header: twoLines(header), type: 'eur', priority, sortable: false, ...(eurKey ? { render: usdAsEurCell(key, eurKey) } : {}),
    });
    return [
      { key: 'month', header: t('costs.col.month'), type: 'node', priority: 1, sortable: false, render: monthCell },
      money('googleListEur', 'costs.col.googleList', 1),
      money('googleInvoiceEur', 'costs.col.googleInvoice', 2),
      money('googlePromoCreditsEur', 'costs.col.promo', 3),
      money('googlePaidEur', 'costs.col.googlePaid', 1),
      money('railwayUsd', 'costs.col.railway', 3, 'railwayEur'),
      money('sonioxListEur', 'costs.col.sonioxList', 3),
      money('sonioxInvoiceUsd', 'costs.col.sonioxInvoice', 3, 'sonioxInvoiceEur'),
      money('openaiInvoiceUsd', 'costs.col.openaiInvoice', 3, 'openaiInvoiceEur'),
      money('otherEur', 'costs.col.other', 3),
      money('totalEur', 'costs.col.monthTotal', 2),
    ];
  }, [editing]);

  const editingRow = rows.find((row) => row.month === editing) ?? null;

  const save = async (fields) => {
    await saveMonth(editing, fields);
    setSavedMonth(editing);
    setEditing(null);
  };

  return (
    <section aria-labelledby="costs-invoices">
      <SectionTitle id="costs-invoices" title={t('costs.section.invoices')} description={invoiceLead(rows)} />
      <Card>
        <CardHeader title={t('costs.invoices.title')} hintKey="costs.invoices" />
        <DataTable columns={columns} rows={rows} limit={0} phoneRows={PHONE_MONTHS} caption={t('costs.section.invoices')} />
        {savedMonth && !editingRow && (
          <p role="status" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Check className="w-4 h-4 text-brand" aria-hidden="true" />
            {t('costs.edit.saved')}
          </p>
        )}
        {editingRow && <InvoiceEditor key={editingRow.month} row={editingRow} usdPerEur={usdPerEur} onSave={save} onCancel={() => setEditing(null)} />}
      </Card>
    </section>
  );
}
