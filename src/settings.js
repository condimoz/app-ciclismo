export const DEFAULTS = {
  warm: [112, 125],
  z2: [118, 132],
  z3: [133, 149],
  z4: [150, 165],
  ceiling: 165,
  recoveryBelow: 135,
  recoveryHoldSec: 15,
  coolBelow: 122,
  intervalWork: [150, 163],
  climbWork: [145, 158],
  climbAct: 160,
  voice: true,
  vibrate: true,
};

// Campos exibidos na tela de ajustes.
export const FIELDS = [
  { key: 'warm', label: 'Aquecimento', type: 'range' },
  { key: 'z2', label: 'Z2 (rodagem)', type: 'range' },
  { key: 'z3', label: 'Z3', type: 'range' },
  { key: 'z4', label: 'Z4', type: 'range' },
  { key: 'ceiling', label: 'Teto absoluto (bpm)', type: 'num' },
  { key: 'intervalWork', label: 'Intervalo curto (esforço)', type: 'range' },
  { key: 'climbWork', label: 'Subida longa (esforço)', type: 'range' },
  { key: 'climbAct', label: 'Subida: agir a partir de (bpm)', type: 'num' },
  { key: 'recoveryBelow', label: 'Recuperação: abaixo de (bpm)', type: 'num' },
  { key: 'recoveryHoldSec', label: 'Recuperação: estável por (s)', type: 'num' },
  { key: 'coolBelow', label: 'Volta calma: abaixo de (bpm)', type: 'num' },
  { key: 'voice', label: 'Avisos por voz', type: 'bool' },
  { key: 'vibrate', label: 'Vibração', type: 'bool' },
];

const KEY = 'fc.settings';

export function loadSettings(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(KEY) || '{}');
    return { ...structuredClone(DEFAULTS), ...saved };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
