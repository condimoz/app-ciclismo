// Máquina de estados do treino. Pura: recebe o tempo (ms) e a FC a cada tick,
// devolve eventos. Não toca em DOM, áudio nem Bluetooth.
export class Engine {
  constructor({ steps, reminders = [], settings }) {
    this.steps = steps;
    this.reminders = reminders.map((r) => ({ ...r, fired: false }));
    this.settings = settings;
    this.idx = 0;
    this.done = false;
    this.last = {};
  }

  get step() {
    return this.steps[this.idx];
  }

  start(now) {
    this.startedAt = now;
    const events = [];
    this._enter(0, now, events);
    return events;
  }

  next(now) {
    const events = [];
    if (!this.done) this._advance(now, events);
    return events;
  }

  status(now) {
    return {
      idx: this.idx,
      step: this.step,
      next: this.steps[this.idx + 1] || null,
      stepElapsed: (now - this.stepStart) / 1000,
      remaining:
        this.step.kind === 'time'
          ? Math.max(0, this.step.durationSec - (now - this.stepStart) / 1000)
          : null,
      held: this.belowSince != null ? (now - this.belowSince) / 1000 : 0,
      total: (now - this.startedAt) / 1000,
    };
  }

  tick(now, hr) {
    const events = [];
    if (this.done) return events;
    const s = this.settings;
    const st = this.step;
    const inStep = (now - this.stepStart) / 1000;
    const elapsed = (now - this.startedAt) / 1000;

    for (const r of this.reminders) {
      if (!r.fired && elapsed >= r.atSec) {
        r.fired = true;
        events.push({ type: 'reminder', text: r.text });
      }
    }

    if (hr == null) {
      this.lostSince ??= now;
      this.belowSince = null;
      if (now - this.lostSince >= 5000 && this._can('lost', now, 20000)) {
        events.push({ type: 'alert', level: 'lost', text: 'Sem sinal da cinta' });
      }
    } else {
      this.lostSince = null;
      this._peak = Math.max(this._peak ?? 0, hr);
      if (hr > (st.ceiling ?? s.ceiling)) {
        if (this._can('ceiling', now, st.ceilingEveryMs ?? 8000)) {
          events.push({ type: 'alert', level: 'ceiling', text: 'Acima do teto, alivie' });
        }
      } else if (st.act && hr >= st.act) {
        if (this._can('act', now, 10000)) {
          events.push({ type: 'alert', level: 'act', text: st.actText || 'Alivie' });
        }
      } else if (st.target) {
        const lo = st.target[0];
        let hi = st.target[1];
        if (st.relax && inStep >= st.relax.afterSec) hi = st.relax.hi;
        if (hr > hi && st.alertHigh !== false) {
          this.highSince ??= now;
          if (
            inStep >= (st.highGraceSec ?? 10) &&
            now - this.highSince >= (st.highHoldSec ?? 5) * 1000 &&
            this._can('high', now, 15000)
          ) {
            events.push({ type: 'alert', level: 'high', text: 'FC alta' });
          }
        } else {
          this.highSince = null;
        }
        // a contagem de "baixa" só começa depois da carência
        if (hr < lo && st.alertLow !== false && inStep >= (st.lowGraceSec ?? 45)) {
          this.lowSince ??= now;
          if (now - this.lowSince >= (st.lowHoldSec ?? 20) * 1000 && this._can('low', now, 25000)) {
            events.push({ type: 'alert', level: 'low', text: 'FC baixa' });
          }
        } else {
          this.lowSince = null;
        }
      }

      if (st.kind === 'recovery' || st.ready) {
        const below = st.kind === 'recovery' ? st.below : st.ready.below;
        const hold = st.kind === 'recovery' ? st.holdSec : st.ready.holdSec;
        if (hr < below) {
          this.belowSince ??= now;
          if (now - this.belowSince >= hold * 1000) {
            this.reachedBelow = true;
            if (st.kind === 'recovery') this._advance(now, events, true);
            else if (!this.readyFired) {
              this.readyFired = true;
              events.push({ type: 'alert', level: 'ready', text: st.ready.text || 'Pode ir' });
            }
          }
        } else {
          this.belowSince = null;
          this.readyFired = false;
        }
      }
    }

    if (!this.done && st === this.step) {
      if (st.kind === 'time') {
        const n = Math.ceil(st.durationSec - inStep);
        if (n >= 1 && n <= 10 && n < (this.lastCount ?? 11)) {
          this.lastCount = n;
          events.push({ type: 'countdown', n });
        }
        if (inStep >= st.durationSec) this._advance(now, events, true);
      } else if (st.giveUpSec != null && !this.reachedBelow && inStep >= st.giveUpSec) {
        // recuperação que não desce: encerra os tiros
        this._advance(now, events, true, true);
      }
    }
    return events;
  }

  _can(key, now, ms) {
    if (this.last[key] !== undefined && now - this.last[key] < ms) return false;
    this.last[key] = now;
    return true;
  }

  // auto: avanço por tempo/condição (não pelo botão). abort: força o salto de saída.
  _advance(now, events, auto = false, abort = false) {
    const st = this.step;
    events.push({ type: 'stepEnd', idx: this.idx, step: st });
    let to = this.idx + 1;
    if (st.exitTo && (abort || (auto && st.mustReach != null && (this._peak ?? 0) < st.mustReach))) {
      const j = this.steps.findIndex((x) => x.id === st.exitTo);
      if (j > to) {
        to = j;
        events.push({ type: 'abort', text: st.exitText || 'Tiros encerrados, vá para o Z2' });
      }
    }
    if (to >= this.steps.length) {
      this.done = true;
      events.push({ type: 'done' });
    } else {
      this._enter(to, now, events);
    }
  }

  _enter(idx, now, events) {
    this.idx = idx;
    this.stepStart = now;
    this.belowSince = null;
    this.highSince = null;
    this.lowSince = null;
    this.lastCount = undefined;
    this.readyFired = false;
    this.reachedBelow = false;
    this._peak = undefined;
    events.push({ type: 'step', idx, step: this.steps[idx] });
  }
}
