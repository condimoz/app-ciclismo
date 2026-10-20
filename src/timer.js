// Lógica pura do treino: Tiro (por tempo) → Recuperação (aberta, termina no botão).
// Recebe o tempo (ms) e devolve eventos; não toca em DOM nem áudio.
export const REC_REMINDER_SEC = 180;

export function buildSteps(reps, tiroMin) {
  const steps = [];
  for (let i = 1; i <= reps; i++) {
    steps.push({ kind: 'tiro', n: i, of: reps, durationSec: Math.round(tiroMin * 60) });
    if (i < reps) steps.push({ kind: 'rec', n: i, of: reps });
  }
  return steps;
}

export class Timer {
  constructor(steps) {
    this.steps = steps;
    this.idx = 0;
    this.done = false;
  }

  get step() {
    return this.steps[this.idx];
  }

  start(now) {
    return this._enter(0, now);
  }

  // botão "próxima etapa"
  next(now) {
    return this.done ? [] : this._advance(now);
  }

  elapsed(now) {
    return (now - this.stepStart) / 1000;
  }

  remaining(now) {
    const st = this.step;
    return st.kind === 'tiro' ? Math.max(0, st.durationSec - this.elapsed(now)) : null;
  }

  tick(now) {
    const ev = [];
    if (this.done) return ev;
    const st = this.step;
    const el = this.elapsed(now);
    if (st.kind === 'tiro') {
      const n = Math.ceil(st.durationSec - el);
      if (n >= 1 && n <= 10 && n < this.lastCount) {
        this.lastCount = n;
        ev.push({ type: 'countdown', n });
      }
      if (el >= st.durationSec) ev.push(...this._advance(now));
    } else if (!this.reminded && el >= REC_REMINDER_SEC) {
      this.reminded = true;
      ev.push({ type: 'reminder' });
    }
    return ev;
  }

  _advance(now) {
    const ev = [{ type: 'end', step: this.step }];
    if (this.idx + 1 >= this.steps.length) {
      this.done = true;
      ev.push({ type: 'done' });
    } else {
      ev.push(...this._enter(this.idx + 1, now));
    }
    return ev;
  }

  _enter(idx, now) {
    this.idx = idx;
    this.stepStart = now;
    this.lastCount = 11;
    this.reminded = false;
    return [{ type: 'start', step: this.steps[idx] }];
  }
}
