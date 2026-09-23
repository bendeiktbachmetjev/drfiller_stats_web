import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { COLORS } from '../../charts/theme.js';

// §5.3.4: tokens.css ↔ charts/theme.js agree, the contrast minimums hold, and no copied SimuFlow file
// keeps a text opacity class (text must pick ink / ink-soft / ink-mute instead).

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const tokensCss = readFileSync(path.join(SRC, 'styles/tokens.css'), 'utf8');
const TOKENS = Object.fromEntries([...tokensCss.matchAll(/--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(([, name, hex]) => [name, hex.toUpperCase()]));

// --- WCAG 2.x contrast ------------------------------------------------------------------------------
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (c) => {
  const [r, g, b] = c.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const blend = (fg, bg, alpha) => rgb(fg).map((x, i) => alpha * x + (1 - alpha) * rgb(bg)[i]);
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const T = (name) => rgb(TOKENS[name]);

// --- colour-blind distance (Machado 2009, severity 1; CIE76 ΔE) ----------------------------------------
const PROTAN = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]];
const DEUTAN = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]];
const linS = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gamma = (c) => {
  const x = Math.max(0, Math.min(1, c));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};
const simulate = (hex, m) => {
  const l = rgb(hex).map(linS);
  return m.map((row) => gamma(row[0] * l[0] + row[1] * l[1] + row[2] * l[2]));
};
const lab = (c) => {
  const [r, g, b] = c.map(linS);
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X / 0.95047), f(Y), f(Z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
const cvdDistance = (a, b) => Math.min(dE(simulate(TOKENS[a], PROTAN), simulate(TOKENS[b], PROTAN)), dE(simulate(TOKENS[a], DEUTAN), simulate(TOKENS[b], DEUTAN)));

test('tokens.css and charts/theme.js carry the same hex values', () => {
  assert.ok(Object.keys(TOKENS).length >= 20, 'tokens parsed');
  Object.entries(TOKENS).forEach(([name, hex]) => assert.equal(COLORS[name]?.toUpperCase(), hex, `--color-${name}`));
  Object.keys(COLORS).forEach((name) => assert.ok(TOKENS[name], `theme.js colour ${name} exists in tokens.css`));
});

test('text pairs reach 4.5:1 (§5.3.4 contrast evidence)', () => {
  const white = T('surface');
  const pairs = [
    ['ink on white', T('ink'), white, 10.2],
    ['ink-soft on white', T('ink-soft'), white, 6.4],
    ['ink-mute on white', T('ink-mute'), white, 4.9],
    ['ink-mute on page-mid', T('ink-mute'), T('page-mid'), 4.6],
    ['brand on white', T('brand'), white, 7.3],
    ['brand on brand/10', T('brand'), blend(TOKENS.brand, TOKENS.surface, 0.1), 6.2],
    ['ink-soft on brand/10', T('ink-soft'), blend(TOKENS.brand, TOKENS.surface, 0.1), 5.5],
    ['ink-soft on bad-tint', T('ink-soft'), T('bad-tint'), 5.9],
    ['ink-soft on line/40', T('ink-soft'), blend(TOKENS.line, TOKENS.surface, 0.4), 5.7],
    ['bad on bad-tint', T('bad'), T('bad-tint'), 6.0],
    ['warn on warn-tint', T('warn'), T('warn-tint'), 5.2],
    ['white/85 on brand', blend('#FFFFFF', TOKENS.brand, 0.85), T('brand'), 5.7],
    ['brand-strong on white', T('brand-strong'), white, 10.5],
  ];
  pairs.forEach(([name, fg, bg, min]) => {
    const value = ratio(fg, bg);
    assert.ok(value >= 4.5 && value >= min, `${name}: ${value.toFixed(2)} (needs ${min})`);
  });
});

test('graphics reach 3:1 and series stay apart for colour-blind readers', () => {
  ['data-mute', 'rec-light', 'fallback', 'cost', 'infra', 'anamnesis', 'rec', 'brand', 'brand-light'].forEach((name) => {
    const value = ratio(T(name), T('surface'));
    assert.ok(value >= 3, `${name} on white: ${value.toFixed(2)}`);
  });
  assert.ok(cvdDistance('brand', 'rec') >= 50, 'brand–rec');
  assert.ok(cvdDistance('brand', 'fallback') >= 114, 'brand–fallback');
  assert.ok(cvdDistance('brand', 'anamnesis') >= 35, 'brand–anamnesis');
  ['brand', 'rec', 'rec-light', 'fallback', 'anamnesis', 'cost', 'data-mute'].forEach((other) => {
    assert.ok(cvdDistance('infra', other) >= 28, `infra–${other}: ${cvdDistance('infra', other).toFixed(1)}`);
  });
});

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));

test('no text opacity classes and no SimuFlow colours in ui/, charts/, app/, auth/', () => {
  // Allowed: white text on the brand hero / dark tooltip at ≥ 85 % (5.8:1 on brand).
  const offenders = [];
  ['ui', 'charts', 'app', 'auth'].forEach((dir) => {
    walk(path.join(SRC, dir))
      .filter((file) => /\.(jsx?|css)$/.test(file))
      .forEach((file) => {
        const text = readFileSync(file, 'utf8');
        for (const [cls, color, alpha] of text.matchAll(/\btext-([a-z-]+|\[#[0-9A-Fa-f]+\])\/(\d+)\b/g)) {
          if (color === 'white' && Number(alpha) >= 85) continue;
          offenders.push(`${path.relative(SRC, file)}: ${cls}`);
        }
        for (const [hex] of text.matchAll(/#(78003F|4A0027|E64164|B3205A)\b/gi)) offenders.push(`${path.relative(SRC, file)}: ${hex}`);
      });
  });
  assert.deepEqual(offenders, []);
});
