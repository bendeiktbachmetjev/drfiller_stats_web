import React from 'react';
import { t } from '../copy/index.js';
import AppMark from './AppMark.jsx';

// Full-screen wait state while the key gate resolves.
export function Splash() {
  return (
    <div role="status" aria-live="polite" className="min-h-screen flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-surface via-page-mid to-surface">
      <AppMark size={56} className="shadow-card rounded-[16px]" />
      <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand" />
      <span className="sr-only">{t('common.loadingApp')}</span>
    </div>
  );
}

export default Splash;
