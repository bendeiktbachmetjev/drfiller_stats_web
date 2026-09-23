import React from 'react';

// Partial bucket (the day/week/month still running, §3.12): full colour with a diagonal white hatch —
// never a faded fill. Put <HatchDefs colors={[…]} /> inside the chart's <svg> (recharts: inside the chart)
// and fill the partial mark with hatchFill(color).

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

export default HatchDefs;
