import { useEffect, useState } from 'react';

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

// Counts from 0 up to `target` once: on the first render that has a number.
// Later changes of `target` (a new period) show at once — a number that re-counts on every
// filter click gets in the way of reading it.
//   target   number | null (null = nothing to show yet)
//   options  { duration = 600 ms, enabled = true } — pass enabled:false for reduced motion or print
// Returns { value, running }: `value` is the number to draw, `running` is true between the frames.
export default function useCountUp(target, { duration = 600, enabled = true } = {}) {
  const valid = typeof target === 'number' && Number.isFinite(target);
  const [done, setDone] = useState(false);
  const [frame, setFrame] = useState(0);

  const pending = valid && !done;
  const animates = pending && enabled && target !== 0 && duration > 0;

  useEffect(() => {
    if (!pending) return undefined;
    if (!animates) {
      setDone(true);
      return undefined;
    }

    let raf = 0;
    let startedAt = null;
    const tick = (now) => {
      if (startedAt === null) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / duration);
      if (progress >= 1) {
        setDone(true);
        return;
      }
      setFrame(target * easeOutCubic(progress));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [pending, animates, target, duration]);

  return animates ? { value: frame, running: true } : { value: valid ? target : null, running: false };
}
