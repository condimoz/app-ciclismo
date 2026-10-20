import test from 'node:test';
import assert from 'node:assert/strict';
import { Timer, buildSteps } from '../src/timer.js';

const types = (ev) => ev.map((x) => x.type);

test('4 tiros de 6 min com recuperação entre eles (e nenhuma depois do último)', () => {
  const s = buildSteps(4, 6);
  assert.deepEqual(s.map((x) => x.kind), ['tiro', 'rec', 'tiro', 'rec', 'tiro', 'rec', 'tiro']);
  assert.equal(s[0].durationSec, 360);
});

test('start avisa o início do tiro 1', () => {
  const t = new Timer(buildSteps(2, 6));
  const ev = t.start(0);
  assert.equal(ev[0].type, 'start');
  assert.equal(ev[0].step.n, 1);
});

test('contagem 10..1 e fim do tiro vai para a recuperação', () => {
  const t = new Timer(buildSteps(2, 1));
  t.start(0);
  const all = [];
  for (let s = 1; s <= 60; s++) all.push(...t.tick(s * 1000));
  assert.deepEqual(all.filter((x) => x.type === 'countdown').map((x) => x.n), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(types(all.slice(-2)), ['end', 'start']);
  assert.equal(t.step.kind, 'rec');
});

test('recuperação é aberta: não avança sozinha, lembra aos 3 min uma vez', () => {
  const t = new Timer(buildSteps(2, 1));
  t.start(0);
  t.next(0); // recuperação
  const ev = [];
  for (let s = 1; s <= 900; s++) ev.push(...t.tick(s * 1000));
  assert.deepEqual(types(ev), ['reminder']);
  assert.equal(t.step.kind, 'rec');
  const go = t.next(900_000);
  assert.deepEqual(types(go), ['end', 'start']);
  assert.equal(t.step.n, 2);
});

test('termina ao fim do último tiro', () => {
  const t = new Timer(buildSteps(1, 1));
  t.start(0);
  const ev = t.tick(60_000);
  assert.deepEqual(types(ev.slice(-2)), ['end', 'done']);
  assert.ok(t.done);
  assert.deepEqual(t.tick(61_000), []);
});
