// Tenta manter a página viva com a tela bloqueada: um áudio inaudível em loop
// (o Chrome não suspende abas que tocam mídia) + sessão de mídia na notificação.
// Melhor esforço: o Bluetooth pode ser cortado pelo sistema mesmo assim.
let el;

function silentWav(sec = 2, rate = 8000) {
  const n = sec * rate;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  // ruído de ~-66 dBFS: inaudível, mas não é silêncio digital puro
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, i % 2 ? 16 : -16, true);
  return new Blob([buf], { type: 'audio/wav' });
}

export function startKeepAlive(title = 'Treino em andamento') {
  try {
    el ??= Object.assign(new Audio(URL.createObjectURL(silentWav())), { loop: true, volume: 1 });
    el.play().catch(() => {});
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'FC Ciclismo' });
      navigator.mediaSession.playbackState = 'playing';
    }
  } catch {}
}

export function stopKeepAlive() {
  try {
    el?.pause();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
  } catch {}
}
