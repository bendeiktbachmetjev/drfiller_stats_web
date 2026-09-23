import React from 'react';
import { AlertTriangle, ExternalLink, Info } from 'lucide-react';
import { sourceMessageKey } from '../../ui/index.js';
import { plural, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

const STRIPE_PAYMENTS = 'https://dashboard.stripe.com/payments';
// Phones: the link gets its own line under the text; wider screens: at the right end.
const LINK = 'w-full pl-8 sm:w-auto sm:pl-0 sm:ml-auto shrink-0 inline-flex items-center gap-1 rounded-[6px] text-sm font-bold text-brand hover:text-brand-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

function StripeLink() {
  return (
    <a href={STRIPE_PAYMENTS} target="_blank" rel="noopener noreferrer" className={LINK}>
      {t('money.openStripe')}
      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
    </a>
  );
}

/**
 * The banners above the tiles (§4.2): "A doctor paid, but the credits did not arrive" (attention) and the
 * Stripe source banner (off / error / test mode) with a link to Stripe. PageLayout is told not to show its
 * own revenue banner, so the link can sit next to the text.
 *   data     the Money AreaResult      source  ds.sources.revenue
 */
export default function MoneyBanners({ data, source }) {
  const notCredited = data?.headline?.notCredited ?? 0;
  const sourceKey = sourceMessageKey('revenue', source?.status);
  return (
    <>
      {notCredited > 0 && (
        <div role="alert" className="mb-4 flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 rounded-[16px] bg-warn-tint">
          <AlertTriangle className="w-5 h-5 text-warn shrink-0 mt-0.5" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{t('money.notCredited', { n: fmt.int(notCredited), payments: plural(notCredited, 'common.unit.payment') })}</p>
          <StripeLink />
        </div>
      )}
      {sourceKey && (
        <div role="status" className="mb-4 flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 rounded-[16px] bg-warn-tint">
          <Info className="w-5 h-5 text-warn shrink-0 mt-0.5" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-ink-soft">{t(sourceKey)}</p>
          <StripeLink />
        </div>
      )}
    </>
  );
}
