import React from 'react';

/** The Dr.Filler mark (the favicon): a blue rounded square with a white "D". Decorative. */
export default function AppMark({ size = 36, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={['shrink-0', className].filter(Boolean).join(' ')}>
      <rect width="32" height="32" rx="8" fill="var(--color-brand)" />
      <path d="M9 22V10h5.2c4 0 6.8 2.3 6.8 6s-2.8 6-6.8 6H9Zm3-2.6h2.1c2.3 0 3.8-1.3 3.8-3.4s-1.5-3.4-3.8-3.4H12v6.8Z" fill="#fff" />
      <circle cx="23.5" cy="21" r="1.8" fill="#fff" />
    </svg>
  );
}
