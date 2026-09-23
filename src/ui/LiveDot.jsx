import React from 'react';

// Pulsing teal dot = live numbers are fresh; grey and still = the last refresh failed.
export default function LiveDot({ active = true }) {
  return (
    <span aria-hidden="true" className="relative flex h-2 w-2">
      {active && <span className="absolute inline-flex h-full w-full rounded-full bg-rec opacity-60 animate-ping motion-reduce:hidden" />}
      <span className={active ? 'relative inline-flex h-2 w-2 rounded-full bg-rec' : 'relative inline-flex h-2 w-2 rounded-full bg-data-mute'} />
    </span>
  );
}
