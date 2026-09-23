// Chart constants and prop factories shared by every chart (SimuFlow, recoloured per §5.3.4).
// COLORS mirrors styles/tokens.css (tokens.test.mjs compares them). Series colour = identity, never rank.
import { fmt } from '../format/format.js';

/** Hex values of the design tokens (keep equal to styles/tokens.css). */
export const COLORS = Object.freeze({
  surface: '#FFFFFF',
  'page-mid': '#F8F8F8',
  ink: '#414141',
  'ink-soft': '#5E5E5E',
  'ink-mute': '#707070',
  line: '#DCDCDC',
  'data-mute': '#8D8D8D',
  brand: '#1F4FB8',
  'brand-strong': '#163A87',
  accent: '#2D6CDF',
  cost: '#525252',
  good: '#067647',
  bad: '#B42318',
  'bad-tint': '#FEF3F2',
  warn: '#B54708',
  'warn-tint': '#FFFAEB',
  rec: '#0B5C63',
  'rec-light': '#3A949C',
  fallback: '#DC6803',
  anamnesis: '#C11574',
  infra: '#7A5C2E',
});

/**
 * Fixed series identities (§5.3.4). Pages pick colours from here, never by rank.
 * income/forms/main model/Gemini/Google → brand; cost → cost; live → rec; Soniox dictation → recLight;
 * fallback/OpenAI → fallback; anamnesis → anamnesis; server/fixed → infra; VAT+fee/reference/other → mute;
 * result line → ink.
 */
export const SERIES = Object.freeze({
  income: COLORS.brand,
  forms: COLORS.brand,
  main: COLORS.brand,
  gemini: COLORS.brand,
  google: COLORS.brand,
  cost: COLORS.cost,
  live: COLORS.rec,
  soniox: COLORS.rec,
  dictation: COLORS['rec-light'],
  fallback: COLORS.fallback,
  openai: COLORS.fallback,
  anamnesis: COLORS.anamnesis,
  infra: COLORS.infra,
  fixed: COLORS.infra,
  vatFee: COLORS['data-mute'],
  reference: COLORS['data-mute'],
  other: COLORS['data-mute'],
  result: COLORS.ink,
});

const NICE_STEPS = [1, 2, 5, 10];

