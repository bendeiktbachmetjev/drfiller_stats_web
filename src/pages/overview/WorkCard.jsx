import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { BarList, Card, CardHeader } from '../../ui/index.js';
import { workCountsText } from '../../ui/workCountsText.js';
import { plural, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { workCountsStatus } from '../../data/normalize/workCounts.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const STAT = 'flex min-w-0 flex-col rounded-[16px] border border-line/50 bg-gradient-to-b from-surface to-line/10 p-3 sm:p-4';
/** The card lists this many buttons; the rest are in the export. */
const TOP_BUTTONS = 8;

/**
 * A button's label for the list: what it is, and the part in brackets as a quiet second line, so long labels
 * ("Dictation microphone (start or stop)") fit the list's name column.
 * @param {string} label
 * @returns {{ label: string, detail?: string }}
 */
function buttonLine(label) {
  const match = /^(.+?) \((.+)\)$/.exec(label);
  return match ? { label: match[1], detail: match[2] } : { label };
}

/**
 * "What Dr. Filler did" on Overview (GET /work-counts): the period's totals (button presses, Express forms,
 * prescriptions renewed and saved, „Užpildyti visus“ runs, services, people with counts) and the buttons pressed
 * most. The totals follow "Without my and test accounts" like the rest of the page (the page passes them in). While
 * loading the numbers show "…"; without an answer "—" and one quiet line says why; an empty period says that
 * counting outside clinics starts with the next extension version.
 *   work    the useWorkCounts() result     period  the page's period
 *   totals  scopedWorkTotals(work.counts, hidden): the numbers shown (null until the counts are here)
 */
export default function WorkCard({ work, period, totals, className = '' }) {
  const status = workCountsStatus(work, period, totals ?? undefined);
  const note = workCountsText(status, { firstDay: work?.counts?.firstDay });
  const loading = status === 'loading';
  const valueOf = (key) => {
    if (totals) return fmt.int(totals[key]);
    return loading ? '…' : fmt.empty;
  };
  const stats = [
    { key: 'presses', label: t('overview.work.presses') },
    { key: 'formsAuto', label: t('overview.work.formsAuto') },
    { key: 'rxNew', label: t('overview.work.rxNew') },
    { key: 'rxSaved', label: t('overview.work.rxSaved') },
    { key: 'fillRuns', label: t('overview.work.fillRuns') },
    { key: 'services', label: t('overview.work.services') },
    { key: 'people', label: t('overview.work.people') },
  ];
  const top = (totals?.buttons ?? []).slice(0, TOP_BUTTONS).map((button) => ({ key: button.id, ...buttonLine(button.label), value: button.n }));

  let lead = null;
  if (totals?.people > 0) {
    const values = { people: fmt.int(totals.people), peopleWord: plural(totals.people, 'overview.work.unit.person'), presses: fmt.int(totals.presses) };
    lead = totals.presses > 0 ? t('overview.work.lead', values) : t('overview.work.leadNoPresses', values);
  }

  const toDoctors = (
    <Link to="/doctors" className={`inline-flex items-center gap-1 rounded-[6px] text-sm font-semibold text-brand hover:underline print:hidden ${RING}`}>
      {t('overview.work.toDoctors')}
      <ArrowRight className="w-4 h-4" aria-hidden="true" />
    </Link>
  );

  return (
    <Card padding="lg" className={['min-w-0', className].filter(Boolean).join(' ')}>
      <CardHeader title={t('overview.work.title')} hintKey="overview.work" right={toDoctors} className="mb-4" />
      {lead && <p className="mb-4 text-sm font-semibold text-ink">{lead}</p>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7" aria-busy={loading || undefined}>
        {stats.map((stat, index) => (
          // Seven boxes: on two columns the last one takes the whole row
          <div key={stat.key} className={index === stats.length - 1 ? `${STAT} col-span-2 sm:col-span-1` : STAT}>
            <dt className="text-xs font-semibold text-ink-soft">{stat.label}</dt>
            <dd className={`mt-auto pt-1 text-2xl font-extrabold tracking-[-0.02em] tabular-nums ${totals ? 'text-ink' : 'text-ink-mute'}`}>{valueOf(stat.key)}</dd>
          </div>
        ))}
      </dl>
      {totals && status !== 'none' && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-bold text-ink-soft">{t('overview.work.top')}</p>
          {top.length > 0 ? (
            <BarList items={top} format="int" maxRows={TOP_BUTTONS} unit={t('overview.work.presses.unit')} />
          ) : (
            <p className="text-sm font-medium text-ink-mute">{t('overview.work.topNone')}</p>
          )}
        </div>
      )}
      {note && (
        <p role="status" className="mt-4 text-[13px] font-medium text-ink-soft">
          {note}
        </p>
      )}
    </Card>
  );
}
