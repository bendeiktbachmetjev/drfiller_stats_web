import React, { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Card, CardHeader } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { INPUT, PRIMARY, SECONDARY } from './ClinicForm.jsx';
import { reasonOf } from './reason.js';

const LABEL = 'mb-2 block text-xs font-bold uppercase tracking-wide text-ink-mute';

/** One value to send (the link or the password) with its Copy button. */
function CopyField({ label, value, mono = false }) {
  const [copied, setCopied] = useState(false);
  const field = useRef(null);
  const copy = async () => {
    let done = false;
    try {
      await navigator.clipboard.writeText(value);
      done = true;
    } catch {
      // Clipboard access refused: copy the selected field the old way (it stays selected for Cmd+C anyway)
      field.current?.select();
      try {
        done = document.execCommand('copy');
      } catch {
        done = false;
      }
    }
    if (!done) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="min-w-0">
      <span className={LABEL}>{label}</span>
      <div className="flex min-w-0 gap-2">
        <input ref={field} readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} className={`${INPUT} min-w-0 ${mono ? 'font-mono tracking-wider' : ''}`} />
        <button type="button" onClick={copy} className={`${SECONDARY} shrink-0`}>
          {copied ? <Check className="mr-1.5 w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="mr-1.5 w-3.5 h-3.5" aria-hidden="true" />}
          {t(copied ? 'clinics.share.copied' : 'clinics.share.copy')}
        </button>
      </div>
    </div>
  );
}

/**
 * The clinic's own read-only page (backend routes/clinicView.js): make a link + password to send the clinic,
 * see whether it was opened, make a new pair or stop it. The server keeps only hashes, so the pair is shown
 * once, right after it is made. Mount with key={clinic.id}: a pair on screen belongs to one clinic.
 * @param {{ clinic: object, onCreate: (id: string) => Promise<{ url: string, password: string }>, onStop: (id: string) => Promise<unknown> }} props
 */
export default function ClinicShare({ clinic, onCreate, onStop }) {
  const [fresh, setFresh] = useState(null); // { url, password } just made
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const share = clinic.share;

  const run = async (fn) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
    } catch (err) {
      setProblem(t('clinics.share.error', { reason: reasonOf(err) }));
    } finally {
      setBusy(false);
    }
  };
  const create = () => {
    if (share && !window.confirm(t('clinics.share.renewConfirm'))) return;
    run(async () => setFresh(await onCreate(clinic.id)));
  };
  const stop = () => {
    if (!window.confirm(t('clinics.share.stopConfirm', { name: clinic.name }))) return;
    run(async () => {
      await onStop(clinic.id);
      setFresh(null);
    });
  };

  let status = null;
  if (share) {
    const opened = share.opens > 0
      ? t('clinics.share.opened', { n: fmt.int(share.opens), when: fmt.dateTime(share.lastOpenedAt) })
      : t('clinics.share.notOpened');
    status = `${t('clinics.share.since', { date: fmt.dateTime(share.createdAt) })} ${opened}`;
  }

  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8 print:hidden">
      <CardHeader title={t('clinics.share.title')} hintKey="clinics.share" />
      {!share && !fresh && <p className="text-sm font-medium text-ink-soft">{t(`clinics.share.intro.${clinic.billing}`)}</p>}
      {share && <p className="text-sm font-semibold text-ink">{status}</p>}

      {fresh && (
        <div className="mt-4 rounded-[16px] border border-line/60 bg-line/10 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <CopyField label={t('clinics.share.link')} value={fresh.url} />
            <CopyField label={t('clinics.share.password')} value={fresh.password} mono />
          </div>
          <p className="mt-3 text-sm font-semibold text-warn">{t('clinics.share.once')}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={create} className={share ? SECONDARY : PRIMARY}>
          {t(share ? 'clinics.share.renew' : 'clinics.share.create')}
        </button>
        {share && (
          <button type="button" disabled={busy} onClick={stop} className={`${SECONDARY} text-bad`}>
            {t('clinics.share.stop')}
          </button>
        )}
        {problem && <p role="status" className="text-sm font-semibold text-bad">{problem}</p>}
      </div>
      {share && !fresh && <p className="mt-3 text-xs font-medium text-ink-mute">{t('clinics.share.lost')}</p>}
    </Card>
  );
}
