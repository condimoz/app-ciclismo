import { loadSettings, saveSettings, DEFAULTS, FIELDS } from './settings.js';
import { zoneFor, ZONE_LABEL, ZONE_IDS } from './zones.js';
import { WORKOUTS, defaultParams } from './workouts.js';
import { Engine } from './engine.js';
import { connectHR } from './ble.js';
import { toCSV, toTCX } from './export.js';
import { timeInZone, summarize, drift } from './stats.js';

const root = document.getElementById('app');
const LAST_KEY = 'fc.last';

const S = {
  settings: loadSettings(),
  view: 'home',
  conn: 'off',
  devName: '',
  latest: { hr: null, at: 0 },
  rrBuf: [],
  link: null,
  sim: null,
  engine: null,
  session: null,
  timer: null,
  wake: null,
  bannerUntil: 0,
  prep: null,
  summary: null,
};

const $ = (id) => document.getElementById(id);
const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
};
const range = (t) => (t ? (t[0] === 0 ? `abaixo de ${t[1]}` : `${t[0]}–${t[1]}`) + ' bpm' : '');

// ---------- áudio, voz e vibração ----------
let actx;
function unlockAudio() {
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    actx.resume?.();
  } catch {}
}
const PATTERNS = {
  high: { tones: [[880, 0.15, 0], [880, 0.15, 0.25]], vib: [150, 100, 150] },
  low: { tones: [[330, 0.45, 0]], vib: [400] },
  ceiling: { tones: [[1000, 0.12, 0], [1000, 0.12, 0.2], [1000, 0.12, 0.4]], vib: [200, 100, 200, 100, 200] },
  act: { tones: [[1000, 0.12, 0], [1000, 0.12, 0.2]], vib: [200, 100, 200] },
  step: { tones: [[660, 0.12, 0], [880, 0.18, 0.15]], vib: [120, 80, 250] },
  info: { tones: [[700, 0.15, 0], [900, 0.15, 0.2]], vib: [200] },
  lost: { tones: [[300, 0.2, 0], [300, 0.2, 0.3]], vib: [300, 100, 300] },
};
function signal(kind, text) {
  const p = PATTERNS[kind] || PATTERNS.info;
  if (actx) {
    for (const [f, d, at] of p.tones) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.frequency.value = f;
      g.gain.value = 0.3;
      o.connect(g);
      g.connect(actx.destination);
      const t = actx.currentTime + at;
      o.start(t);
      o.stop(t + d);
    }
  }
  if (S.settings.vibrate) navigator.vibrate?.(p.vib);
  if (S.settings.voice && text) {
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
  if (document.visibilityState === 'visible' && S.view === 'session') keepAwake(true);
});

// ---------- dados da cinta ----------
function setLatest(m) {
  if (!(m.bpm > 0) || m.contact === false) return;
  S.latest = { hr: m.bpm, at: Date.now() };
  S.rrBuf.push(...m.rr);
  paintLive();
}
function setConn(state) {
  S.conn = state;
  if (S.view === 'home') render();
}
async function connect() {
  unlockAudio();
  setConn('connecting');
  try {
    S.link = await connectHR(setLatest, setConn);
    S.devName = S.link.name;
  } catch (e) {
    setConn('off');
    if (e.name !== 'NotFoundError') alert(e.message || String(e));
  }
}
function disconnect() {
  S.link?.disconnect();
  S.link = null;
  if (S.sim) stopSim();
  setConn('off');
}

// Simulação: permite testar telas, alertas e exportação sem a cinta.
function startSim() {
  unlockAudio();
  let hr = 75;
  S.sim = setInterval(() => {
    const st = S.engine && !S.engine.done ? S.engine.step : null;
    let target = 85;
    if (st?.target) {
      target = st.kind === 'recovery' || st.target[0] === 0 ? 118 : (st.target[0] + st.target[1]) / 2;
    }
    hr += Math.max(-3, Math.min(3, (target - hr) * 0.15)) + (Math.random() - 0.5) * 3;
    const v = Math.round(hr);
    setLatest({ bpm: v, rr: [Math.round(60000 / v)], contact: null });
  }, 1000);
  setConn('sim');
}
function stopSim() {
  clearInterval(S.sim);
  S.sim = null;
}

// ---------- treino ----------
function startWorkout(w, params) {
  const built = w.build(params, S.settings);
  S.engine = new Engine({ ...built, settings: S.settings });
  const now = Date.now();
  S.session = {
    id: now,
    workoutId: w.id,
    workoutName: w.name,
    sport: built.sport,
    startedAt: now,
    endedAt: null,
    samples: [],
    laps: [],
  };
  S.view = 'session';
  unlockAudio();
  keepAwake(true);
  render();
  handleEvents(S.engine.start(now), now);
  S.timer = setInterval(tick, 1000);
}

