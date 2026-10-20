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
  assert.equal(ev[0].type, 'stepEnd');
  assert.equal(ev[1].type, 'step');
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
  assert.deepEqual(ev.map((x) => x.type), ['stepEnd', 'done']);
  assert.ok(e.done);
});

// ---------- Tipo 3 · tiros em subida ----------
const mk = (over = {}) => make('t3i', over);
const types = (ev, ty) => ev.filter((x) => x.type === ty);
const levels = (ev, lv) => ev.filter((x) => x.level === lv);
// vai direto ao passo i (botão)
const goto = (e, i, t) => { while (e.idx < i) e.next(t); };

test('tiros: estrutura 4×(tiro+recuperação) + Z2 15 min + volta calma', () => {
  const { b } = mk();
  assert.deepEqual(
    b.steps.map((x) => x.name),
    ['Aquecimento', 'Tiro 1/4', 'Recuperação 1/4', 'Tiro 2/4', 'Recuperação 2/4', 'Tiro 3/4', 'Recuperação 3/4', 'Tiro 4/4', 'Recuperação 4/4', 'Z2', 'Volta calma'],
  );
  assert.equal(b.steps[1].durationSec, 360);
  assert.equal(b.steps[9].durationSec, 900);
});

test('bipe de fim e início de etapa, e contagem dos últimos 10 s', () => {
  const { e } = mk();
  e.start(0);
  const ev0 = e.next(0); // entra no tiro 1
  assert.deepEqual(ev0.map((x) => x.type), ['stepEnd', 'step']);
  const ev = run(e, 0, 360, 150);
  assert.deepEqual(types(ev, 'countdown').map((x) => x.n), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(ev.slice(-3).map((x) => x.type), ['countdown', 'stepEnd', 'step']);
  assert.equal(e.step.name, 'Recuperação 1/4');
  // passos abertos não têm contagem
  assert.equal(types(run(e, 360_000, 60, 150), 'countdown').length, 0);
});

test('tiro: teto 160 gera alarme a cada 3 s; 158–160 não gera "FC alta"', () => {
  const { e } = mk();
  e.start(0);
  e.next(0);
  const ev = run(e, 0, 20, 161);
  assert.equal(levels(ev, 'ceiling').length, 7); // 1,4,7,...,19 s
  assert.equal(levels(ev, 'high').length, 0);
  const { e: e2 } = mk();
  e2.start(0);
  e2.next(0);
  const ev2 = run(e2, 0, 60, 159);
  assert.equal(levels(ev2, 'ceiling').length + levels(ev2, 'high').length, 0);
});

test('tiro: FC <145 só alerta 20 s depois do 1º minuto', () => {
  const { e } = mk();
  e.start(0);
  e.next(0);
  assert.equal(levels(run(e, 0, 79, 130), 'low').length, 0); // 60 s de carência + 20 s
  assert.equal(levels(run(e, 79_000, 2, 130), 'low').length, 1);
  // se subiu ao alvo no 1º minuto e caiu depois, a contagem recomeça
  const { e: e2 } = mk();
  e2.start(0);
  e2.next(0);
  run(e2, 0, 50, 130);
  run(e2, 50_000, 15, 150);
  assert.equal(levels(run(e2, 65_000, 19, 140), 'low').length, 0);
  assert.equal(levels(run(e2, 84_000, 2, 140), 'low').length, 1);
});

test('recuperação aberta: avisa "pode ir" após 20 s estáveis <135 e não avança sozinha', () => {
  const { e } = mk();
  e.start(0);
  goto(e, 2, 0);
  assert.equal(e.step.name, 'Recuperação 1/4');
  run(e, 0, 10, 130);
  run(e, 10_000, 1, 140); // reinicia a contagem
  assert.equal(levels(run(e, 11_000, 19, 130), 'ready').length, 0);
  const ev = run(e, 30_000, 2, 130);
  assert.equal(levels(ev, 'ready').length, 1);
  assert.equal(e.idx, 2);
  // continua abaixo: não repete; sai e volta: repete
  assert.equal(levels(run(e, 32_000, 30, 125), 'ready').length, 0);
  run(e, 62_000, 1, 140);
  assert.equal(levels(run(e, 63_000, 22, 125), 'ready').length, 1);
});

test('recuperação que não desce de 135 em 5 min encerra os tiros e vai ao Z2', () => {
  const { e } = mk();
  e.start(0);
  goto(e, 4, 0); // recuperação 2/4
  const ev = run(e, 0, 301, 145);
  assert.equal(types(ev, 'abort').length, 1);
  assert.equal(e.step.name, 'Z2');
  // se chegou a descer, não desiste
  const { e: e2 } = mk();
  e2.start(0);
  goto(e2, 4, 0);
  run(e2, 0, 25, 130);
  run(e2, 25_000, 400, 145);
  assert.equal(e2.step.name, 'Recuperação 2/4');
});

test('4º tiro sem chegar a 145: pula a recuperação e vai ao Z2', () => {
  const { e } = mk();
  e.start(0);
  goto(e, 7, 0);
  assert.equal(e.step.name, 'Tiro 4/4');
  const ev = run(e, 0, 360, 140);
  assert.equal(types(ev, 'abort').length, 1);
  assert.equal(e.step.name, 'Z2');
});

test('4º tiro que chegou a 145: segue para a recuperação normalmente', () => {
  const { e } = mk();
  e.start(0);
  goto(e, 7, 0);
  run(e, 0, 5, 146);
  const ev = run(e, 5_000, 355, 140);
  assert.equal(types(ev, 'abort').length, 0);
  assert.equal(e.step.name, 'Recuperação 4/4');
});

test('Z2: alerta se sair de 118–132 por mais de 15 s (alto e baixo)', () => {
  const { e } = mk();
  e.start(0);
  goto(e, 9, 0);
  assert.equal(e.step.name, 'Z2');
  assert.equal(levels(run(e, 0, 14, 135), 'high').length, 0);
  assert.equal(levels(run(e, 14_000, 3, 135), 'high').length, 1);
  const { e: e2 } = mk();
  e2.start(0);
  goto(e2, 9, 0);
  assert.equal(levels(run(e2, 0, 14, 110), 'low').length, 0);
  assert.equal(levels(run(e2, 14_000, 3, 110), 'low').length, 1);
  // dentro da faixa não alerta
  const { e: e3 } = mk();
  e3.start(0);
  goto(e3, 9, 0);
  assert.equal(run(e3, 0, 120, 125).filter((x) => x.type === 'alert').length, 0);
});

test('aquecimento: >125 alerta, mas nos últimos 2 min do previsto vai até 135', () => {
  const { e } = mk(); // aquecimento previsto 10 min
  e.start(0);
  assert.equal(levels(run(e, 0, 60, 130), 'high').length > 0, true);
  const { e: e2 } = mk();
  e2.start(0);
  run(e2, 0, 479, 120);
  assert.equal(levels(run(e2, 479_000, 100, 133), 'high').length, 0);
  assert.equal(levels(run(e2, 579_000, 30, 138), 'high').length > 0, true);
});
