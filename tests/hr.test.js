import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHeartRate } from '../src/hr.js';

const dv = (...bytes) => new DataView(new Uint8Array(bytes).buffer);

test('FC 8 bits sem RR', () => {
  assert.deepEqual(parseHeartRate(dv(0x00, 72)), { bpm: 72, rr: [], contact: null });
});

test('FC 16 bits', () => {
  assert.equal(parseHeartRate(dv(0x01, 0x2c, 0x01)).bpm, 300);
});

test('RR em unidades de 1/1024 s', () => {
  // flags: RR presente (0x10); 1024 -> 1000 ms; 512 -> 500 ms
  const r = parseHeartRate(dv(0x10, 60, 0x00, 0x04, 0x00, 0x02));
  assert.equal(r.bpm, 60);
  assert.deepEqual(r.rr, [1000, 500]);
});

test('energia gasta é pulada antes dos RR', () => {
  const r = parseHeartRate(dv(0x18, 80, 0xaa, 0xbb, 0x00, 0x04));
  assert.deepEqual(r.rr, [1000]);
});

test('contato do sensor', () => {
  assert.equal(parseHeartRate(dv(0x06, 70)).contact, true);
  assert.equal(parseHeartRate(dv(0x04, 0)).contact, false);
});