function tick() {
  const now = Date.now();
  const fresh = S.latest.hr != null && now - S.latest.at < 5000;
  const hr = fresh ? S.latest.hr : null;
  const rr = S.rrBuf.splice(0);
  S.session.samples.push({ t: now, hr, rr, step: S.engine.idx });
  handleEvents(S.engine.tick(now, hr), now);
  if (S.view === 'session') paintLive();
  if (S.session.samples.length % 15 === 0) saveLast();
}

function handleEvents(events, now) {
  for (const ev of events) {
    if (ev.type === 'step') {
      const laps = S.session.laps;
      if (laps.length) laps.at(-1).end = now;
      laps.push({ idx: ev.idx, name: ev.step.name, start: now, end: null });
      const spoken = ev.step.target ? `${ev.step.name}. ${range(ev.step.target).replace('–', ' a ')}` : ev.step.name;
      signal('step', spoken);
    } else if (ev.type === 'alert') {
      S.bannerUntil = now + 6000;
      S.banner = ev.text;
      signal(ev.level, ev.text);
    } else if (ev.type === 'reminder') {
      S.bannerUntil = now + 15000;
      S.banner = ev.text;
      signal('info', ev.text);
    } else if (ev.type === 'done') {
      finish();
      return;
    }
  }
}

function finish() {
  clearInterval(S.timer);
  S.timer = null;
  const now = Date.now();
  const s = S.session;
  s.endedAt = now;
  if (s.laps.length && s.laps.at(-1).end == null) s.laps.at(-1).end = now;
  saveLast();
  keepAwake(false);
  signal('info', 'Treino concluído');
  S.summary = s;
  S.view = 'summary';
  render();
}

function saveLast() {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(S.session));
  } catch {}
}
function loadLast() {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY));
  } catch {
    return null;
  }
}

// ---------- telas ----------
function connLabel() {
  const m = {
    off: ['', 'Cinta desconectada'],
    connecting: ['wait', 'Conectando…'],
    connected: ['on', `Conectado: ${S.devName}`],
    reconnecting: ['wait', 'Reconectando…'],
    lost: ['bad', 'Conexão perdida'],
    sim: ['on', 'Modo simulação'],
  }[S.conn];
  return `<span class="dot ${m[0]}"></span>${m[1]}`;
}
const isLive = () => ['connected', 'sim'].includes(S.conn);

function render() {
  if (S.view === 'session') return renderSession();
  const views = { home: renderHome, prep: renderPrep, settings: renderSettings, summary: renderSummary };
  root.innerHTML = views[S.view]();
  bind();
  paintLive();
}

function renderHome() {
  const last = loadLast();
  return `
  <header><h1>FC Ciclismo</h1><button data-act="settings">⚙ Ajustes</button></header>
  <section class="card">
    <div>${connLabel()}</div>
    <div class="mini" id="homeBpm">--</div>
    <div class="mut" id="homeZone">&nbsp;</div>
    <div class="row">
      ${
        S.conn === 'off' || S.conn === 'lost'
          ? `<button class="primary" data-act="connect">Conectar cinta</button><button data-act="sim">Simular</button>`
          : `<button data-act="disconnect">Desconectar</button>`
      }
    </div>
  </section>
  <h2>Treinos</h2>
  ${WORKOUTS.map((w) => `<button class="workout" data-act="prep" data-id="${w.id}"><b>${w.name}</b><span class="mut">${w.desc}</span></button>`).join('')}
  ${last && last.endedAt ? `<h2>Última sessão</h2><button class="workout" data-act="last"><b>${last.workoutName}</b><span class="mut">${new Date(last.startedAt).toLocaleString('pt-BR')} · ${fmt((last.endedAt - last.startedAt) / 1000)}</span></button>` : ''}`;
}

function renderPrep() {
  const w = S.prep.w;
  return `
  <header><button data-act="home">‹ Voltar</button><h1>${w.name}</h1></header>
  <p class="mut">${w.desc}</p>
  <section class="card">
    ${w.params.map((p) => `<div class="field"><label for="p_${p.key}">${p.label}</label><input id="p_${p.key}" type="number" inputmode="numeric" min="${p.min}" max="${p.max}" value="${S.prep.params[p.key]}"></div>`).join('') || '<div class="mut">Sem parâmetros.</div>'}
    <div class="mut" style="margin-top:10px">${connLabel()}</div>
    <div class="row"><button class="primary" data-act="start" ${isLive() ? '' : 'disabled'}>Iniciar</button></div>
    ${isLive() ? '' : '<div class="mut">Conecte a cinta (ou use Simular) para iniciar.</div>'}
  </section>`;
}

