// Writes src/data/static/benchmark-2026-09-23.json from the full benchmark results (§5.3.10).
// Keeps only what the Prices page needs; drops every request, every error text (they contain the GCP
// project id) and the TLK code samples.
// Usage: npm run sync:benchmark -- <path to bench/results.json> [output path]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const [input, output = path.join(here, '../src/data/static/benchmark-2026-09-23.json')] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node scripts/slim-benchmark.mjs <bench/results.json> [output.json]');
  process.exit(1);
}

const pick = (source, keys) =>
  Object.fromEntries(keys.filter((key) => source && source[key] !== undefined).map((key) => [key, source[key]]));

const full = JSON.parse(readFileSync(input, 'utf8'));
const meta = full.meta ?? {};

const slim = {
  schemaVersion: full.schemaVersion,
  meta: {
    ...pick(meta, ['generatedAt', 'client', 'productionBaseline', 'requestsPerDoctorMonth', 'doctorScales']),
    requestShape: pick(meta.requestShape, ['fullPromptChars', 'dictationChars', 'historyChars', 'timeoutSec', 'productionPrimaryTimeoutSec']),
  },
  verdict: full.verdict,
  highlights: full.highlights,
  availability: (full.availability ?? []).map((row) => pick(row, ['model', 'endpoint', 'available', 'status', 'tinyRequestSec'])),
  combos: (full.combos ?? []).map((combo) => ({
    ...pick(combo, ['id', 'model', 'endpoint', 'endpointLabel', 'euDataResidency', 'thinkingConfig', 'role', 'runs', 'ok', 'latencySec', 'tokens', 'pricePerM', 'costUsd', 'vsProduction']),
    errorCount: Array.isArray(combo.errors) ? combo.errors.length : 0,
    quality: pick(combo.quality, ['validJsonRate', 'avgScore', 'note']),
  })),
};

const text = `${JSON.stringify(slim, null, 2)}\n`;
if (/projects\/[a-z0-9-]+/i.test(text)) {
  console.error('Refusing to write: the slim file still contains a project path.');
  process.exit(1);
}
writeFileSync(output, text);
console.log(`Wrote ${output} (${Math.round(text.length / 1024)} KB, ${slim.combos.length} combos)`);
