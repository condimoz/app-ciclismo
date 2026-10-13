import { zoneFor } from './zones.js';

export function timeInZone(samples, settings) {
  const out = { z1: 0, z2: 0, z3: 0, z4: 0, over: 0 };
  for (let i = 0; i < samples.length; i++) {
    const { t, hr } = samples[i];
    if (hr == null) continue;
    const dt = i + 1 < samples.length ? Math.min((samples[i + 1].t - t) / 1000, 5) : 1;
    out[zoneFor(hr, settings)] += dt;
  }
  return out;
}

export function summarize(samples) {
  const v = samples.filter((x) => x.hr != null).map((x) => x.hr);
  if (!v.length) return null;
  return {
    avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
    max: Math.max(...v),
    min: Math.min(...v),
  };
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// Deriva cardíaca: média da 2ª metade contra a 1ª, nas amostras escolhidas.
export function drift(samples, pred = () => true, minSamples = 120) {
  const v = samples.filter((x) => x.hr != null && pred(x)).map((x) => x.hr);
  if (v.length < minSamples) return null;
  const h = Math.floor(v.length / 2);
  const first = avg(v.slice(0, h));
  const second = avg(v.slice(h));
  return { first, second, pct: ((second - first) / first) * 100 };
}