function renderSettings() {
  const s = S.settings;
  const num = (id, v) => `<input id="${id}" type="number" inputmode="numeric" value="${v}">`;
  return `
  <header><button data-act="home">‹ Voltar</button><h1>Ajustes</h1></header>
  <p class="mut">Todas as faixas são editáveis. Quando medir a FC máxima e o limiar, é só atualizar aqui.</p>
  <section class="card">
  ${FIELDS.map((f) => {
    if (f.type === 'range') return `<div class="field"><span>${f.label}</span><span class="pair">${num('f_' + f.key + '_0', s[f.key][0])}–${num('f_' + f.key + '_1', s[f.key][1])}</span></div>`;
    if (f.type === 'bool') return `<div class="field"><label for="f_${f.key}">${f.label}</label><input id="f_${f.key}" type="checkbox" ${s[f.key] ? 'checked' : ''}></div>`;
    return `<div class="field"><label for="f_${f.key}">${f.label}</label>${num('f_' + f.key, s[f.key])}</div>`;
  }).join('')}
    <div class="row"><button class="primary" data-act="save">Salvar</button><button data-act="reset">Restaurar padrão</button></div>
  </section>`;
}

function renderSummary() {
  const s = S.summary;
  const st = S.settings;
  const sum = summarize(s.samples);
  const tz = timeInZone(s.samples, st);
  const total = Object.values(tz).reduce((a, b) => a + b, 0) || 1;
  const colors = { z1: 'var(--z1)', z2: 'var(--z2)', z3: 'var(--z3)', z4: 'var(--z4)', over: 'var(--over)' };
  const driftSteps = new Set(s.laps.filter((l) => /^Z2/.test(l.name)).map((l) => l.idx));
  const d = drift(s.samples, (x) => driftSteps.has(x.step));
  const lapRows = s.laps
    .map((l) => {
      const hrs = s.samples.filter((x) => x.t >= l.start && x.t < (l.end ?? Infinity) && x.hr != null).map((x) => x.hr);
      const a = hrs.length ? Math.round(hrs.reduce((p, q) => p + q, 0) / hrs.length) : '–';
      const mx = hrs.length ? Math.max(...hrs) : '–';
      return `<tr><td>${l.name}</td><td>${fmt(((l.end ?? l.start) - l.start) / 1000)}</td><td>${a}</td><td>${mx}</td></tr>`;
    })
    .join('');
  return `
  <header><button data-act="home">‹ Início</button><h1>${s.workoutName}</h1></header>
  <p class="mut">${new Date(s.startedAt).toLocaleString('pt-BR')} · duração ${fmt(((s.endedAt ?? Date.now()) - s.startedAt) / 1000)}</p>
  <section class="card">
    ${sum ? `<b>FC média ${sum.avg} · máx ${sum.max} · mín ${sum.min} bpm</b>` : 'Sem dados de FC.'}
    ${ZONE_IDS.map((z) => `<div class="zrow"><span>${ZONE_LABEL[z]}</span><div class="bar"><i style="width:${(tz[z] / total) * 100}%;background:${colors[z]}"></i></div><span>${fmt(tz[z])}</span></div>`).join('')}
    ${d ? `<p>Deriva cardíaca nos blocos Z2: <b>${d.pct >= 0 ? '+' : ''}${d.pct.toFixed(1)}%</b> (${d.first.toFixed(0)} → ${d.second.toFixed(0)} bpm)</p>` : ''}
  </section>
  <section class="card"><table><tr><th>Passo</th><th>Tempo</th><th>Média</th><th>Máx</th></tr>${lapRows}</table></section>
  <div class="row"><button class="primary" data-act="tcx">Baixar TCX</button><button data-act="csv">Baixar CSV</button></div>
  <div class="row"><button data-act="share">Compartilhar…</button></div>`;
}

function renderSession() {
  root.innerHTML = `
  <div class="sess z-none" id="sess">
    <div class="top"><span id="sStep"></span><span id="sTotal"></span></div>
    <div class="bpm" id="sBpm">--</div>
    <div class="zone" id="sZone">&nbsp;</div>
    <div class="target" id="sTarget"></div>
    <div class="timer" id="sTimer"></div>
    <div class="next" id="sNext"></div>
    <div class="banner" id="sBanner" hidden></div>
    <div class="btns"><button class="big" data-act="next">PRÓXIMO ▶</button><button class="small" data-act="end">Encerrar</button></div>
  </div>`;
  bind();
  paintLive();
}

