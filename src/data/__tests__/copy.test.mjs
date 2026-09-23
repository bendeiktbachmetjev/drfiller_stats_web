import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LANGS, errorKindLabel, has, modelLabel, endpointLabel, plural, t, fillHint } from '../../copy/index.js';
import errorKinds from '../static/error-kinds.json' with { type: 'json' };

// §3.11 with OVERRIDES O1: English only, fixed vocabulary, ban list, prefixed keys, no Cyrillic in src/.

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));

const COMMON_PREFIXES = ['common.', 'alerts.', 'errorKind.'];
// Built from code points so this file itself stays free of Cyrillic characters.
const CYRILLIC = new RegExp(`[${String.fromCodePoint(0x400)}-${String.fromCodePoint(0x4ff)}]`);

test('every copy key is unique and carries its file prefix', () => {
  Object.entries(LANGS).forEach(([lang, table]) => {
    const owner = new Map(); // key → file; a key may sit in COPY and DEFS of the same file (label + hint)
    Object.entries(table.files).forEach(([file, module]) => {
      const keys = new Set([...Object.keys(module.COPY ?? {}), ...Object.keys(module.DEFS ?? {})]);
      keys.forEach((key) => {
        const ok = file === 'common' ? COMMON_PREFIXES.some((prefix) => key.startsWith(prefix)) : key.startsWith(`${file}.`);
        assert.ok(ok, `${lang}/${file}.js: key "${key}" has the wrong prefix`);
        assert.ok(!owner.has(key), `${lang}: "${key}" is defined in ${owner.get(key)} and ${file}`);
        owner.set(key, file);
      });
    });
  });
});

test('every DEFS entry has a non-empty short text; templates fall back to short', () => {
  Object.values(LANGS).forEach((table) => {
    Object.entries(table.DEFS).forEach(([key, entry]) => {
      const short = typeof entry === 'string' ? entry : entry?.short;
      assert.ok(typeof short === 'string' && short.trim().length > 0, `${key}.short`);
    });
  });
  assert.equal(fillHint('common.fx', {}), LANGS.en.DEFS['common.fx'].short, 'missing values → short, never "{x}"');
  assert.match(fillHint('common.fx', { fx: '0.8724', date: '22 Sep 2026' }), /\$1 = €0\.8724 on 22 Sep 2026/);
});

test('ban list (OVERRIDES O1) holds for every COPY value and DEFS.short outside the glossary', () => {
  Object.values(LANGS).forEach((table) => {
    const { banned } = table.RULES;
    const check = (key, text) => {
      if (key.startsWith('common.term.') || typeof text !== 'string') return;
      banned.forEach((re) => assert.ok(!re.test(text), `${key}: "${text}" matches ${re}`));
    };
    Object.entries(table.COPY).forEach(([key, text]) => check(key, text));
    Object.entries(table.DEFS).forEach(([key, entry]) => check(key, typeof entry === 'string' ? entry : entry?.short));
  });
});

test('the fixed vocabulary of §3.11 (English column) is declared', () => {
  assert.deepEqual(LANGS.en.RULES.vocabulary, ['Paid by doctors', 'Income', 'Costs', 'Result', 'Kept, %', 'Form', 'Visit', 'Request', 'Credit']);
  ['common.row.paid', 'common.row.income', 'common.row.cost', 'common.row.result', 'common.row.left'].forEach((key, i) =>
    assert.equal(LANGS.en.COPY[key], LANGS.en.RULES.vocabulary[i], key),
  );
});

test('no Cyrillic character anywhere in src/ (OVERRIDES O1)', () => {
  const offenders = walk(SRC)
    .filter((file) => /\.(m?js|jsx|json|css|html)$/.test(file))
    .filter((file) => CYRILLIC.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(SRC, file));
  assert.deepEqual(offenders, []);
});

test('every hint and copy key used in pages exists', () => {
  const pageFiles = walk(path.join(SRC, 'pages')).filter((file) => file.endsWith('.jsx') || file.endsWith('.js'));
  const missing = [];
  pageFiles.forEach((file) => {
    const text = readFileSync(file, 'utf8');
    const keys = [
      ...[...text.matchAll(/hintKey=["']([\w.-]+)["']/g)].map((m) => m[1]),
      ...[...text.matchAll(/\bt\(\s*["']([\w.-]+)["']/g)].map((m) => m[1]),
    ];
    keys.forEach((key) => {
      if (!has(key)) missing.push(`${path.relative(SRC, file)}: ${key}`);
    });
  });
  assert.deepEqual(missing, []);
});

test('every errorKind has a label; helpers never show raw placeholders', () => {
  Object.keys(errorKinds.ERROR_KIND_GROUP).forEach((kind) => assert.ok(has(`errorKind.${kind}`), `errorKind.${kind}`));
  assert.equal(typeof errorKindLabel('something_new'), 'string');
  assert.equal(modelLabel('gemini-3-flash-preview'), 'Gemini 3 Flash (trial version)');
  assert.equal(modelLabel('gpt-4o-mini-transcribe-2025-12-15'), 'OpenAI mini-transcribe', 'longest known prefix');
  assert.equal(modelLabel('brand-new-model'), 'brand-new-model', 'unknown → raw id');
  assert.equal(endpointLabel('direct'), 'Google API (direct)');
  assert.equal(endpointLabel('vertex', 'europe-west3'), 'Google Cloud, Frankfurt');
  assert.equal(t('common.doctor.name', {}), 'Doctor —', 'a missing value shows "—"');
  assert.equal(t('no.such.key'), 'no.such.key');
  assert.equal(plural(1, ['credit', 'credits']), 'credit');
  assert.equal(plural(5, ['credit', 'credits']), 'credits');
});
