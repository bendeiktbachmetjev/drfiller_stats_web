import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * The answer to the page's question: 1–3 sentences right under the filter row (§3.2).
 *   items  [{ text, tone: 'neutral' | 'attention' | 'good' }] — ready text (pages translate AreaResult.answer
 *          with fmt.textOf); attention items carry a warn icon.
 */
export default function AnswerBlock({ items = [], className = '' }) {
  const list = (Array.isArray(items) ? items : []).filter((item) => item?.text).slice(0, 3);
  if (list.length === 0) return null;
  return (
    <div data-answer="" className={['mb-4 flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      {list.map((item, index) => (
        <p key={index} className="flex items-start gap-2 text-[15px] font-semibold leading-snug text-ink">
          {item.tone === 'attention' && <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warn" aria-hidden="true" />}
          <span className="min-w-0">{item.text}</span>
        </p>
      ))}
    </div>
  );
}
