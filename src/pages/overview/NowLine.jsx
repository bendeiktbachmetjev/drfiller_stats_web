import React from 'react';
import { InfoHint, LiveDot } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { nowText } from './text.js';

/**
 * One quiet line at the very bottom of Overview (§4.1): "Right now: 2 conversations running · last form
 * 3 min ago." From useLive() (all accounts, every 60 s); "—" before the first answer.
 *   live  the useLive() result
 */
export default function NowLine({ live }) {
  const fresh = Boolean(live?.data) && !live?.isStale && !live?.error;
  return (
    <p data-print="hide" className="mt-6 flex items-start gap-2 text-[13px] font-medium text-ink-soft">
      <span className="mt-1.5">
        <LiveDot active={fresh} />
      </span>
      <span className="min-w-0">
        {nowText(live)} <InfoHint hintKey="overview.now" label={t('common.live.lead')} className="align-middle" />
      </span>
    </p>
  );
}
