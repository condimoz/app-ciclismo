# Tiros

Cronômetro simples de tiros, com avisos sonoros. Sem cinta, sem Bluetooth.

- **START** → avisa o início do Tiro 1 (bipe, voz e vibração).
- **Tiro**: por tempo (padrão 6 min). Contagem com bipes nos últimos 10 s e aviso ao terminar.
- **Recuperação**: tempo aberto. Quando a FC estiver abaixo de 135 e estável, aperte **Começar próximo tiro**.
  Aos 3 min toca um lembrete para conferir a frequência.
- Padrão: 4 tiros (editável na tela inicial). A tela fica acesa (Wake Lock) e um áudio inaudível tenta manter o som com a tela bloqueada (melhor esforço; teste no seu celular).

```
npm test        # testes da lógica
npm run serve   # http://localhost:8080
```
Arquivos: `src/timer.js` (lógica), `src/app.js` (interface e som), `src/keepalive.js`.
