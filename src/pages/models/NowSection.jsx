import React from 'react';
import { Cloud, Cpu, LifeBuoy, Mic, Server } from 'lucide-react';
import { Card, CardHeader, InfoHint, InsightRow } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { textOf } from './text.js';

const ICONS = {
  'models.now.main': Cpu,
  'models.now.fallback': LifeBuoy,
  'models.now.fallback404': LifeBuoy,
  'models.now.noFallback': LifeBuoy,
  'models.now.fallbackStable': LifeBuoy,
  'models.now.transcription': Mic,
  'models.now.transcriptionSolo': Mic,
  'models.now.server': Server,
};

/**
 * "Working now" (§4.6 #now): the current setup from /config, one sentence per line. Attention lines
 * (a trial-version main model, no backup) carry the warn icon. Without /config the page's source banner
 * says so and only the lines known from the setup history remain.
 */
export default function NowSection({ rows = [] }) {
  return (
    <section id="now" aria-labelledby="models-now-title">
      <Card padding="lg">
        <CardHeader
          title={<span id="models-now-title">{t('models.now.title')}</span>}
          icon={Cloud}
          right={<InfoHint hintKey="models.eu" label={t('models.now.title')} />}
        />
        <div className="flex flex-col">
          {rows.map((row) => (
            <InsightRow key={row.key} tone={row.tone} icon={row.tone === 'attention' ? undefined : ICONS[row.key]} parts={[{ t: textOf(row) }]} />
          ))}
        </div>
      </Card>
    </section>
  );
}
