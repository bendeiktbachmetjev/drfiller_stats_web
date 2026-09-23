// Transcription list prices (Soniox file / real-time, OpenAI) from a price snapshot.
import { lookup } from './gemini.js';

const DEFAULT_UNKNOWN = 'gpt-4o-mini-transcribe';

/**
 * @param {string} model e.g. 'soniox:stt-async-v5', 'soniox-rt:stt-rt-v5', 'gpt-4o-mini-transcribe-2025-12-15'
 * @returns {'async'|'rt'|'openai'|'unknown'}
 */
export function transcriptionModelKind(model) {
  const m = String(model || '').trim().toLowerCase();
  if (m.startsWith('soniox-rt:') || m.startsWith('stt-rt')) return 'rt';
  if (m.startsWith('soniox:') || m.startsWith('stt-async')) return 'async';
  if (m.startsWith('gpt-') || m.startsWith('whisper')) return 'openai';
  return 'unknown';
}

/**
 * USD for an amount of audio.
 * @param {object} prices snapshot
 * @param {string} model
 * @param {number} audioSeconds
 * @returns {{ usd: number, known: boolean, perMinute: number }}
 */
export function transcriptionCostUsd(prices, model, audioSeconds) {
  const table = prices?.TRANSCRIPTION ?? {};
  const { entry } = lookup(table, model);
  const e = entry || table[prices?.TRANSCRIPTION_UNKNOWN ?? DEFAULT_UNKNOWN] || { perMinute: 0.003 };
  const usd = (Math.max(0, Number(audioSeconds) || 0) / 60) * e.perMinute;
  return { usd: Math.round(usd * 1e8) / 1e8, known: Boolean(entry), perMinute: e.perMinute };
}

/** USD per minute of a transcription model (plan unit costs). */
export const perMinuteUsd = (prices, model) => transcriptionCostUsd(prices, model, 60).perMinute;
