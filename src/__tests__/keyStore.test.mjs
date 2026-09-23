import test from 'node:test';
import assert from 'node:assert/strict';
import { clearKey, readKey, saveKey } from '../auth/keyStore.js';
import { STORAGE } from '../data/constants.js';

const memoryStore = () => {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
};

const throwingStore = () => ({
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
});

test('keyStore: default keeps the key in this tab only', () => {
  const stores = { session: memoryStore(), local: memoryStore() };
  assert.equal(saveKey('  secret  ', {}, stores), true);
  assert.equal(stores.session.getItem(STORAGE.keySession), 'secret', 'trimmed');
  assert.equal(stores.local.getItem(STORAGE.keyRemembered), null);
  assert.deepEqual(readKey(stores), { key: 'secret', remembered: false });
});

test('keyStore: "Remember on this device" uses the key shared with the old page', () => {
  const stores = { session: memoryStore(), local: memoryStore() };
  stores.session.setItem(STORAGE.keySession, 'old');
  assert.equal(saveKey('secret', { remember: true }, stores), true);
  assert.equal(STORAGE.keyRemembered, 'drfiller_admin_secret');
  assert.equal(stores.local.getItem('drfiller_admin_secret'), 'secret');
  assert.equal(stores.session.getItem(STORAGE.keySession), null, 'only one copy');
  assert.deepEqual(readKey(stores), { key: 'secret', remembered: true });
});

test('keyStore: this tab wins over the remembered key; clearKey forgets both', () => {
  const stores = { session: memoryStore(), local: memoryStore() };
  stores.local.setItem(STORAGE.keyRemembered, 'remembered');
  stores.session.setItem(STORAGE.keySession, 'tab');
  assert.deepEqual(readKey(stores), { key: 'tab', remembered: false });
  clearKey(stores);
  assert.equal(readKey(stores), null);
  assert.equal(stores.local.data.size + stores.session.data.size, 0);
});

test('keyStore: empty keys are refused, blocked storage never throws', () => {
  const stores = { session: memoryStore(), local: memoryStore() };
  assert.equal(saveKey('   ', {}, stores), false);
  assert.equal(readKey(stores), null);

  const blocked = { session: throwingStore(), local: throwingStore() };
  assert.doesNotThrow(() => readKey(blocked));
  assert.equal(readKey(blocked), null);
  assert.equal(saveKey('secret', { remember: true }, blocked), false);
  assert.doesNotThrow(() => clearKey(blocked));

  const missing = { session: null, local: null };
  assert.equal(readKey(missing), null);
  assert.equal(saveKey('secret', {}, missing), false);
  assert.doesNotThrow(() => clearKey(missing));
  assert.doesNotThrow(() => readKey(), 'no window in Node: default stores are null');
});

test('API base: ?server= only on the dev server and only to localhost (code-review L15)', async () => {
  const { resolveApiBase } = await import('../app/apiBase.js');
  const DEFAULT = 'https://api.example.test';
  assert.equal(resolveApiBase({ dev: false, search: '?server=https://evil.example', defaultUrl: DEFAULT }), DEFAULT);
  assert.equal(resolveApiBase({ dev: false, search: '?server=http://localhost:8323', defaultUrl: DEFAULT }), DEFAULT, 'never in production');
  assert.equal(resolveApiBase({ dev: true, search: '?server=http://localhost:8323', defaultUrl: DEFAULT }), 'http://localhost:8323');
  assert.equal(resolveApiBase({ dev: true, search: '?server=https://evil.example', defaultUrl: DEFAULT }), DEFAULT);
  assert.equal(resolveApiBase({ dev: true, search: '', envUrl: '', defaultUrl: DEFAULT }), '', 'an empty VITE_API_URL = same origin');
});
