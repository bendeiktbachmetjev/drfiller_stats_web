import React, { useId, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { t } from '../copy/index.js';
import AppMark from '../ui/AppMark.jsx';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

const PAGE_CLASS = 'min-h-screen flex items-center justify-center bg-gradient-to-b from-surface via-page-mid to-surface p-4 text-ink';
const CARD_CLASS = 'w-full max-w-sm bg-surface rounded-card shadow-card border border-line/60 p-6 sm:p-8';
const INPUT_CLASS = `w-full h-11 px-3.5 rounded-[12px] border border-line bg-surface text-[15px] font-medium text-ink placeholder:text-ink-mute ${RING}`;
const BUTTON_CLASS = `w-full h-11 rounded-full bg-brand text-white text-[15px] font-bold hover:bg-brand-strong transition-colors disabled:cursor-not-allowed ${RING}`;

/**
 * The sign-in form of the key gate (§5.3.9): "Access key" + "Remember on this device".
 * No window.prompt, no key in the URL. The parent decides where the key is stored.
 * @param {{ onSubmit: (key: string, remember: boolean) => void, busy?: boolean, errorKey?: string|null,
 *   initialRemember?: boolean }} props
 *   errorKey  a copy key shown under the field ('common.error.auth' after a refused key)
 */
export default function KeyForm({ onSubmit, busy = false, errorKey = null, initialRemember = false }) {
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(initialRemember);
  const inputId = useId();
  const errorId = useId();

  const submit = (event) => {
    event.preventDefault();
    const value = key.trim();
    if (!value || busy) return;
    onSubmit(value, remember);
  };

  return (
    <main className={PAGE_CLASS}>
      <form onSubmit={submit} className={CARD_CLASS} noValidate>
        <div className="flex items-center gap-3 mb-6">
          <AppMark size={40} className="rounded-[12px] shadow-card" />
          <div>
            <h1 className="text-lg font-extrabold leading-6">{t('common.key.title')}</h1>
            <p className="text-xs font-semibold text-ink-mute">{t('common.appName')}</p>
          </div>
        </div>

        <label htmlFor={inputId} className="block text-[13px] font-semibold text-ink-soft mb-1.5">
          {t('common.key.label')}
        </label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-mute pointer-events-none" aria-hidden="true" />
          <input
            id={inputId}
            type="password"
            autoComplete="current-password"
            autoFocus
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            aria-invalid={Boolean(errorKey)}
            aria-describedby={errorKey ? errorId : undefined}
            className={`${INPUT_CLASS} pl-9`}
          />
        </div>
        <p className="mt-1.5 text-xs font-medium text-ink-mute">{t('common.key.hint')}</p>
        {errorKey && (
          <p id={errorId} role="alert" className="mt-3 px-3 py-2 rounded-[12px] bg-bad-tint text-[13px] font-semibold text-bad">
            {t(errorKey)}
          </p>
        )}

        <label className="mt-4 flex items-center gap-2.5 text-[13px] font-semibold text-ink-soft cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className={`w-4 h-4 rounded accent-brand ${RING}`}
          />
          {t('common.key.remember')}
        </label>

        <button type="submit" disabled={busy || !key.trim()} className={`mt-6 ${BUTTON_CLASS} disabled:opacity-100 disabled:bg-line disabled:text-ink-soft`}>
          {busy ? t('common.key.checking') : t('common.key.submit')}
        </button>
      </form>
    </main>
  );
}
