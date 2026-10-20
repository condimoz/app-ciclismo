// Catálogo de treinos. Cada build() devolve { steps, reminders, sport }.
// Passos: 'open' (termina no botão), 'time' (termina por tempo),
// 'recovery' (termina quando a FC fica abaixo do limite de forma estável).

const warm = (s) => ({ name: 'Aquecimento', kind: 'open', target: s.warm, alertLow: false });
const cool = (s) => ({
  name: 'Volta calma',
  kind: 'open',
  target: [0, s.coolBelow],
  alertLow: false,
  alertHigh: false,
});
const body = (s, min, name = 'Z2') => ({
  name,
  kind: 'time',
  durationSec: Math.round(min * 60),
  target: s.z2,
  drift: true,
});
const recovery = (s) => ({
  name: 'Recuperação',
  kind: 'recovery',
  below: s.recoveryBelow,
  holdSec: s.recoveryHoldSec,
  target: [0, s.recoveryBelow],
  alertLow: false,
  alertHigh: false,
});

export const WORKOUTS = [
  {
    id: 't1',
    name: 'Tipo 1 · Rodagem',
    desc: 'Aquecimento, corpo em Z2 e volta calma.',
    params: [{ key: 'min', label: 'Corpo em Z2 (min)', def: 55, min: 20, max: 90 }],
    build: (p, s) => ({
      sport: 'Biking',
      steps: [warm(s), body(s, p.min), cool(s)],
      reminders: [],
    }),
  },
  {
    id: 't2',
    name: 'Tipo 2 · Intervalo curto',
    desc: 'Esforço de 3 min com recuperação até a FC cair.',
    params: [
      { key: 'reps', label: 'Repetições', def: 4, min: 1, max: 10 },
      { key: 'min', label: 'Esforço (min)', def: 3, min: 1, max: 10 },
    ],
    build: (p, s) => {
      const steps = [warm(s)];
      for (let i = 1; i <= p.reps; i++) {
        steps.push({
          name: `Intervalo ${i}/${p.reps}`,
          kind: 'time',
          durationSec: Math.round(p.min * 60),
          target: s.intervalWork,
          lowGraceSec: 90,
        });
        if (i < p.reps) steps.push(recovery(s));
      }
      steps.push(cool(s));
      return { sport: 'Biking', steps, reminders: [] };
    },
  },
  {
    id: 't3',
    name: 'Tipo 3 · Subida longa',
    desc: 'Blocos longos de subida; age ao cruzar o limite.',
    params: [
      { key: 'reps', label: 'Repetições', def: 3, min: 1, max: 6 },
      { key: 'min', label: 'Bloco (min)', def: 6, min: 3, max: 10 },
      { key: 'extra', label: 'Z2 extra no fim (min)', def: 20, min: 0, max: 40 },
    ],
    build: (p, s) => {
      const steps = [warm(s)];
      for (let i = 1; i <= p.reps; i++) {
        steps.push({
          name: `Subida ${i}/${p.reps}`,
          kind: 'time',
          durationSec: Math.round(p.min * 60),
          target: s.climbWork,
          act: s.climbAct,
          actText: 'Marcha mais leve, depois cadência, depois ziguezague',
          lowGraceSec: 120,
        });
        if (i < p.reps) steps.push(recovery(s));
      }
      if (p.extra > 0) steps.push(body(s, p.extra, 'Z2 extra'));
      steps.push(cool(s));
      return { sport: 'Biking', steps, reminders: [] };
    },
  },
  {
    id: 't3i',
    name: 'Tipo 3 · Tiros em subida (4×6)',
    desc: 'Tiros por FC; recuperação aberta com aviso de "pode ir".',
    params: [
      { key: 'reps', label: 'Tiros', def: 4, min: 1, max: 8 },
      { key: 'min', label: 'Tiro (min)', def: 6, min: 2, max: 10 },
      { key: 'warm', label: 'Aquecimento previsto (min)', def: 10, min: 4, max: 30 },
      { key: 'recMax', label: 'Recuperação: desistir após (min)', def: 5, min: 2, max: 15 },
      { key: 'z2', label: 'Z2 final (min)', def: 15, min: 5, max: 40 },
    ],
    build: (p, s) => {
      const steps = [
        {
          ...warm(s),
          // nos últimos 2 min do aquecimento previsto a FC pode subir até warmRelaxTo
          relax: { afterSec: Math.max(0, p.warm - 2) * 60, hi: s.warmRelaxTo },
        },
      ];
      for (let i = 1; i <= p.reps; i++) {
        const last = i === p.reps;
        steps.push({
          name: `Tiro ${i}/${p.reps}`,
          kind: 'time',
          durationSec: Math.round(p.min * 60),
          target: s.climbWork,
          ceiling: s.sprintCeiling,
          ceilingEveryMs: 3000,
          alertHigh: false,
          lowGraceSec: 60,
          lowHoldSec: 20,
          // no último tiro, se a FC nunca chegou ao piso, pula a recuperação e vai ao Z2
          ...(last ? { mustReach: s.climbWork[0], exitTo: 'z2', exitText: 'FC não chegou ao alvo, vá para o Z2' } : {}),
        });
        steps.push({
          name: `Recuperação ${i}/${p.reps}`,
          kind: 'open',
          target: [0, s.recoveryBelow],
          alertLow: false,
          alertHigh: false,
          ready: { below: s.recoveryBelow, holdSec: s.readyHoldSec, text: 'Pode ir' },
          // não desceu do limite em recMax min: encerra os tiros
          ...(last ? {} : { giveUpSec: p.recMax * 60, exitTo: 'z2', exitText: 'FC não desceu, vá para o Z2' }),
        });
      }
      steps.push({
        ...body(s, p.z2),
        id: 'z2',
        highGraceSec: 0,
        highHoldSec: 15,
        lowGraceSec: 0,
        lowHoldSec: 15,
      });
      steps.push(cool(s));
      return { sport: 'Biking', steps, reminders: [] };
    },
  },
  {
    id: 't4',
    name: 'Tipo 4 · Rodagem longa',
    desc: 'Corpo longo em Z2. Lembra da banana passa aos 60 min.',
    params: [{ key: 'min', label: 'Corpo em Z2 (min)', def: 78, min: 40, max: 150 }],
    build: (p, s) => ({
      sport: 'Biking',
      steps: [warm(s), body(s, p.min), cool(s)],
      reminders: [{ atSec: 3600, text: 'Banana passa e carboidrato' }],
    }),
  },
  {
    id: 'free',
    name: 'Livre',
    desc: 'Só monitora e grava, avisando apenas o teto.',
    params: [],
    build: () => ({
      sport: 'Biking',
      steps: [{ name: 'Livre', kind: 'open', target: null }],
      reminders: [],
    }),
  },
];

export function defaultParams(w) {
  return Object.fromEntries(w.params.map((p) => [p.key, p.def]));
}
