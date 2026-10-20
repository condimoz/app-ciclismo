# FC Ciclismo

App web (PWA) que lê a frequência cardíaca de uma cinta BLE (alvo: iGPSPORT HR70)
e conduz treinos guiados por zona, com alertas sonoros, de voz e vibração.

## Funciona assim
- Conecta via **Web Bluetooth** (serviço Heart Rate 0x180D). **Chrome no Android**; não funciona no iPhone.
- Treinos: Tipo 1-4 de bike, **Tipo 3 · Tiros em subida (4×6)** e modo Livre. Passos abertos avançam no botão **PRÓXIMO**;
  recuperação termina sozinha quando a FC fica abaixo do limite de forma estável.
- Bipe de fim e de início de cada etapa, contagem nos últimos 10 s das etapas por tempo; tela colorida abaixo / no alvo / acima da faixa do passo.
- Avisos: FC alta, FC baixa, teto, "agir" (subida) e perda de sinal. Lembrete de banana passa aos 60 min no Tipo 4.
- Ao fim: tempo por zona, deriva cardíaca, tabela por volta e exportação **TCX** e **CSV** (com intervalos RR).
- Zonas e limites editáveis em Ajustes. A tela fica acesa durante o treino (Wake Lock).
- **Simular** gera FC artificial para testar sem a cinta.

## Limitações conhecidas
- Com a tela apagada o Chrome interrompe o Bluetooth. Por isso a tela fica acesa.
- A cinta aceita **uma** conexão Bluetooth por vez. Se o ciclocomputador usa a cinta por Bluetooth,
  coloque-o em ANT+ (a HR70 transmite os dois) ou desconecte antes.
- Web Bluetooth exige HTTPS (ou localhost).

## Desenvolvimento
```
npm test        # testes da lógica (node:test, sem dependências)
npm run serve   # http://localhost:8080
```
Estrutura: `src/engine.js` (máquina de estados do treino, pura), `src/workouts.js` (catálogo),
`src/hr.js` (decodifica 0x2A37), `src/ble.js`, `src/export.js`, `src/stats.js`, `src/app.js` (interface).
