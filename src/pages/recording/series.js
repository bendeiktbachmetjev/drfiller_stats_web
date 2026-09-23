// Series of the "Minutes of recording" chart (§4.5): colour by identity (§3.12, §5.3.4) —
// conversation = rec, Soniox dictation = rec-light, OpenAI dictation = fallback. Pure: labels are copy keys.
import { COLORS } from '../../charts/theme.js';

export const MINUTES_SERIES = Object.freeze([
  Object.freeze({ key: 'live', labelKey: 'recording.series.live', color: COLORS.rec }),
  Object.freeze({ key: 'dictationSoniox', labelKey: 'recording.series.dictationSoniox', color: COLORS['rec-light'] }),
  Object.freeze({ key: 'dictationOpenai', labelKey: 'recording.series.dictationOpenai', color: COLORS.fallback }),
]);

/** Provider colours of the "Who transcribes" bar. */
export const PROVIDER_COLORS = Object.freeze({ soniox: COLORS.rec, openai: COLORS.fallback });
