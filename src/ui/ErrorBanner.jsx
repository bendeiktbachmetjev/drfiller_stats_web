import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';

const RETRY_CLASS =
  'ml-auto shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border border-line bg-surface text-ink-soft hover:bg-line/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * Two uses. Nothing could be loaded: `message` (or `error`, a DataError whose message is
 * already written for people) plus `onRetry`. A background refresh failed but older data is
 * still on screen: pass `staleAt` (ms of the last good load) and the banner says so instead.
 * An API that is switched off cannot be fixed by retrying, so that case gets no button.
 */
const MESSAGE_KEYS = {
  NETWORK: 'common.error.network',
  TIMEOUT: 'common.error.timeout',
  AUTH: 'common.error.auth',
  API_OFF: 'common.error.apiOff',
  SCHEMA: 'common.error.schema',
  CONFLICT: 'common.error.conflict',
};

/** The owner-facing sentence for a DataError (copy keys, never the developer message). */
export const errorText = (error) => t(MESSAGE_KEYS[error?.code] ?? 'common.error.server');

export default function ErrorBanner({ title, message, error, onRetry, staleAt, className = '' }) {
  const heading = staleAt ? t('common.stale', { time: fmt.time(staleAt) }) : title ?? t('common.error.title');
  const body = message ?? (error && !staleAt ? errorText(error) : null);
  const canRetry = typeof onRetry === 'function' && error?.code !== 'API_OFF';

  return (
    <div
      role="alert"
      className={['flex items-start gap-3 p-4 rounded-[16px] bg-bad-tint border border-bad/20', className]
        .filter(Boolean)
        .join(' ')}
    >
      <AlertTriangle className="w-5 h-5 text-bad shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-bad">{heading}</p>
        {body && <p className="text-sm font-medium text-ink-soft">{body}</p>}
      </div>
      {canRetry && (
        <button type="button" onClick={() => onRetry()} className={RETRY_CLASS}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}
