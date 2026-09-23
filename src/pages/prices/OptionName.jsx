import React from 'react';
import { modelLabel, t, thinkingLabel } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { placeLabel } from './text.js';

const TAG = {
  now: 'bg-brand text-white',
  backup: 'bg-line/40 text-ink-soft',
};

/** A small pill after a name: "now" (today's setup, brand) or "backup". */
export function Tag({ kind }) {
  return <span className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] font-bold ${TAG[kind] ?? TAG.backup}`}>{t(`prices.tag.${kind}`)}</span>;
}

/**
 * An option of the test: friendly model name with its "now" / "backup" tag, then where it runs and how much it
 * thinks in small text, and a warning line when Google switches the model off before we could settle on it.
 *   row  a projected option of computePrices (model, endpoint, thinking, isBase, isFallback, lastsLongEnough, shutdown)
 */
export default function OptionName({ row }) {
  return (
    <span className="block min-w-[200px] sm:min-w-[228px] whitespace-normal">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-ink sf-wrap-any">{modelLabel(row.model)}</span>
        {row.isBase && <Tag kind="now" />}
        {row.isFallback && <Tag kind="backup" />}
      </span>
      <span className="block mt-0.5 text-xs font-medium text-ink-soft">
        {placeLabel(row.endpoint)} · {thinkingLabel(row.thinking)}
      </span>
      {!row.lastsLongEnough && row.shutdown && (
        <span className="block mt-0.5 text-xs font-semibold text-warn">{t('prices.shutdownSoon', { date: fmt.date(row.shutdown) })}</span>
      )}
    </span>
  );
}
