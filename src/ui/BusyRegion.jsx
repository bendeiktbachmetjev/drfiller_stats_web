import React, { useEffect, useState } from 'react';

const DIM_DELAY_MS = 150;

/**
 * Keeps the previous render on screen, dimmed, while data is refetched: no skeleton flash
 * and no layout jump. A refetch that answers within 150 ms never dims at all.
 * For page content only. Never wrap the calendar: its ancestors must not animate.
 */
export default function BusyRegion({ busy = false, className = '', children }) {
  const [delayPassed, setDelayPassed] = useState(false);

  useEffect(() => {
    if (!busy) return undefined;
    const timer = window.setTimeout(() => setDelayPassed(true), DIM_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      setDelayPassed(false);
    };
  }, [busy]);

  const dimmed = busy && delayPassed;

  return (
    <div
      aria-busy={busy}
      data-busy={dimmed ? 'true' : 'false'}
      className={[
        'transition-opacity duration-200 data-[busy=true]:opacity-50 data-[busy=true]:pointer-events-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
