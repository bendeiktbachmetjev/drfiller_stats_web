import React from 'react';

const SWATCHES = {
  rect: 'w-2.5 h-2.5 rounded-[3px] shrink-0',
  line: 'w-3 h-0.5 rounded-full shrink-0',
};

// HTML legend, placed above the plot (recharts' own <Legend> is never used).
//   items  [{ key, label, color, shape: 'rect' | 'line', value? }]
//   single renders even one item (ShareBar lists its parts here together with their values)
// One series needs no legend — the card title already names it — so fewer than two items render nothing.
// Identity comes from the swatch; the text never wears the series colour.
export default function Legend({ items, single = false, className = '' }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0 || (list.length < 2 && !single)) return null;

  return (
    <ul className={['flex flex-wrap gap-x-4 gap-y-1.5', className].filter(Boolean).join(' ')}>
      {list.map((item) => (
        <li key={item.key ?? item.label} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
          <span aria-hidden="true" className={SWATCHES[item.shape] || SWATCHES.rect} style={{ background: item.color }} />
          <span>{item.label}</span>
          {item.value != null && item.value !== '' && (
            <span className="font-bold text-ink tabular-nums">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