// Smallest 1/2/5×10^n that is ≥ rough; `integer` keeps count axes on whole numbers.
const niceStep = (rough, integer = true) => {
  if (!(rough > 0)) return 1;
  if (integer && rough <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const factor = NICE_STEPS.find((step) => step * magnitude >= rough - 1e-12) || 10;
  return factor * magnitude;
};

// Axis top: ≥ floor and a whole number of 1/2/5×10^n steps, at most four of them.
const niceMax = (max, floor = 4, integer = true) => {
  const top = Math.max(Number.isFinite(max) ? max : 0, floor, integer ? 1 : 0);
  if (!(top > 0)) return 1;
  const step = niceStep(top / 4, integer);
  return step * Math.ceil(top / step - 1e-9);
};

const niceTicks = (top, integer = true) => {
  const step = niceStep(top / 4, integer);
  const ticks = [];
  for (let value = 0; value <= top + step * 1e-9; value += step) ticks.push(Math.round(value * 1e9) / 1e9);
  return ticks;
};

/** Axis tick style: 12 px, weight 600, ink-soft (§5.3.4). */
const TICK = { fill: COLORS['ink-soft'], fontSize: 12, fontWeight: 600 };

export const chart = {
  single: COLORS.brand,
  singleHover: COLORS['brand-strong'],
  mute: COLORS['data-mute'],
  gridColor: COLORS.line,
  ink: COLORS.ink,
  surface: COLORS.surface,
  tick: TICK,
  margin: { top: 16, right: 8, bottom: 0, left: 0 },
  grid: { vertical: false, stroke: COLORS.line, strokeOpacity: 0.7 },
  xAxis: {
    dataKey: 'label',
    axisLine: false,
    tickLine: false,
    tickMargin: 10,
    minTickGap: 16,
    interval: 'preserveStartEnd',
    height: 32,
  },
  yAxis: { axisLine: false, tickLine: false, width: 40, tickCount: 4, allowDecimals: false },
  /** Phone y-axis width (§3.2). */
  yAxisPhoneWidth: 32,
  tooltip: {
    cursor: { fill: COLORS.line, fillOpacity: 0.3, radius: 8 },
    isAnimationActive: false,
    offset: 12,
    allowEscapeViewBox: { x: false, y: true },
    wrapperStyle: { outline: 'none', zIndex: 40, pointerEvents: 'none' },
  },
  bar: { radius: [4, 4, 0, 0], maxBarSize: 24, activeBar: { fill: COLORS['brand-strong'] } },
  label: { position: 'top', offset: 6, fill: COLORS.ink, fontSize: 12, fontWeight: 700 },
  barCategoryGap: '28%',
  container: (height = 320) => ({
    width: '100%',
    height: '100%',
    minWidth: 0,
    initialDimension: { width: 600, height },
  }),
  anim: (first, reduced, printing) => ({
    isAnimationActive: Boolean(first) && !reduced && !printing,
    animationDuration: 400,
    animationEasing: 'ease-out',
  }),
  niceMax,
  niceTicks,
  /** Explicit domain and ticks: recharts would pick steps such as 0 / 7 / 14 / 20 for a fixed domain. */
  yScale: (max, floor = 4, integer = true) => {
    const top = niceMax(max, floor, integer);
    return { domain: [0, top], ticks: niceTicks(top, integer) };
  },
  /** Like yScale for values that can go below zero (money results): one step size on both sides of 0. */
  signedScale: (min, max, floor = 1) => {
    const lo = Math.min(0, Number.isFinite(min) ? min : 0);
    const hi = Math.max(0, Number.isFinite(max) ? max : 0, lo === 0 ? floor : 0);
    const step = niceStep((hi - lo) / 4 || floor, false);
    const bottom = step * Math.floor(lo / step + 1e-9);
    const top = step * Math.ceil(hi / step - 1e-9);
    const ticks = [];
    for (let value = bottom; value <= top + step * 1e-9; value += step) ticks.push(Math.round(value * 1e9) / 1e9);
    return { domain: [bottom, top], ticks, step };
  },
};

/**
 * Y-axis tick text for a value format: counts compact ('1.2k'), money in whole euros when the tick is
 * whole ('€60', '−€15'; cents only for small steps), anything else through fmt.value.
 * @param {string|Function} format a fmt key or a function
 * @returns {(v: number) => string}
 */
export const axisFormat = (format) => {
  if (typeof format === 'function') return format;
  if (!format || format === 'int') return fmt.compact;
  if (format === 'eur' || format === 'eurSigned' || format === 'eurUnit') {
    return (v) => (Number.isInteger(v) ? fmt.eur(v).replace(/\.00$/, '') : fmt.eur(v));
  }
  // Whole seconds read better without a decimal ('15 s', not '15.0 s').
  if (format === 'sec') return (v) => fmt.sec(v).replace(/\.0(?=\D|$)/, '');
  return (v) => fmt.value(v, format);
};

/** Classes for the element that wraps a <ResponsiveContainer> (focus ring on screen, fluid svg on paper). */
export const CHART_FRAME_CLASS =
  '[&_.recharts-surface]:outline-none [&_.recharts-surface]:rounded-[8px] [&_.recharts-surface:focus-visible]:shadow-[0_0_0_2px_#2D6CDF] print:[&_.recharts-responsive-container>div]:w-full! print:[&_.recharts-responsive-container>div]:h-auto! print:[&_.recharts-wrapper]:w-full! print:[&_.recharts-wrapper]:h-auto! print:[&_.recharts-surface]:w-full! print:[&_.recharts-surface]:h-auto!';

/**
 * Axis labels and tooltip titles for series rows. Rows come from `makeSeries` (data layer, no text):
 * `{ key, granularity, isPartial, isFuture, … }`. Labels are made here so the data layer stays copy-free.
 * @param {Array<{ key: string, granularity?: string }>} rows
 * @returns {Array<{ label: string, title: string }>}
 */
export const bucketLabels = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row, index) => {
    const granularity = row.granularity ?? (/^\d{4}-\d{2}$/.test(row.key) ? 'month' : 'day');
    return {
      label: row.label ?? fmt.bucketLabel(row.key, granularity, index > 0 ? list[index - 1].key : null),
      title: row.longLabel ?? fmt.bucketTitle(row.key, granularity),
    };
  });
};

export default chart;
