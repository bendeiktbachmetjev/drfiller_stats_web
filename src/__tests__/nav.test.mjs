import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SECTION, LEGACY_PATH, PILL_SECTIONS, SECTIONS, isSectionId, sectionById, sectionFromPath } from '../app/nav.js';
import { COMPUTE } from '../data/metrics/index.js';
import { LANGS } from '../copy/index.js';
import { PAGE_FILES } from '../pages/index.js';

const srcPath = (relative) => fileURLToPath(new URL(`../${relative}`, import.meta.url));

test('nav: 9 sections in the order of §3.1, English labels (OVERRIDES O1)', () => {
  assert.deepEqual(
    SECTIONS.map((s) => s.id),
    ['overview', 'money', 'costs', 'requests', 'recording', 'models', 'prices', 'doctors', 'settings'],
  );
  assert.deepEqual(
    SECTIONS.map((s) => s.label),
    ['Overview', 'Money', 'Costs', 'Requests', 'Recording', 'Models', 'Prices', 'Doctors', 'Settings'],
  );
  assert.equal(DEFAULT_SECTION, 'overview');
  assert.equal(new Set(SECTIONS.map((s) => s.path)).size, 9, 'paths are unique');
  SECTIONS.forEach((s) => assert.equal(s.path, `/${s.id}`));
  assert.equal(PILL_SECTIONS.length, 8, 'Settings is the gear, not a pill');
  assert.deepEqual(SECTIONS.filter((s) => s.service).map((s) => s.id), ['models', 'prices']);
  assert.deepEqual(SECTIONS.filter((s) => !s.usesPeriod).map((s) => s.id), ['prices', 'settings']);
  assert.equal(LEGACY_PATH, '/legacy/index.html');
});

test('nav: paths resolve to sections, anything else to null', () => {
  assert.equal(sectionFromPath('/money'), 'money');
  assert.equal(sectionFromPath('/Money/'), 'money');
  assert.equal(sectionFromPath('/'), null);
  assert.equal(sectionFromPath('/money/extra'), null);
  assert.equal(sectionFromPath('/nope'), null);
  assert.equal(sectionFromPath(null), null);
  assert.equal(isSectionId('prices'), true);
  assert.equal(isSectionId('calendar'), false);
  assert.equal(sectionById('doctors').label, 'Doctors');
});

test('every section has its page, metric, copy file and a title + question', () => {
  const copy = LANGS.en;
  SECTIONS.forEach(({ id }) => {
    assert.ok(PAGE_FILES[id], `page registered for ${id}`);
    assert.ok(existsSync(srcPath(`pages/${PAGE_FILES[id]}`)), `pages/${PAGE_FILES[id]} exists`);
    assert.equal(typeof COMPUTE[id], 'function', `metric registered for ${id}`);
    assert.ok(existsSync(srcPath(`data/metrics/${id}.js`)), `data/metrics/${id}.js exists`);
    assert.ok(copy.files[id], `copy/en/${id}.js registered`);
    assert.equal(typeof copy.COPY[`${id}.title`], 'string', `${id}.title`);
    assert.equal(typeof copy.COPY[`${id}.question`], 'string', `${id}.question`);
  });
  assert.equal(Object.keys(COMPUTE).length, 9);
  assert.equal(Object.keys(PAGE_FILES).length, 9);
});
