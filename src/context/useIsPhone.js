import { useSyncExternalStore } from 'react';

// Phone = below the `sm` breakpoint (640 px), the width where every phone rule of §3.2 applies.
const QUERY = '(max-width: 639px)';

const media = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null);

const subscribe = (listener) => {
  const list = media();
  if (!list) return () => {};
  list.addEventListener('change', listener);
  return () => list.removeEventListener('change', listener);
};

const getSnapshot = () => Boolean(media()?.matches);
const getServerSnapshot = () => false;

/** @returns {boolean} true below 640 px; follows resizes. SSR-safe (false). */
export default function useIsPhone() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export { useIsPhone };
