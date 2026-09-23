import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext.jsx';
import { DataTable, Disclosure } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { STATS_START } from '../../data/constants.js';
import { NOTE, SECONDARY, SettingsCard } from './parts.jsx';
import { eraNote, eraNowText, eraWhat, itemText, rateText, sourceLabel } from './text.js';

const LINE = 'text-sm font-medium text-ink-soft';
const STRONG = 'font-semibold text-ink';
const LINK = 'inline-flex items-center gap-1 rounded-[6px] text-sm font-bold text-brand hover:text-brand-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** An instant as a date, with the time only when it is not midnight ('26 Aug 2026, 19:15'). */
const whenText = (ms) => (ms == null ? t('settings.eras.still') : fmt.time(ms) === '00:00' ? fmt.date(ms) : fmt.dateTime(ms));

/** 4. "Prices and exchange rate" (§3.6, §4.9): the ECB rate, when prices were checked, where the table came from. */
export function PricesSection({ data }) {
  const h = data?.headline ?? {};
  return (
    <SettingsCard id="prices" title={t('settings.prices.title')} hintKey="settings.fx">
      <ul className="flex flex-col gap-1.5">
        <li className={LINE}>
          <span className={STRONG}>{t('settings.prices.fx', { rate: rateText(h.eurPerUsd), date: fmt.date(h.fxDate) })}</span>
        </li>
        <li className={LINE}>{t('settings.prices.checked', { date: fmt.date(h.pricesCheckedAt) })}</li>
        <li className={LINE}>{h.pricesOrigin === 'server' ? t('settings.prices.fromServer') : t('settings.prices.builtIn', { date: fmt.date(h.pricesCheckedAt) })}</li>
      </ul>
      <Link to="/prices" className={`mt-4 ${LINK}`}>
        {t('settings.prices.link')}
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    </SettingsCard>
  );
}

/** 5. "Setup history" (§4.9, §5.3.8): today's setup in one sentence; the whole table behind a button. */
export function ErasSection({ data, config }) {
  const rows = data?.tables?.eras ?? [];
  const columns = useMemo(
    () => [
      { key: 'from', header: t('settings.col.from'), type: 'node', priority: 1, sortable: false, render: (row) => <span className="whitespace-nowrap">{whenText(row.fromMs)}</span> },
      { key: 'to', header: t('settings.col.to'), type: 'node', priority: 2, sortable: false, render: (row) => <span className="whitespace-nowrap">{whenText(row.toMs)}</span> },
      { key: 'what', header: t('settings.col.what'), type: 'node', priority: 1, sortable: false, render: (row) => <span className="block min-w-[220px] text-ink">{eraWhat(row)}</span> },
      { key: 'note', header: t('settings.col.note'), type: 'node', priority: 2, sortable: false, render: (row) => eraNote(row) || fmt.empty },
    ],
    [],
  );
  return (
    <SettingsCard id="eras" title={t('settings.eras.title')} hintKey="settings.eras">
      <p className={LINE}>{eraNowText(rows, config)}</p>
      <Disclosure id="settings.eras" label={t('settings.eras.show')}>
        <DataTable columns={columns} rows={rows} maxHeight={null} caption={t('settings.eras.title')} />
      </Disclosure>
    </SettingsCard>
  );
}

const STATE_DOT = { ok: 'bg-brand', test: 'bg-warn', limited: 'bg-warn', off: 'bg-data-mute', error: 'bg-bad' };

