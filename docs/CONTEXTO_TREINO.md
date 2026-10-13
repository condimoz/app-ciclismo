# Contexto de treino (referência para o app)

Resumo das regras de treino usadas no app. Valores editáveis em **Ajustes**.
FC máxima e limiar ainda **não medidos**: as faixas abaixo são provisórias.

## Zonas de FC (bike)
- Aquecimento: 112-125
- Z2 (rodagem): 118-132
- Z3: 133-149
- Z4: 150-165
- Teto absoluto: 165
- Recuperação entre intervalos: abaixo de 135, estável (~15 s)
- Volta calma: abaixo de 122

## Treinos de bike
- Tipo 1, rodagem: aquecimento + 50-65 min Z2 + volta calma
- Tipo 2, intervalo curto: 4x (3 min a 150-163 / recuperação até FC < 135)
- Tipo 3, subida longa: 3x (5-8 min a 145-158; agir ao cruzar 160) + 15-25 min Z2 extra
- Tipo 4, rodagem longa: 75-80 min Z2; banana passa aos 60 min
- Aquecimento e volta calma são passos abertos (terminam no botão).
- Ao passar de 160 na subida: marcha mais leve, baixar cadência (piso 70), ziguezague, aliviar.

## Corrida (5 km em 15/11/2026): ainda não implementada no app
Esteira a 1%, caminhada 5,5 km/h, trote 8,0 km/h. Progressão por semana:
6x(1/2) → 6x(1:30/2) → 5x(2/1:30) → 4x(4/2) → 3x(7/2) → 2x(12/2) → 20-22 min contínuo.
Sinal de alerta: FC mínima das caminhadas subindo bloco a bloco ("escada").

## Regras fixas
- Progressão máxima de 10% por semana no mesmo tipo de treino
- Nunca dois dias duros seguidos
- Cadência: 85-90 rpm no plano, 75-85 na subida, piso 70
- Botão de volta em cada troca de bloco

## Ideias para próximas versões
- Corrida com detecção da "escada" de recuperação
- VFC (RMSSD) matinal a partir dos intervalos RR (já são gravados)
- Exportação FIT; serviço em primeiro plano (app nativo) para rodar com a tela apagada
- GPS
