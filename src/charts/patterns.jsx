import React from 'react';
import { t } from '../copy/index.js';
import { COLORS } from './theme.js';

// Partial bucket (the day/week/month still running, §3.12): full colour with a diagonal white hatch —
// never a faded fill — and a small "in progress" line under its axis label.
// Put <HatchDefs colors={[…]} /> inside the chart's <svg> (recharts: inside the chart) and fill the
// partial mark with hatchFill(color); give the x axis `bucketAxisProps(data)`.

const idOf = (color) => `sf-hatch-${String(color).replace(/[^a-z0-9]/gi, '')}`;

/** `url(#…)` of the hatch pattern for a colour. */
export const hatchFill = (color) => `url(#${idOf(color)})`;

/** SVG <defs> with one hatch pattern per colour. */
export function HatchDefs({ colors = [] }) {
  return (
    <defs>
      {[...new Set(colors)].map((color) => (
        <pattern key={color} id={idOf(color)} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={color} />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.55" />
        </pattern>
      ))}
    </defs>
  );
}

const TICK_TEXT = { fontSize: 12, fontWeight: 600 };
const AXIS_HEIGHT = 32;
const AXIS_HEIGHT_PARTIAL = 48;
// The partial bucket is the last one: its "in progress" line needs room past the plot's right edge.
const RIGHT_MARGIN_PARTIAL = 36;

/**
 * X-axis tick that adds "in progress" under the label of the partial bucket.
 * @param {Set<string>} partialLabels axis labels of partial buckets
 */
function makeBucketTick(partialLabels) {
  return function BucketTick({ x, y, payload, textAnchor = 'middle' }) {
    const partial = partialLabels.has(payload?.value);
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={12} textAnchor={textAnchor} fill={COLORS['ink-soft']} {...TICK_TEXT}>
          {payload?.value}
        </text>
        {partial && (
          <text dy={28} textAnchor={textAnchor} fill={COLORS['ink-mute']} {...TICK_TEXT}>
            {t('common.chart.partial')}
          </text>
        )}
      </g>
    );
  };
}

/**
 * Props for a bucket x axis: the tick (with the "in progress" line when a bucket is partial) and the
 * axis height that leaves room for it. `margin` is the chart margin to use (wider on the right while a
 * bucket is partial); it is not an XAxis prop, so spread the rest: `const { margin, ...axis } = …`.
 * @param {Array<{ label: string, isPartial?: boolean }>} data chart rows
 * @param {{ top: number, right: number, bottom: number, left: number }} baseMargin
 * @returns {{ tick: Function, height: number, margin: object }}
 */
export function bucketAxisProps(data, baseMargin) {
  const partialLabels = new Set((data || []).filter((d) => d.isPartial).map((d) => d.label));
  const partial = partialLabels.size > 0;
  return {
    tick: makeBucketTick(partialLabels),
    height: partial ? AXIS_HEIGHT_PARTIAL : AXIS_HEIGHT,
    margin: partial ? { ...baseMargin, right: Math.max(baseMargin?.right ?? 0, RIGHT_MARGIN_PARTIAL) } : baseMargin,
  };
}

export default HatchDefs;