/** 6. "Data sources" (§4.9): the state of each source, the load line; the table and data quality behind a button. */
export function SourcesSection({ data, dataset }) {
  const rows = data?.tables?.sources ?? [];
  const quality = data?.tables?.dataQuality ?? [];
  const load = data?.takeaways?.load;
  const since = dataset?.v2LoggingSince?.forms ?? dataset?.v2LoggingSince?.events ?? null;
  const columns = useMemo(
    () => [
      { key: 'key', header: t('settings.col.source'), type: 'node', priority: 1, render: (row) => sourceLabel(row.key), sortValue: (row) => sourceLabel(row.key) },
      { key: 'status', header: t('settings.col.state'), type: 'node', priority: 1, render: (row) => t(`settings.state.${row.status}`), sortValue: (row) => row.status },
      { key: 'updatedMs', header: t('settings.col.updated'), type: 'node', priority: 1, render: (row) => (row.updatedMs ? fmt.dateTime(row.updatedMs) : fmt.empty), sortValue: (row) => row.updatedMs },
      { key: 'count', header: t('settings.col.rows'), type: 'int', priority: 2 },
      { key: 'note', header: t('settings.col.note'), type: 'node', priority: 2, sortable: false, render: (row) => (row.note ? t(`settings.sourceNote.${row.note}`) : fmt.empty) },
    ],
    [],
  );
  return (
    <SettingsCard id="sources" title={t('settings.sources.title')} hintKey="settings.sources">
      <ul className="grid grid-cols-1 gap-x-6 gap-y-2 min-[420px]:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <li key={row.key} className="flex items-baseline gap-2 text-sm">
            <span aria-hidden="true" className={`w-2 h-2 shrink-0 rounded-full translate-y-[-1px] ${STATE_DOT[row.status] ?? 'bg-bad'}`} />
            <span className="min-w-0">
              <span className="font-semibold text-ink">{sourceLabel(row.key)}</span>{' '}
              <span className={row.ok ? 'font-medium text-ink-soft' : 'font-semibold text-warn'}>{t(`settings.state.${row.status}`)}</span>
            </span>
          </li>
        ))}
      </ul>
      {load && <p className={`mt-4 ${LINE}`}>{itemText(load)}</p>}
      <Disclosure id="settings.sources" label={t('settings.sources.details')}>
        <DataTable columns={columns} rows={rows} maxHeight={null} caption={t('settings.sources.title')} />
        <p className={`mt-4 ${NOTE}`}>
          {t('settings.sources.start', { date: fmt.date(STATS_START) })}{' '}
          {since ? t('settings.sources.v2Since', { date: fmt.date(since) }) : t('settings.sources.v2None')}
        </p>
        <h4 className="mt-5 text-sm font-extrabold text-ink">{t('settings.quality.title')}</h4>
        <ul className="mt-2 flex flex-col divide-y divide-line/40">
          {quality.map((row) => (
            <li key={row.key} className="flex items-start justify-between gap-4 py-2 text-sm">
              <span className="min-w-0 font-medium text-ink-soft">
                {t(`settings.quality.${row.key}`)}
                {row.detail && <span className="block text-xs text-ink-mute sf-wrap-any">{row.detail}</span>}
              </span>
              <span className="shrink-0 font-semibold text-ink tabular-nums">{fmt.int(row.n)}</span>
            </li>
          ))}
        </ul>
      </Disclosure>
    </SettingsCard>
  );
}

/** 7. "Access" (§4.9): whether the key is remembered here, and "Change key" (back to the sign-in form). */
export function AccessSection() {
  const { isDemo, keyRemembered, changeKey } = useAdmin();
  const text = isDemo ? t('settings.access.demo') : keyRemembered ? t('settings.access.remembered') : t('settings.access.session');
  return (
    <SettingsCard id="access" title={t('settings.access.title')} hintKey="settings.access">
      <p className={LINE}>{text}</p>
      <button type="button" className={`mt-4 ${SECONDARY}`} onClick={() => changeKey?.()}>
        {t('settings.access.change')}
      </button>
    </SettingsCard>
  );
}

const LINKS = [
  { key: 'stripePayments', href: 'https://dashboard.stripe.com/payments' },
  { key: 'stripeNotices', href: 'https://dashboard.stripe.com/webhooks' },
  { key: 'soniox', href: 'https://console.soniox.com' },
  { key: 'aiStudio', href: 'https://aistudio.google.com/usage' },
  { key: 'gcpBilling', href: 'https://console.cloud.google.com/billing' },
  { key: 'railway', href: 'https://railway.com/dashboard' },
];

/** 8. "Links" (§4.9): where the real bills and vendor settings live. They open in a new tab. */
export function LinksSection() {
  return (
    <SettingsCard id="links" title={t('settings.links.title')} hintKey="settings.links">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {LINKS.map((link) => (
          <li key={link.key}>
            <a href={link.href} target="_blank" rel="noreferrer noopener" className={LINK}>
              {t(`settings.link.${link.key}`)}
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
