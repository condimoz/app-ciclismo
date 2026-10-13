import test from 'node:test';
import assert from 'node:assert/strict';
import { toCSV, toTCX } from '../src/export.js';
import { timeInZone, summarize, drift } from '../src/stats.js';
import { DEFAULTS } from '../src/settings.js';

const t0 = Date.UTC(2026, 9, 13, 10, 0, 0);
const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 1000, hr: f(i), rr: [], step: 0 }));
const session = {
  startedAt: t0,
  endedAt: t0 + 10_000,
  sport: 'Biking',
  laps: [{ idx: 0, name: 'Z2', start: t0, end: t0 + 10_000 }],
  samples: mk(10, () => 125),
};

test('CSV tem cabeçalho e uma linha por amostra', () => {
  const lines = toCSV(session).split('\n');
  assert.equal(lines.length, 11);
  assert.match(lines[1], /,0,125,,"Z2"$/);
});

test('TCX tem volta, FC média e trackpoints', () => {
  const x = toTCX(session);
  assert.match(x, /<Activity Sport="Biking">/);
  assert.match(x, /<AverageHeartRateBpm><Value>125<\/Value>/);
  assert.equal((x.match(/<Trackpoint>/g) || []).length, 10);
});

test('tempo por zona', () => {
  const z = timeInZone(mk(10, () => 125), DEFAULTS);
  assert.equal(z.z2, 10);
  assert.equal(timeInZone(mk(5, () => 170), DEFAULTS).over, 5);
});

test('resumo ignora amostras sem FC', () => {
  const s = [...mk(3, () => 100), { t: 0, hr: null }];
  assert.deepEqual(summarize(s), { avg: 100, max: 100, min: 100 });
});

test('deriva cardíaca', () => {
  const d = drift(mk(200, (i) => (i < 100 ? 120 : 126)));
  assert.equal(Math.round(d.pct), 5);
  assert.equal(drift(mk(50, () => 120)), null);
});
