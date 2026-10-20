import { Timer, buildSteps, REC_REMINDER_SEC } from './timer.js';
import { startKeepAlive, stopKeepAlive } from './keepalive.js';

const root = document.getElementById('app');
const CFG_KEY = 'tiros.cfg';
const S = { cfg: loadCfg(), timer: null, loop: null, wake: null, view: 'home', startedAt: 0, finishedAt: 0 };

function loadCfg() {
  try {
    return { reps: 4, min: 6, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') };
  } catch {
    return { reps: 4, min: 6 };
  }
}

const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

// ---------- som, voz e vibração ----------
let actx;
function unlockAudio() {
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    actx.resume?.();
  } catch {}
}
const PATTERNS = {
  go: { tones: [[660, 0.15, 0], [880, 0.15, 0.2], [1320, 0.35, 0.4]], vib: [300, 100, 300] },
  rest: { tones: [[880, 0.15, 0], [660, 0.15, 0.2], [440, 0.35, 0.4]], vib: [500] },
  tick: { tones: [[1200, 0.06, 0]], vib: [40] },
  remind: { tones: [[784, 0.12, 0], [988, 0.12, 0.2]], vib: [150, 80, 150] },
  done: { tones: [[660, 0.15, 0], [880, 0.15, 0.2], [1100, 0.15, 0.4], [1320, 0.4, 0.6]], vib: [200, 100, 200, 100, 400] },
};
function signal(kind, text) {
  const p = PATTERNS[kind];
  if (actx) {
    for (const [f, d, at] of p.tones) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.frequency.value = f;
      g.gain.value = 0.4;
      o.connect(g);
      g.connect(actx.destination);
      const t = actx.currentTime + at;
      o.start(t);
      o.stop(t + d);
    }
  }
  navigator.vibrate?.(p.vib);
  if (text) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR';
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {}
  }
}

async function keepAwake(on) {
  try {
    if (on) S.wake = await navigator.wakeLock?.request('screen');
    else {
      await S.wake?.release();
      S.wake = null;
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.view === 'run') keepAwake(true);
});

// ---------- treino ----------
function begin() {
  const reps = Math.min(10, Math.max(1, Math.round(document.getElementById('reps').valueAsNumber) || 4));
  const min = Math.min(20, Math.max(1, document.getElementById('min').valueAsNumber || 6));
  S.cfg = { reps, min };
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(S.cfg));
  } catch {}
  unlockAudio();
  keepAwake(true);
  startKeepAlive('Tiros em andamento');
  S.timer = new Timer(buildSteps(reps, min));
  S.view = 'run';
  S.startedAt = Date.now();
  renderRun();
  handle(S.timer.start(Date.now()));
  S.loop = setInterval(tick, 250);
}

function tick() {
  handle(S.timer.tick(Date.now()));
  paint();
}

function handle(events) {
  for (const ev of events) {
    if (ev.type === 'start') {
      const st = ev.step;
      if (st.kind === 'tiro') signal('go', `Tiro ${st.n} de ${st.of}. Vai!`);
      else signal('rest', 'Recuperação. Abaixe e estabilize a frequência');
    } else if (ev.type === 'countdown') signal('tick');
    else if (ev.type === 'reminder') signal('remind', 'Três minutos. Confira a frequência');
    else if (ev.type === 'done') return finish();
  }
  paint();
}

function finish() {
  clearInterval(S.loop);
  S.loop = null;
  S.finishedAt = Date.now();
  keepAwake(false);
  stopKeepAlive();
  signal('done', 'Treino concluído');
  S.view = 'done';
  renderDone();
}

// ---------- telas ----------
function renderHome() {
  root.innerHTML = `
  <h1>Tiros</h1>
  <p class="mut">Tiro por tempo. Recuperação aberta: você decide quando começar o próximo tiro.</p>
  <div class="field"><label for="reps">Tiros</label><input id="reps" type="number" inputmode="numeric" min="1" max="10" value="${S.cfg.reps}"></div>
  <div class="field"><label for="min">Duração do tiro (min)</label><input id="min" type="number" inputmode="decimal" min="1" max="20" step="0.5" value="${S.cfg.min}"></div>
  <button class="start" id="start">START</button>`;
  document.getElementById('start').onclick = begin;
}

function renderRun() {
  root.innerHTML = `
  <div class="run" id="run">
    <div class="label" id="label"></div>
    <div class="clock" id="clock"></div>
    <div class="sub" id="sub"></div>
    <div class="btns"><button class="big" id="next"></button><button class="small" id="end">Encerrar</button></div>
  </div>`;
  document.getElementById('next').onclick = () => {
    unlockAudio();
    handle(S.timer.next(Date.now()));
  };
  document.getElementById('end').onclick = () => confirm('Encerrar o treino?') && finish();
  paint();
}

function paint() {
  if (S.view !== 'run' || !S.timer || S.timer.done) return;
  const now = Date.now();
  const t = S.timer;
  const st = t.step;
  const run = document.getElementById('run');
  run.className = `run ${st.kind}`;
  if (st.kind === 'tiro') {
    document.getElementById('label').textContent = `Tiro ${st.n}/${st.of}`;
    document.getElementById('clock').textContent = fmt(Math.ceil(t.remaining(now)));
    document.getElementById('sub').textContent = 'restam';
    document.getElementById('next').textContent = 'Pular tiro ▶';
  } else {
    const el = t.elapsed(now);
    document.getElementById('label').textContent = `Recuperação ${st.n}/${st.of - 1}`;
    document.getElementById('clock').textContent = fmt(el);
    document.getElementById('sub').textContent =
      el >= REC_REMINDER_SEC ? 'FC abaixo de 135 e estável? Pode ir' : 'abaixe até 135 e estabilize';
    document.getElementById('next').textContent = 'Começar próximo tiro ▶';
  }
}

function renderDone() {
  root.innerHTML = `
  <h1>Treino concluído</h1>
  <p class="mut">Duração total: ${fmt((S.finishedAt - S.startedAt) / 1000)}</p>
  <button class="start" id="again">Voltar</button>`;
  document.getElementById('again').onclick = () => {
    S.view = 'home';
    renderHome();
  };
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
renderHome();
