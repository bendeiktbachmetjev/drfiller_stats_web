import React from 'react';

/**
 * A row of switches that scrolls sideways inside its card instead of widening the page on narrow phones
 * (320 px leaves ≈ 256 px inside a card). Promote to ui/ if other pages need it.
 */
export default function ScrollRow({ children, className = '' }) {
  return <div className={['-mx-1 px-1 max-w-full overflow-x-auto sf-nav-scroll', className].filter(Boolean).join(' ')}>{children}</div>;
}
