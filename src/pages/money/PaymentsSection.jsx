import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, ChartCard, DataTable, Disclosure, KpiTile, SectionTitle } from '../../ui/index.js';
import MoneyColumns from '../../charts/MoneyColumns.jsx';
import { SERIES, bucketLabels } from '../../charts/theme.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { moneyChartColumns, packColumns, paymentColumns } from './columns.jsx';
import { badgeOf, eurCents, textOf } from './text.js';

const GRID = 'grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-4';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const PART_LABELS = () => ({ form: t('money.part.form'), recording: t('money.part.recording'), anamnesis: t('money.part.anamnesis'), fixed: t('money.part.fixed') });

/** A money delta (§4.2 A): % change, or the plain € difference while the earlier amount is under €10. */
export const moneyDelta = (metric, pick) => metric.delta(pick, 'money');

function PaymentTiles({ metric, firstLoad }) {
  const data = metric.data;
  const h = data?.headline ?? {};
  const b = data?.basis ?? {};
  const incomeOk = h.incomeStatus === 'ok';
  const inferred = !incomeOk && isNum(h.inferredEur) && h.inferredPurchases > 0;
  const common = { compareLabel: metric.compareLabel, firstLoad };

  const grossTile = inferred ? (
    <KpiTile
      label={t('money.tile.gross')}
      valueText={`≤ ${eurCents(h.inferredEur)}`}
      sub={t('money.tile.gross.inferred', { n: fmt.int(h.inferredPurchases) })}
      badge={b.inferredEur}
      hintKey="money.grossInferred"
      {...common}
    />
  ) : (
    <KpiTile
      label={t('money.tile.gross')}
      value={h.gross}
      format="eur"
      delta={moneyDelta(metric, (d) => d.headline.gross)}
      sub={incomeOk ? (h.payments === 1 ? t('money.tile.gross.subOne') : t('money.tile.gross.sub', { n: fmt.int(h.payments) })) : null}
      badge={badgeOf(h.gross, b.gross)}
      hintKey="money.gross"
      {...common}
    />
  );

  const vatOn = isNum(h.vatEur) && h.vatEur > 0;
  const netSub = incomeOk
    ? vatOn
      ? t('money.tile.net.subVat', { feeVat: fmt.eur(h.feeEur + h.vatEur) })
      : t('money.tile.net.sub', { fee: fmt.eur(h.feeEur) })
    : null;

  return (
    <div className={GRID}>
      {grossTile}
      <KpiTile label={t('money.tile.net')} value={h.net} format="eur" delta={moneyDelta(metric, (d) => d.headline.net)} sub={netSub} badge={badgeOf(h.net, b.net)} hintKey="money.net" {...common} />
      <KpiTile
        label={t('money.tile.result')}
        value={h.result}
        format="eurSigned"
        delta={metric.delta((d) => d.headline.result, 'eur')}
        sub={t('money.tile.result.sub', { cost: fmt.eur(h.cost) })}
        badge={badgeOf(h.result, b.result)}
        hintKey="money.result"
        {...common}
      />
      <KpiTile
        label={t('money.tile.margin')}
        value={h.margin}
        format="pct"
        delta={metric.delta((d) => d.headline.margin, 'pp')}
        sub={incomeOk && !isNum(h.margin) ? t('money.tile.margin.noIncome') : null}
        badge={badgeOf(h.margin, b.margin)}
        hintKey="money.margin"
        // The three money tiles above span the phone row; a half-width fourth would stand alone.
        wide
        {...common}
      />
    </div>
  );
}

