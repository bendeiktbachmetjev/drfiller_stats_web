import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Card, CardHeader, ErrorBanner } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { saveReason } from './text.js';

export const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
export const INPUT = `h-10 w-full rounded-[12px] border bg-surface px-3 text-sm font-semibold text-ink tabular-nums ${RING}`;
export const SELECT = `h-10 max-w-full rounded-[12px] border border-line bg-surface px-3 text-sm font-semibold text-ink ${RING}`;
export const BUTTON = `inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full text-[13px] font-bold transition-colors disabled:cursor-not-allowed ${RING}`;
export const PRIMARY = `${BUTTON} bg-brand text-white hover:bg-brand-strong disabled:bg-line disabled:text-ink-soft`;
export const SECONDARY = `${BUTTON} border border-line bg-surface text-ink hover:bg-line/20 disabled:text-ink-mute`;
export const LABEL = 'text-xs font-semibold text-ink-soft';
export const NOTE = 'text-xs font-medium text-ink-soft';

/**
 * One Settings section: an anchored card with its title and (i). One column of cards (§4.9).
 *   id  anchor ('calc', 'doctors' …)   title  heading   hintKey  copy DEFS key for the subtitle and (i)
 *   hint  subtitle instead of the DEFS short text
 */
export function SettingsCard({ id, title, hint, hintKey, right, children }) {
  return (
    <section id={id} aria-label={title} className="mb-6">
      <Card padding="none" className="p-4 sm:p-6">
        <CardHeader title={title} hint={hint} hintKey={hintKey} right={right} />
        {children}
      </Card>
    </section>
  );
}

/**
 * The outcome of a save next to its control: "Saving…", "Saved. The numbers are recalculated." or the
 * error banner with the reason (the form keeps its values).
 *   status  useSettings().status   error  useSettings().error
 */
export function SaveStatus({ status, error, className = '' }) {
  if (status === 'saving') {
    return (
      <p role="status" className={`flex items-center gap-1.5 ${NOTE} ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {t('settings.saving')}
      </p>
    );
  }
  if (status === 'saved') {
    return (
      <p role="status" className={`flex items-center gap-1.5 text-xs font-semibold text-ink ${className}`}>
        <Check className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
        {t('settings.saved')}
      </p>
    );
  }
  if (status === 'error') {
    return <ErrorBanner title={t('settings.saveFailedTitle')} message={t('settings.saveFailed', { reason: saveReason(error) })} className={className} />;
  }
  return null;
}
