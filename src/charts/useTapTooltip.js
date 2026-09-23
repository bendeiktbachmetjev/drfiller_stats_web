import { useEffect, useRef, useState } from 'react';
import { useCoarsePointer } from '../context/useIsPhone.js';

/**
 * Chart tooltips on touch screens (§3.2): a tap on a bucket opens its tooltip, a second tap on the same
 * bucket or a tap outside the chart closes it. With a mouse nothing changes (hover).
 *
 *   const tap = useTapTooltip();
 *   <div ref={tap.frameRef}>…<BarChart {...tap.chartProps}>…<Tooltip {...tap.tooltipProps} />
 *
 * @returns {{ frameRef: import('react').RefObject<HTMLElement>, chartProps: object, tooltipProps: object }}
 */
export default function useTapTooltip() {
  const coarse = useCoarsePointer();
  const frameRef = useRef(null);
  const lastIndex = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!coarse || !open) return undefined;
    const close = () => setOpen(false);
    const onPointerDown = (event) => {
      if (!frameRef.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', close, true);
    };
  }, [coarse, open]);

  if (!coarse) return { frameRef, chartProps: {}, tooltipProps: {} };

  const onClick = (state) => {
    const index = state?.activeTooltipIndex ?? state?.activeIndex ?? null;
    if (open && index === lastIndex.current) {
      setOpen(false);
      return;
    }
    lastIndex.current = index;
    setOpen(true);
  };

  return { frameRef, chartProps: { onClick }, tooltipProps: { trigger: 'click', active: open ? undefined : false } };
}
