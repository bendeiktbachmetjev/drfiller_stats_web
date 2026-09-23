// Column sets of the Prices tables (DataTable). Every column declares `priority` (§3.2): on phones the first
// column is the card title, priority 1 shows as "Header: value" lines, 2–3 behind "More details".
import React from 'react';
import { ExternalLink } from 'lucide-react';
import { modelLabel, statusLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import OptionName, { Tag } from './OptionName.jsx';
import { priceCell, ratePct, speedCell } from './text.js';

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const WRAP = 'block min-w-[240px] max-w-[420px] whitespace-normal text-left';

const optionColumn = () => ({
  key: 'option',
  header: t('prices.col.option'),
  type: 'node',
  render: (row) => <OptionName row={row} />,
  sortValue: (row) => modelLabel(row.model),
  priority: 1,
});

/**
 * "Options": what the owner decides on — EU servers, price and speed compared to now (priority 1), then one form,
 * forms only per doctor per month, checks passed and test failures (priority 2).
 * @param {object[]} rows the projected options on screen (for the bar scale)
 */
export function whatIfColumns(rows) {
  const maxEur = Math.max(0, ...rows.map((row) => row.eurPerForm).filter(isNum));
  return [
    optionColumn(),
    {
      key: 'eu',
      header: t('prices.col.eu'),
      type: 'text',
      render: (row) => (row.eu ? t('prices.word.yes') : t('prices.word.no')),
      sortValue: (row) => (row.eu ? 1 : 0),
      priority: 1,
    },
    { key: 'priceRatio', header: t('prices.col.ratio'), type: 'dec', render: (row) => priceCell(row.priceWord), priority: 1 },
    { key: 'speedDeltaMs', header: t('prices.col.speed'), type: 'dec', render: (row) => speedCell(row.speedWord), priority: 1 },
    { key: 'eurPerForm', header: t('prices.col.form'), type: 'bar', format: 'eurUnit', max: maxEur || 1, priority: 2 },
    { key: 'perDoctorEur', header: t('prices.col.perDoctor'), type: 'eur', priority: 2 },
    { key: 'checks', header: t('prices.col.checks'), type: 'int', render: (row) => fmt.countOf(row.checks, 14), priority: 2 },
    { key: 'failed', header: t('prices.col.failed'), type: 'int', render: (row) => fmt.countOf(row.failed, row.runs), priority: 2 },
  ];
}

/**
 * "More per option" (inside "Show the math"): the plan scales, 2027, the usual time and the test note.
 * @param {[number, number]} scales planning.doctorScales
 */
export function whatIfMoreColumns(scales) {
  return [
    optionColumn(),
    {
      key: 'scale0',
      header: t('prices.col.scale', { n: fmt.int(scales[0]) }),
      type: 'eur',
      render: (row) => fmt.eur(row.scaleEur?.[0]),
      sortValue: (row) => row.scaleEur?.[0],
      priority: 1,
    },
    {
      key: 'scale1',
      header: t('prices.col.scale', { n: fmt.int(scales[1]) }),
      type: 'eur',
      render: (row) => fmt.eur(row.scaleEur?.[1]),
      sortValue: (row) => row.scaleEur?.[1],
      priority: 1,
    },
    {
      key: 'eurPerForm2027',
      header: t('prices.col.from2027'),
      type: 'eurUnit',
      render: (row) => (Math.abs(row.eurPerForm2027 - row.eurPerForm) > 1e-12 ? fmt.eurUnit(row.eurPerForm2027) : t('prices.from2027.none')),
      priority: 2,
    },
    { key: 'expectedMs', header: t('prices.col.usual'), type: 'sec', priority: 2 },
    {
      key: 'note',
      header: t('prices.col.note'),
      type: 'node',
      sortable: false,
      render: (row) => <span className={WRAP}>{t(`prices.comboNote.${row.id}`)}</span>,
      priority: 3,
    },
  ];
}

const placeCell = (place) => (row) => {
  const cell = row.places?.[place];
  if (!cell) return <span className="text-ink-mute">{fmt.empty}</span>;
  if (!cell.available) return <span className="text-ink-mute">{t('prices.availability.no')}</span>;
  return <span className="font-semibold text-ink">{t('prices.availability.yes', { sec: fmt.sec(cell.sec * 1000) })}</span>;
};

/** "Where each model runs": one column per place (desktop; phones get cards). */
export function availabilityColumns(places) {
  return [
    { key: 'model', header: t('prices.col.model'), type: 'node', render: (row) => modelLabel(row.model), sortValue: (row) => modelLabel(row.model), priority: 1 },
    ...places.map((place) => ({
      key: place,
      header: t(`prices.place.${place}`),
      type: 'node',
      align: 'right',
      render: placeCell(place),
      sortValue: (row) => (row.places?.[place]?.available ? -(row.places[place].sec ?? 0) : -Infinity),
      priority: 1,
    })),
  ];
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url ?? '';
  }
};

// The vendor's page as an icon link (its site in the tooltip): a host name made the wide price list scroll sideways.
const sourceCell = (row) =>
  row.source ? (
    <a
      href={row.source}
      target="_blank"
      rel="noreferrer noopener"
      title={hostOf(row.source)}
      aria-label={hostOf(row.source)}
      className="inline-flex rounded-[6px] p-1 text-brand hover:text-brand-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <ExternalLink className="w-4 h-4" aria-hidden="true" />
    </a>
  ) : (
    fmt.empty
  );