function paintLive() {
  const now = Date.now();
  const fresh = S.latest.hr != null && now - S.latest.at < 5000;
  const hr = fresh ? S.latest.hr : null;
  const z = zoneFor(hr, S.settings);
  if (S.view === 'home' && $('homeBpm')) {
    $('homeBpm').textContent = hr ?? '--';
    $('homeZone').textContent = z ? ZONE_LABEL[z] : ' ';
  }
  if (S.view === 'session' && $('sBpm') && S.engine) {
    const e = S.engine.status(now);
    const st = e.step;
    $('sess').className = `sess z-${z ?? 'none'}`;
    $('sBpm').textContent = hr ?? '--';
    $('sZone').textContent = z ? ZONE_LABEL[z] : 'sem sinal';
    $('sStep').textContent = st.name;
    $('sTotal').textContent = fmt(e.total);
    $('sTarget').textContent = range(st.target);
    $('sTimer').textContent =
      st.kind === 'time'
        ? `restam ${fmt(e.remaining)}`
        : st.kind === 'recovery'
          ? `estável ${Math.floor(e.held)}/${st.holdSec}s`
          : fmt(e.stepElapsed);
    $('sNext').textContent = e.next ? `a seguir: ${e.next.name}` : 'último passo';
    const b = $('sBanner');
    b.hidden = now > S.bannerUntil;
    b.textContent = S.banner || '';
  }
}

// ---------- ações ----------
function bind() {
  root.querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', () => act(el.dataset.act, el)));
}

function readSettings() {
  const next = structuredClone(S.settings);
  for (const f of FIELDS) {
    const val = (id) => $(id).valueAsNumber;
    if (f.type === 'range') next[f.key] = [val(`f_${f.key}_0`), val(`f_${f.key}_1`)];
    else if (f.type === 'bool') next[f.key] = $(`f_${f.key}`).checked;
    else next[f.key] = val(`f_${f.key}`);
  }
  const bad = FIELDS.some((f) => f.type === 'range' ? next[f.key].some(Number.isNaN) || next[f.key][0] >= next[f.key][1] : f.type === 'num' && Number.isNaN(next[f.key]));
  return bad ? null : next;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const baseName = (s) => `treino-${new Date(s.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;

async function act(name, el) {
  switch (name) {
    case 'home': S.view = 'home'; return render();
    case 'settings': S.view = 'settings'; return render();
    case 'connect': return connect();
    case 'sim': return startSim();
    case 'disconnect': return disconnect();
    case 'prep': {
      const w = WORKOUTS.find((x) => x.id === el.dataset.id);
      S.prep = { w, params: defaultParams(w) };
      S.view = 'prep';
      return render();
    }
    case 'start': {
      const w = S.prep.w;
      const params = { ...S.prep.params };
      for (const p of w.params) {
        const v = $(`p_${p.key}`).valueAsNumber;
        params[p.key] = Number.isNaN(v) ? p.def : Math.min(p.max, Math.max(p.min, v));
      }
      return startWorkout(w, params);
    }
    case 'next': {
      const now = Date.now();
      return handleEvents(S.engine.next(now), now);
    }
    case 'end':
      if (confirm('Encerrar o treino?')) finish();
      return;
    case 'save': {
      const next = readSettings();
      if (!next) return alert('Confira os valores: faixas precisam ter mínimo menor que máximo.');
      S.settings = next;
      saveSettings(next);
      S.view = 'home';
      return render();
    }
    case 'reset':
      S.settings = structuredClone(DEFAULTS);
      saveSettings(S.settings);
      return render();
    case 'last':
      S.summary = loadLast();
      S.view = 'summary';
      return render();
    case 'tcx': return download(`${baseName(S.summary)}.tcx`, toTCX(S.summary), 'application/vnd.garmin.tcx+xml');
    case 'csv': return download(`${baseName(S.summary)}.csv`, toCSV(S.summary), 'text/csv');
    case 'share': {
      const s = S.summary;
      const files = [
        new File([toTCX(s)], `${baseName(s)}.tcx`, { type: 'application/xml' }),
        new File([toCSV(s)], `${baseName(s)}.csv`, { type: 'text/csv' }),
      ];
      try {
        if (navigator.canShare?.({ files })) await navigator.share({ files, title: s.workoutName });
        else alert('Compartilhamento indisponível aqui. Use os botões de baixar.');
      } catch {}
    }
  }
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
