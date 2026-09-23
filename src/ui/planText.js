// Words for the plan (§3.8): the scenario label and the assumption chips under every ScaleProjection.
// Built here from the raw ScaleResult.scenario fields, because the data layer carries no copy.
import { PACK_SIZES } from '../data/constants.js';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';

/** Pack sizes are names ('pack 1500'), not amounts: no thousands separator. */
const packSizeOf = (pack) => (PACK_SIZES[pack] ? String(PACK_SIZES[pack]) : null);

/**
 * How the doctors of a scenario work, in words (§3.8): "15 min conversation", "1 min dictation",
 * "typing only", or "15 min conversation in 40% of visits".
 * @param {{ liveShare?: number, liveMin?: number, dictMin?: number } | null} scenario
 * @returns {string}
 */
export function scenarioLabel(scenario) {
  if (!scenario) return fmt.empty;
  const liveShare = scenario.liveShare ?? 0;
  const liveMin = scenario.liveMin ?? 0;
  const dictMin = scenario.dictMin ?? 0;
  if (liveShare >= 1) return t('common.scenario.live', { min: fmt.int(liveMin) });
  if (liveShare <= 0 && dictMin > 0) return t('common.scenario.dictation', { min: fmt.int(dictMin) });
  if (liveShare <= 0) return t('common.scenario.typed');
  return t('common.scenario.mixed', { min: fmt.int(liveMin), share: fmt.pct(liveShare) });
}

/**
 * "pack 1500" for one pack (a page-local choice, or a plan mix that is 100% one pack), else "packs as planned".
 * @param {{ pack?: string, packMix?: Record<string, number> } | null} scenario
 */
export function packLabel(scenario) {
  const pack = scenario?.pack;
  if (pack && pack !== 'plan' && packSizeOf(pack)) return t('common.plan.packSingle', { pack: packSizeOf(pack) });
  const mix = Object.entries(scenario?.packMix ?? {}).filter(([, share]) => share > 0);
  if (mix.length === 1 && packSizeOf(mix[0][0])) return t('common.plan.packSingle', { pack: packSizeOf(mix[0][0]) });
  return t('common.plan.packMix');
}

/**
 * The assumption line under a projection: "400 visits · 15 min conversation · pack 1500 · no VAT · 0% free".
 * @param {{ visitsPerDoctorMonth?: number, liveShare?: number, liveMin?: number, dictMin?: number, pack?: string,
 *   packMix?: object, vatPayer?: boolean, freeShare?: number } | null} scenario ScaleResult.scenario
 * @returns {string} '' when there is no scenario
 */
export function planChipsText(scenario) {
  if (!scenario) return '';
  return t('common.plan.chips', {
    visits: fmt.int(scenario.visitsPerDoctorMonth),
    scenario: scenarioLabel(scenario),
    packLabel: packLabel(scenario),
    vatWord: t(scenario.vatPayer ? 'common.vatWord.on' : 'common.vatWord.off'),
    free: fmt.pct(scenario.freeShare ?? 0),
  });
}
