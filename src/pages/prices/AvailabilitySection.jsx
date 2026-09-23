import React, { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { Card, CardHeader, DataTable, InsightRow } from '../../ui/index.js';
import useIsPhone from '../../context/useIsPhone.js';
import { modelLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { availabilityColumns } from './columns.jsx';
import { textOf } from './text.js';

const PLACES = ['direct', 'global', 'eu', 'europe-west4', 'europe-west1', 'europe-west3'];

/** Phone: one card per model with only the places where it runs. */
function PhoneCards({ rows }) {
  return (
    <ul role="list" className="flex flex-col gap-2">
      {rows.map((row) => {
        const places = PLACES.filter((place) => row.places?.[place]?.available);
        return (
          <li key={row.key} className="rounded-[16px] border border-line/60 bg-surface p-4">
            <p className="text-sm font-bold text-ink sf-wrap-any">{modelLabel(row.model)}</p>
            {places.length ? (
              <p className="mt-1.5 text-[13px] font-medium text-ink-soft">
                <span className="font-semibold text-ink">{t('prices.availability.runsIn')}: </span>
                {places.map((place) => `${t(`prices.place.${place}`)} ${fmt.sec(row.places[place].sec * 1000)}`).join(' · ')}
              </p>
            ) : (
              <p className="mt-1.5 text-[13px] font-medium text-ink-soft">{t('prices.availability.nowhere')}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Where each model runs" (§4.7 #availability): 8 models × 6 Google places from the test ("✓ 2.1 s" or "no"),
 * then the facts that follow from it (today's model has no EU place; countries without any 3.x model).
 *   rows   data.tables.availability     facts  data.tables.availabilityFacts
 */
export default function AvailabilitySection({ rows = [], facts = [] }) {
  const isPhone = useIsPhone();
  const columns = useMemo(() => availabilityColumns(PLACES), []);
  if (!rows.length) return null;
  return (
    <section id="availability" aria-labelledby="prices-availability-title" className="mt-12">
      <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
        <CardHeader title={<span id="prices-availability-title">{t('prices.availability.title')}</span>} icon={MapPin} hintKey="prices.availability" />
        {isPhone ? <PhoneCards rows={rows} /> : <DataTable columns={columns} rows={rows} limit={0} caption={t('prices.availability.title')} />}
        {facts.length > 0 && (
          <div className="mt-4 flex flex-col">
            {facts.map((fact) => (
              <InsightRow key={fact.key} tone={fact.tone} parts={[{ t: textOf(fact) }]} />
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
