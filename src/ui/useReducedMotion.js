import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const mediaQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;

const subscribe = (listener) => {
  const media = mediaQuery();
  if (!media) return () => {};
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};

const getSnapshot = () => Boolean(mediaQuery()?.matches);
const getServerSnapshot = () => false;

// true while the system asks for less motion; follows the setting live.
// CSS animations are switched off in admin.css — this hook is for JS-driven motion
// (count-up numbers, recharts animations).
export default function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
