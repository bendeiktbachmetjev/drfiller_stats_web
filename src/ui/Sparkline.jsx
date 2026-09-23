import React from 'react';
import { COLORS } from '../charts/theme.js';

const VIEW_WIDTH = 100;

const TONES = {
  default: { line: COLORS['data-mute'], lineWidth: 1.5, accent: COLORS.brand, dot: 6, ring: COLORS.surface, flat: COLORS.line, fill: 'rgba(31,79,184,0.06)' },
  onAccent: { line: '#FFFFFF', lineWidth: 2, accent: '#FFFFFF', dot: 8, ring: null, flat: 'rgba(255,255,255,0.4)', fill: 'rgba(255,255,255,0.15)' },
};

const toPath = (points) => points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

// A near-zero-length stroke with round caps draws a dot; a truly zero-length one is skipped by some engines.
const dotPath = ([x, y]) => `M${(x - 0.01).toFixed(2)} ${y.toFixed(2)} L${x.toFixed(2)} ${y.toFixed(2)}`;

// Trend line for a stat tile: the past in grey, the latest step and the end dot in brand blue.
//   data   number[] (≤ 12 buckets; non-numbers such as future buckets are skipped)
//   height px
//   tone   'default' | 'onAccent' (white, for the hero tile)
//   area   fills the space under the line
// The viewBox is stretched to the box, so strokes use non-scaling-stroke and the end dot is a
// round-capped stroke instead of a circle: both keep their pixel size at any width.
export default function Sparkline({ data, height = 36, tone = 'default', area = false, className = '' }) {
  const colors = TONES[tone] || TONES.default;
  const values = (Array.isArray(data) ? data : []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const classes = ['block w-full overflow-visible print:hidden', className].filter(Boolean).join(' ');
  const svgProps = {
    viewBox: `0 0 ${VIEW_WIDTH} ${height}`,
    preserveAspectRatio: 'none',
    width: '100%',
    height,
    className: classes,
    'aria-hidden': true,
    focusable: 'false',
  };

  if (values.length < 2 || max === min) {
    const y = height - 1;
    return (
      <svg {...svgProps}>
        <line x1="0" y1={y} x2={VIEW_WIDTH} y2={y} stroke={colors.flat} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  // Room for the dot and its ring above and below the line.
  const pad = colors.dot / 2 + 2;
  const usable = Math.max(1, height - pad * 2);
  const points = values.map((v, index) => [
    (index / (values.length - 1)) * VIEW_WIDTH,
    pad + (1 - (v - min) / (max - min)) * usable,
  ]);
  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2];

  return (
    <svg {...svgProps}>
      {area && <path d={`${toPath(points)} L${VIEW_WIDTH} ${height} L0 ${height} Z`} fill={colors.fill} stroke="none" />}
      <path
        d={toPath(points)}
        fill="none"
        stroke={colors.line}
        strokeWidth={colors.lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={toPath([beforeLast, last])}
        fill="none"
        stroke={colors.accent}
        strokeWidth={colors.lineWidth}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {colors.ring && (
        <path
          d={dotPath(last)}
          stroke={colors.ring}
          strokeWidth={colors.dot + 4}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={dotPath(last)}
        stroke={colors.accent}
        strokeWidth={colors.dot}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
