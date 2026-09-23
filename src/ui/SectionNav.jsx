import React from 'react';
import { t } from '../copy/index.js';

const CHIP = 'shrink-0 inline-flex items-center h-8 px-3 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink-soft hover:bg-line/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * Anchor chips under the filter row (Money, Requests, Models, Prices). Targets need `id`s; the sticky
 * header is cleared by `scroll-margin-top` (admin.css).
 *   items  [{ id, label }]
 */
export default function SectionNav({ items = [], className = '' }) {
  if (!items.length) return null;
  return (
    <nav aria-label={t('common.onThisPage')} data-print="hide" className={['mb-6 -mx-4 px-4 flex gap-2 overflow-x-auto sf-nav-scroll', className].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <a key={item.id} href={`#${item.id}`} className={CHIP}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
