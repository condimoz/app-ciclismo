export const ZONE_LABEL = {
  z1: 'Z1 · leve',
  z2: 'Z2 · rodagem',
  z3: 'Z3',
  z4: 'Z4',
  over: 'ACIMA DO TETO',
};
export const ZONE_IDS = ['z1', 'z2', 'z3', 'z4', 'over'];

export function zoneFor(bpm, s) {
  if (bpm == null) return null;
  if (bpm > s.ceiling) return 'over';
  if (bpm < s.z2[0]) return 'z1';
  if (bpm <= s.z2[1]) return 'z2';
  if (bpm <= s.z3[1]) return 'z3';
  return 'z4';
}
