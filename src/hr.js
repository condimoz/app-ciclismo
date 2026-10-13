// Decodifica a característica Heart Rate Measurement (0x2A37) do perfil BLE padrão.
export function parseHeartRate(dv) {
  const flags = dv.getUint8(0);
  const wide = (flags & 0x01) !== 0;
  const energy = (flags & 0x08) !== 0;
  const rrPresent = (flags & 0x10) !== 0;
  let o = 1;
  const bpm = wide ? dv.getUint16(o, true) : dv.getUint8(o);
  o += wide ? 2 : 1;
  if (energy) o += 2;
  const rr = [];
  if (rrPresent) {
    for (; o + 1 < dv.byteLength; o += 2) {
      rr.push(Math.round((dv.getUint16(o, true) / 1024) * 1000));
    }
  }
  const contact = flags & 0x04 ? (flags & 0x02) !== 0 : null;
  return { bpm, rr, contact };
}
