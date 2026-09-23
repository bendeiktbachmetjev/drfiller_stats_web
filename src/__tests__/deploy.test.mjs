import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_API_URL } from '../data/constants.js';

// The production server config (public/serve.json → dist/serve.json): the browser may only talk to our API,
// and changing the API address needs this file too (code-review L1, L2, I1).
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serve = JSON.parse(readFileSync(path.join(ROOT, 'public/serve.json'), 'utf8'));
const header = (source, key) => serve.headers.find((rule) => rule.source === source)?.headers.find((h) => h.key === key)?.value;

test('CSP connect-src allows the default API and nothing wider', () => {
  const csp = header('**', 'Content-Security-Policy');
  const connect = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src'));
  assert.ok(connect.split(/\s+/).includes(new URL(DEFAULT_API_URL).origin), connect);
  assert.ok(!/\*/.test(connect), 'no wildcard');
});

test('hashed assets are cached for a year; index.html never', () => {
  assert.match(header('assets/**', 'Cache-Control'), /immutable/);
  assert.equal(header('index.html', 'Cache-Control'), 'no-cache');
});

test('/legacy leads to the old page', () => {
  assert.ok(serve.redirects.some((rule) => rule.source === 'legacy' && rule.destination === '/legacy/index.html'));
});
