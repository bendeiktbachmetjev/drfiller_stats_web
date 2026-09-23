import { useSyncExternalStore } from 'react';

// Phone = below the `sm` breakpoint (640 px), the width where every phone rule of §3.2 applies.
const PHONE_QUERY = '(max-width: 639px)';
// Touch screens: no hover, so tooltips open on a tap (§3.2).
const COARSE_QUERY = '(pointer: coarse)';

const media = (query) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null);

const subscribeTo = (query) => (listener) => {
  const list = media(query);
  if (!list) return () => {};
  list.addEventListener('change', listener);
  return () => list.removeEventListener('change', listener);
};

const subscribePhone = subscribeTo(PHONE_QUERY);
const subscribeCoarse = subscribeTo(COARSE_QUERY);
const getServerSnapshot = () => false;

/** @returns {boolean} true below 640 px; follows resizes. SSR-safe (false). */
export default function useIsPhone() {
  return useSyncExternalStore(subscribePhone, () => Boolean(media(PHONE_QUERY)?.matches), getServerSnapshot);
}

/** @returns {boolean} true on a touch screen (`pointer: coarse`). SSR-safe (false). */
export function useCoarsePointer() {
  return useSyncExternalStore(subscribeCoarse, () => Boolean(media(COARSE_QUERY)?.matches), getServerSnapshot);
}

export { useIsPhone };