const shutdownText = (row) => {
  const lines = [];
  if (row.shutdownDirect) lines.push(t('prices.shutdown.direct', { date: fmt.date(row.shutdownDirect) }));
  if (row.vertexShutdown) lines.push(t('prices.shutdown.cloud', { date: fmt.date(row.vertexShutdown) }));
  else if (row.vertexNotBefore) lines.push(t('prices.shutdown.notBefore', { date: fmt.date(row.vertexNotBefore) }));
  return lines.length ? lines.join('; ') : t('prices.shutdown.none');
};

/** "Models" price list. */
export function modelPriceColumns() {
  return [
    {
      key: 'model',
      header: t('prices.col.model'),
      type: 'node',
      render: (row) => (
        <span className="inline-flex min-w-[180px] flex-wrap items-center gap-2 whitespace-normal">
          {modelLabel(row.model)}
          {row.isMain && <Tag kind="now" />}
        </span>
      ),
      sortValue: (row) => modelLabel(row.model),
      priority: 1,
    },
    {
      key: 'formEur',
      header: t('prices.col.formOurs'),
      type: 'eurUnit',
      render: (row) => <span title={fmt.eurUsd(row.formEur, row.formUsd)}>{fmt.eurUnit(row.formEur)}</span>,
      priority: 1,
    },
    { key: 'inPerM', header: t('prices.col.inPerM'), type: 'usd', priority: 2 },
    { key: 'outPerM', header: t('prices.col.outPerM'), type: 'usd', priority: 2 },
    {
      key: 'cloudEu',
      header: t('prices.col.cloudEu'),
      type: 'text',
      render: (row) => (row.cloudEu === 'surcharge' ? t('prices.cloudEu.surcharge', { pct: fmt.pct(row.surcharge) }) : t(`prices.cloudEu.${row.cloudEu}`)),
      priority: 3,
    },
    {
      key: 'formEur2027',
      header: t('prices.col.from2027'),
      type: 'eurUnit',
      render: (row) => (isNum(row.formEur2027) ? fmt.eurUnit(row.formEur2027) : t('prices.from2027.none')),
      priority: 3,
    },
    { key: 'status', header: t('prices.col.status'), type: 'text', render: (row) => statusLabel(row.status), priority: 3 },
    { key: 'shutdown', header: t('prices.col.shutdown'), type: 'text', render: shutdownText, sortable: false, priority: 3 },
    { key: 'source', header: t('prices.col.source'), type: 'node', render: sourceCell, sortable: false, priority: 3 },
  ];
}

const serviceName = (row) => {
  const key = `prices.service.${row.id}`;
  const own = t(key);
  return own === key ? modelLabel(row.id) : own;
};

/** "Transcription" price list. */
export function transcriptionColumns() {
  return [
    {
      key: 'service',
      header: t('prices.col.service'),
      type: 'node',
      render: (row) => (
        <span className="block min-w-[150px] whitespace-normal">
          <span className="inline-flex flex-wrap items-center gap-2">
            {serviceName(row)}
            {row.tag && <Tag kind={row.tag} />}
          </span>
          {row.shutdown && <span className="block text-xs font-medium text-ink-soft">{t('prices.service.oldSwitchOff', { date: fmt.date(row.shutdown) })}</span>}
        </span>
      ),
      sortValue: serviceName,
      priority: 1,
    },
    { key: 'per10Eur', header: t('prices.col.per10'), type: 'eurUnit', priority: 1 },
    { key: 'perDoctorMonthEur', header: t('prices.col.perDoctorRec'), type: 'eur', priority: 1 },
    { key: 'perHourUsd', header: t('prices.col.perHour'), type: 'usd', priority: 2 },
    { key: 'eu', header: t('prices.col.euServers'), type: 'text', render: (row) => (row.eu ? t('prices.eu.onRequest') : fmt.empty), priority: 3 },
    { key: 'limit', header: t('prices.col.limit'), type: 'text', render: (row) => (isNum(row.limit) ? t('prices.limit.streams', { n: fmt.int(row.limit) }) : fmt.empty), priority: 3 },
    { key: 'source', header: t('prices.col.source'), type: 'node', render: sourceCell, sortable: false, priority: 3 },
  ];
}

const feeRule = (row) => {
  const rule = t('prices.fee.rule', { pct: ratePct(row.pct), fixed: fmt.eur(row.fixed) });
  if (!row.stripePart || !row.paypalPart) return rule;
  const part = (p) => t('prices.fee.rule', { pct: ratePct(p.pct), fixed: fmt.eur(p.fixed) });
  return (
    <span className="block whitespace-normal">
      {rule}
      <span className="block text-xs font-medium text-ink-soft">{t('prices.fee.parts', { stripe: part(row.stripePart), paypal: part(row.paypalPart) })}</span>
    </span>
  );
};

/** "Payments and server": the fee of each way of paying on each pack. */
export function paymentColumns(packs) {
  return [
    { key: 'method', header: t('prices.col.method'), type: 'text', render: (row) => t(`prices.method.${row.method}`), priority: 1 },
    { key: 'pct', header: t('prices.col.fee'), type: 'node', render: feeRule, sortValue: (row) => row.pct, priority: 2 },
    ...packs.map((pack) => ({
      key: pack.id,
      header: t('prices.col.pack', { n: String(pack.credits), price: fmt.eur(pack.priceEur) }),
      type: 'eur',
      priority: 1,
    })),
  ];
}
