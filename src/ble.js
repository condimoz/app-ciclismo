import { parseHeartRate } from './hr.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Conecta numa cinta BLE (serviço Heart Rate). Deve ser chamado de um clique do usuário.
export async function connectHR(onData, onState) {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth indisponível. Use o Chrome no Android.');
  }
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['heart_rate'] }],
  });
  let stopped = false;

  async function open() {
    const server = await device.gatt.connect();
    const svc = await server.getPrimaryService('heart_rate');
    const ch = await svc.getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', (e) => onData(parseHeartRate(e.target.value)));
    await ch.startNotifications();
    onState('connected');
  }

  device.addEventListener('gattserverdisconnected', async () => {
    if (stopped) return;
    onState('reconnecting');
    for (let i = 0; i < 30 && !stopped; i++) {
      try {
        await open();
        return;
      } catch {
        await sleep(Math.min(1000 * (i + 1), 5000));
      }
    }
    if (!stopped) onState('lost');
  });

  await open();
  return {
    name: device.name || 'Cinta',
    disconnect() {
      stopped = true;
      if (device.gatt.connected) device.gatt.disconnect();
      onState('off');
    },
  };
}
