import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
import { WORKOUTS, defaultParams } from '../src/workouts.js';
import { DEFAULTS } from '../src/settings.js';

const S = structuredClone(DEFAULTS);
const make = (id, over = {}) => {
  const w = WORKOUTS.find((x) => x.id === id);
  const b = w.build({ ...defaultParams(w), ...over }, S);
  const e = new Engine({ ...b, settings: S });
  return { e, b };
};
// roda n segundos com FC constante; devolve eventos
function run(e, t0, secs, hr) {
  const ev = [];
  for (let i = 1; i <= secs; i++) ev.push(...e.tick(t0 + i * 1000, hr));
  return ev;
}

test('passo aberto só avança no botão', () => {
  const { e } = make('t1');
  e.start(0);
  run(e, 0, 600, 118);
  assert.equal(e.idx, 0);
  const ev = e.next(600_000);
  assert.equal(ev[0].type, 'step');
  assert.equal(e.idx, 1);
});

test('passo por tempo avança sozinho', () => {
  const { e } = make('t1', { min: 1 });
  e.start(0);
  e.next(0);
  run(e, 0, 59, 125);
  assert.equal(e.idx, 1);
  run(e, 59_000, 2, 125);
  assert.equal(e.idx, 2);
});

test('recuperação exige FC estável abaixo do limite', () => {
  const { e } = make('t2', { reps: 2, min: 1 });
  e.start(0);
  e.next(0); // intervalo 1
  run(e, 0, 60, 155); // termina o esforço
  assert.equal(e.step.kind, 'recovery');
  const t = 60_000;
  run(e, t, 10, 130);
  run(e, t + 10_000, 1, 140); // toque acima zera a contagem
  const ev = run(e, t + 11_000, 14, 130);
  assert.equal(e.step.kind, 'recovery');
  assert.equal(ev.filter((x) => x.type === 'step').length, 0);
  run(e, t + 25_000, 2, 130);
  assert.equal(e.step.name, 'Intervalo 2/2');
});

test('não há recuperação depois da última repetição', () => {
  const { b } = make('t2', { reps: 2 });
  const kinds = b.steps.map((x) => x.kind);
  assert.deepEqual(kinds, ['open', 'time', 'recovery', 'time', 'open']);
});

test('teto absoluto avisa e respeita o intervalo entre avisos', () => {
  const { e } = make('t1');
  e.start(0);
  const ev = run(e, 0, 20, 170).filter((x) => x.level === 'ceiling');
  assert.equal(ev.length, 3); // 1s, 9s, 17s
});

test('subida: age ao cruzar 160', () => {
  const { e } = make('t3');
  e.start(0);
  e.next(0);
  const ev = run(e, 0, 5, 161).filter((x) => x.level === 'act');
  assert.equal(ev.length, 1);
  assert.match(ev[0].text, /Marcha/);
});

test('FC alta só alerta depois da carência e se for sustentada', () => {
  const { e } = make('t1');
  e.start(0);
  e.next(0); // Z2, alvo 118-132
  assert.equal(run(e, 0, 9, 140).filter((x) => x.level === 'high').length, 0);
  assert.equal(run(e, 9_000, 10, 140).filter((x) => x.level === 'high').length, 1);
});

test('FC baixa em Z2 alerta após carência; aquecimento não', () => {
  const { e } = make('t1');
  e.start(0);
  assert.equal(run(e, 0, 120, 80).filter((x) => x.level === 'low').length, 0);
  e.next(120_000);
  const ev = run(e, 120_000, 90, 100).filter((x) => x.level === 'low');
  assert.ok(ev.length >= 1);
});

test('sem sinal gera alerta após 5 s', () => {
  const { e } = make('t1');
  e.start(0);
  assert.equal(run(e, 0, 4, null).length, 0);
  assert.equal(run(e, 4_000, 3, null).filter((x) => x.level === 'lost').length, 1);
});

test('lembrete da banana passa aos 60 min no Tipo 4', () => {
  const { e } = make('t4');
  e.start(0);
  e.next(0);
  const ev = run(e, 0, 3601, 125).filter((x) => x.type === 'reminder');
  assert.equal(ev.length, 1);
  assert.match(ev[0].text, /Banana/);
});

test('treino termina no último passo', () => {
  const { e } = make('free');
  e.start(0);
  const ev = e.next(1000);
  assert.equal(ev[0].type, 'done');
  assert.ok(e.done);
});
