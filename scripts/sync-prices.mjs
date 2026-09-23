// Copies the backend price table and the errorKind groups into static snapshots (§5.3.10):
//   ../backend/services/analytics/prices.js    → src/data/static/prices-2026-09-23.json   (prices.snapshot())
//   ../backend/services/analytics/logFields.js → src/data/static/error-kinds.json         (ERROR_KIND_GROUP)
// Reads local files only; no network. Usage: npm run sync:prices [-- <backend dir>]
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(process.argv[2] ?? path.join(here, '../../backend'));
const staticDir = path.join(here, '../src/data/static');
const require = createRequire(import.meta.url);

const pricesPath = path.join(backend, 'services/analytics/prices.js');
const logFieldsPath = path.join(backend, 'services/analytics/logFields.js');

const write = (file, value) => {
  writeFileSync(path.join(staticDir, file), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`Wrote src/data/static/${file}`);
};

if (existsSync(pricesPath)) {
  const prices = require(pricesPath);
  if (typeof prices.snapshot !== 'function') {
    console.error(`${pricesPath} has no snapshot(); nothing written.`);
    process.exitCode = 1;
  } else {
    write('prices-2026-09-23.json', prices.snapshot());
  }
} else {
  console.warn(`Not found: ${pricesPath} (B1 step 1 not landed yet); the hand-made snapshot stays.`);
}

if (existsSync(logFieldsPath)) {
  const logFields = require(logFieldsPath);
  if (logFields.ERROR_KIND_GROUP) write('error-kinds.json', { ERROR_KIND_GROUP: logFields.ERROR_KIND_GROUP });
  else console.warn(`${logFieldsPath} exports no ERROR_KIND_GROUP; error-kinds.json unchanged.`);
} else {
  console.warn(`Not found: ${logFieldsPath} (B2 not landed yet); the hand-made error-kinds.json stays.`);
}
