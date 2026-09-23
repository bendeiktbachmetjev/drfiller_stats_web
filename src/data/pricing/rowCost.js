// Cost of one usage row at list price (D19, §5.3.7 "Money rules"). List price is the definition of
// "Costs": a computed cost is `exact`; only rows we could not price directly are `estimated`.
import { geminiCostUsd } from './gemini.js';
import { transcriptionCostUsd } from './transcription.js';
import { usdToEur } from './fx.js';

/**
 * @typedef {{ costUsd: number, costEur: number, costBasis: 'stored'|'computed'|'estimated'|'none', priceKnown: boolean }} RowCost
 */

/**
 * - anamnesis_*: the stored `costUsd` wins (`stored`); without it, priced from tokens (`computed`)
 * - form: Gemini price at the row date on the row's (or era's) endpoint/location; thinking is inside
 *   outTok; cached tokens NOT subtracted; a stored costUsd is ignored (`computed`); unknown model →
 *   the 3.5-flash price (`estimated`)
 * - dictation: Soniox or OpenAI by audio seconds; seconds estimated from file bytes → `estimated`
 * - live: client seconds × the real-time price (`computed`)
 * - meter / failure / other: 0 (`none`)
 * @param {{ kind: string, action: string, t: number, model: string|null, endpoint: string|null, location: string|null,
 *   inTok: number, outTok: number, audioSec: number|null, audioBasis: string|null, storedCostUsd?: number|null }} row
 *   a UsageRow in the making (normalize/usage.js)
 * @param {object} prices snapshot
 * @param {{ usdPerEur: number }} fx
 * @returns {RowCost}
 */
export function rowCost(row, prices, fx) {
  const done = (costUsd, costBasis, priceKnown = true) => ({
    costUsd,
    costEur: usdToEur(costUsd, fx),
    costBasis,
    priceKnown,
  });

  switch (row.kind) {
    case 'anamnesis': {
      if (Number.isFinite(row.storedCostUsd)) return done(row.storedCostUsd, 'stored');
      if (!row.model) return done(0, 'none', false);
      const { usd, known } = geminiCostUsd(prices, row.model, { inputTokens: row.inTok, outputTokens: row.outTok }, { at: row.t, platform: 'vertex', endpoint: row.location ?? 'global' });
      return done(usd, known ? 'computed' : 'estimated', known);
    }
    case 'form': {
      if (!row.model) return done(0, 'none', false);
      const { usd, known } = geminiCostUsd(
        prices,
        row.model,
        { inputTokens: row.inTok, outputTokens: row.outTok },
        { at: row.t, platform: row.endpoint ?? 'direct', endpoint: row.location ?? 'global' },
      );
      return done(usd, known ? 'computed' : 'estimated', known);
    }
    case 'dictation':
    case 'live': {
      if (!Number.isFinite(row.audioSec)) return done(0, 'none', false);
      const { usd, known } = transcriptionCostUsd(prices, row.model, row.audioSec);
      const estimated = !known || row.audioBasis === 'bytes_estimate';
      return done(usd, estimated ? 'estimated' : 'computed', known);
    }
    default:
      return done(0, 'none');
  }
}