function MoneyChart({ data, phrase }) {
  const replaced = data.takeaways?.moneyChart;
  const showIncome = data.headline.incomeStatus === 'ok';
  const rows = useMemo(
    () =>
      (data.moneySeries ?? []).map((row) => ({
        ...row,
        parts: { form: row.costForm, recording: row.costRecording, anamnesis: row.costAnamnesis, fixed: row.costFixed },
      })),
    [data.moneySeries],
  );
  const tableRows = useMemo(() => {
    const labels = bucketLabels(rows);
    return rows.map((row, index) => ({ ...row, bucket: labels[index].title })).filter((row) => !row.isFuture);
  }, [rows]);

  if (replaced) {
    return (
      <Card padding="none" className="mt-3 md:mt-6 p-4 sm:p-6 lg:p-8">
        <CardHeader title={t('money.moneyChart.title')} hintKey="money.moneyChart" />
        <div className="flex min-h-[120px] sm:min-h-[200px] flex-col items-center justify-center gap-3 px-2 text-center">
          <p className="max-w-xl text-sm font-medium text-ink-soft">{textOf(replaced, { period: phrase })}</p>
          <Link to="/costs" className="rounded-[6px] text-sm font-bold text-brand hover:text-brand-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {t('money.moneyChart.toCosts')}
          </Link>
        </div>
      </Card>
    );
  }

  const series = [
    { key: 'income', label: t('common.row.income'), color: SERIES.income },
    { key: 'cost', label: t('common.row.cost'), color: SERIES.cost },
    { key: 'result', label: t('common.row.result'), color: SERIES.result, shape: 'line' },
  ];
  return (
    <ChartCard
      className="mt-3 md:mt-6"
      title={t('money.moneyChart.title')}
      hintKey="money.moneyChart"
      rows={rows}
      series={series}
      height={320}
      table={{ columns: moneyChartColumns(showIncome), rows: tableRows }}
    >
      <MoneyColumns rows={rows} showIncome={showIncome} partLabels={PART_LABELS()} />
    </ChartCard>
  );
}

function PurchasesCard({ data, ds, vatPayer }) {
  const h = data.headline;
  const incomeOk = h.incomeStatus === 'ok';
  const rows = data.tables.payments ?? [];
  // Discount and refund columns only when some row has one (they are €0 in almost every purchase).
  const hideZero = useMemo(() => ['discountEur', 'refundEur'].filter((key) => rows.every((row) => !(Math.abs(row[key] ?? 0) > 0))), [rows]);
  const columns = useMemo(() => paymentColumns({ ds, vatPayer }).filter((column) => !hideZero.includes(column.key)), [ds, vatPayer, hideZero]);
  const footerRow = useMemo(() => {
    if (rows.length < 2) return null;
    const total = { key: 'total', t: 'total', total: true };
    ['grossEur', 'discountEur', 'feeEur', 'vatEur', 'netEur', 'refundEur'].forEach((key) => {
      total[key] = rows.reduce((acc, row) => acc + (row[key] ?? 0), 0);
    });
    return total;
  }, [rows]);

  let emptyText = t('money.payments.empty');
  if (h.incomeStatus === 'test') emptyText = t('money.payments.test');
  else if (!incomeOk) {
    emptyText = h.inferredPurchases > 0
      ? t('money.payments.off', { n: fmt.int(h.inferredPurchases), sum: eurCents(h.inferredEur) })
      : t('money.payments.offNone');
  } else if (data.answer?.[0]?.key === 'money.answer.noPaymentsLast') {
    emptyText = t('money.payments.emptyLast', { date: fmt.value(data.answer[0].values.date[1], 'date') });
  }

  return (
    <Card padding="none" className="mt-3 md:mt-6 p-4 sm:p-6 lg:p-8">
      <CardHeader title={t('money.payments.title')} hintKey="money.payments" />
      <DataTable
        columns={columns}
        rows={rows}
        defaultSort={{ key: 't', dir: 'desc' }}
        footerRow={footerRow}
        emptyText={emptyText}
        caption={t('money.payments.title')}
      />
      {incomeOk && h.otherStripeFeesEur > 0 && (
        <p className="mt-3 text-xs font-medium text-ink-soft">{t('money.otherStripeFees', { x: fmt.eur(h.otherStripeFeesEur) })}</p>
      )}
      <Disclosure id="money.packs" label={t('money.packs.toggle')}>
        <CardHeader title={t('money.packs.title')} hintKey="money.packs" className="mb-3" />
        <DataTable columns={packColumns({ vatPayer })} rows={data.tables.packs ?? []} caption={t('money.packs.title')} limit={0} />
      </Disclosure>
    </Card>
  );
}

/**
 * Section A "Payments" (§4.2 A): four tiles, the income and cost chart (or the sentence that replaces it),
 * every purchase of the period, and the packs behind "Show the packs".
 */
export default function PaymentsSection({ metric, ds, phrase }) {
  const data = metric.data;
  const vatPayer = Boolean(metric.scope?.vatPayer);
  return (
    <section aria-label={t('money.a.title')}>
      <SectionTitle id="payments" title={t('money.a.title')} description={textOf(data?.takeaways?.payments, { period: phrase })} />
      <PaymentTiles metric={metric} firstLoad={!data} />
      {data && <MoneyChart data={data} phrase={phrase} />}
      {data && <PurchasesCard data={data} ds={ds} vatPayer={vatPayer} />}
    </section>
  );
}
