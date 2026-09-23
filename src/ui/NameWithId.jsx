import React from 'react';
import { doctorLabel, modelLabel } from '../copy/index.js';

const ID_CLASS = 'block text-xs font-medium text-ink-mute sf-wrap-any';

/**
 * A model by its friendly name, with the raw id below in small grey text when the two differ (§3.2
 * "Long names", §3.11): "Gemini 3 Flash (trial version)" / "gemini-3-flash-preview". Long ids break
 * anywhere instead of widening the page.
 *   id     model id ('gemini-3-flash-preview', 'soniox:stt-async-v5' …)
 *   inline the id sits after the name on the same line (tight tables)
 */
export function ModelName({ id, inline = false, className = '' }) {
  const name = modelLabel(id);
  const showId = Boolean(id) && name !== id;
  return (
    <span className={['min-w-0 sf-wrap-any', className].filter(Boolean).join(' ')}>
      {name}
      {showId && (inline ? <span className="ml-1.5 text-xs font-medium text-ink-mute">{id}</span> : <span className={ID_CLASS}>{id}</span>)}
    </span>
  );
}

/**
 * A doctor as shown everywhere (OVERRIDES O2, §3.7): the email when the server sent one, else "Doctor 07",
 * else "Deleted account"; the stable short code "D-K3ZQ" next to it in small grey text.
 *   doctor  a Dataset Doctor ({ email, noText, code })
 *   stacked the code goes under the name (narrow cells) instead of after it
 */
export function DoctorName({ doctor, stacked = false, className = '' }) {
  const code = doctor?.code && doctor.code !== '—' ? doctor.code : null;
  return (
    <span className={['min-w-0 sf-wrap-any', className].filter(Boolean).join(' ')}>
      {doctorLabel(doctor)}
      {code && (stacked ? <span className={ID_CLASS}>{code}</span> : <span className="ml-1.5 text-xs font-medium text-ink-mute whitespace-nowrap">{code}</span>)}
    </span>
  );
}
