import React from 'react';
import { Coins, Receipt, TrendingUp, Users } from 'lucide-react';
import { Card, CardHeader, InsightRow } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { itemText } from './text.js';

// One icon per slot of §4.1: units · cost driver · concentration · liability.
const ICONS = {
  'overview.fact.units': Coins,
  'overview.fact.formCostUp.size': TrendingUp,
  'overview.fact.formCostUp.era': TrendingUp,
  'overview.fact.formCostUp.longer': TrendingUp,
  'overview.fact.topDoctor': Users,
  'overview.fact.freeCredits': Receipt,
};

/**
 * "In short": at most two computed sentences, each linking to the page that explains it.
 * Renders nothing when no rule fired.
 *   facts  AreaResult.facts   ds  the dataset (doctor names)
 */
export default function ShortFacts({ facts, ds, className = '' }) {
  const list = (facts ?? []).slice(0, 2);
  if (list.length === 0) return null;
  return (
    <Card padding="lg" className={['min-w-0', className].filter(Boolean).join(' ')}>
      <CardHeader title={t('overview.short.title')} className="mb-3" />
      <div className={list.length > 1 ? 'grid gap-x-8 gap-y-1 lg:grid-cols-2' : 'max-w-3xl'}>
        {list.map((fact) => (
          <InsightRow key={fact.key} icon={ICONS[fact.key]} tone={fact.tone} to={fact.link}>
            {itemText(fact, { ds })}
          </InsightRow>
        ))}
      </div>
    </Card>
  );
}
