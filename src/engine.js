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
      if (hr > s.ceiling) {
        if (this._can('ceiling', now, 8000)) {
          events.push({ type: 'alert', level: 'ceiling', text: 'Acima do teto, alivie' });
        }
      } else if (st.act && hr >= st.act) {
        if (this._can('act', now, 10000)) {
          events.push({ type: 'alert', level: 'act', text: st.actText || 'Alivie' });
        }
      } else if (st.target) {
        const [lo, hi] = st.target;
        if (hr > hi && st.alertHigh !== false) {
          this.highSince ??= now;
          if (
            inStep >= (st.highGraceSec ?? 10) &&
            now - this.highSince >= 5000 &&
            this._can('high', now, 15000)
          ) {
            events.push({ type: 'alert', level: 'high', text: 'FC alta' });
          }
        } else {
          this.highSince = null;
        }
        if (hr < lo && st.alertLow !== false) {
          this.lowSince ??= now;
          if (
            inStep >= (st.lowGraceSec ?? 45) &&
            now - this.lowSince >= 20000 &&
            this._can('low', now, 25000)
          ) {
            events.push({ type: 'alert', level: 'low', text: 'FC baixa' });
          }
        } else {
          this.lowSince = null;
        }
      }

      if (st.kind === 'recovery') {
        if (hr < st.below) {
          this.belowSince ??= now;
          if (now - this.belowSince >= st.holdSec * 1000) this._advance(now, events);
        } else {
          this.belowSince = null;
        }
      }
    }

    if (!this.done && st === this.step && st.kind === 'time' && inStep >= st.durationSec) {
      this._advance(now, events);
    }
    return events;
  }

  _can(key, now, ms) {
    if (this.last[key] !== undefined && now - this.last[key] < ms) return false;
    this.last[key] = now;
    return true;
  }

  _advance(now, events) {
    if (this.idx + 1 >= this.steps.length) {
      this.done = true;
      events.push({ type: 'done' });
    } else {
      this._enter(this.idx + 1, now, events);
    }
  }

  _enter(idx, now, events) {
    this.idx = idx;
    this.stepStart = now;
    this.belowSince = null;
    this.highSince = null;
    this.lowSince = null;
    events.push({ type: 'step', idx, step: this.steps[idx] });
  }
}
