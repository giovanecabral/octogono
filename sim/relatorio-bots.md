# Simulação do combate v2

10000 lutas por confronto, 9 trabalhadores. Jogador atento contra jogador atento, decks padrão, nível 1, peso-médio (menos onde diz).

## Bots do combate v2 (Fase 5)

Jogador modelo (atenta, mostra a categoria da carta e, 30% das vezes, uma isca) contra o bot do servidor; 200 lutas por casa (estilo do jogador x estilo do bot x nível 1, 10 e 30).
Força = o rating com que o bot entra no Glicko (o jogador modelo vale 1500). Na tabela, a vitória do jogador e a força medida; entre parênteses, FORCA_BOT2.

| Jeito | Habilidade 0 | Habilidade 0,5 | Habilidade 1 |
|---|---|---|---|
| o Provocador | 68.8%, 1363 (1373) | 61.8%, 1416 (1421) | 60.1%, 1429 (1417) |
| o Paciente | 73.0%, 1327 (1322) | 61.2%, 1421 (1422) | 55.4%, 1462 (1458) |
| o Observador | 66.4%, 1381 (1372) | 55.4%, 1462 (1458) | 50.0%, 1500 (1502) |
| o Inquieto | 73.6%, 1322 (1329) | 64.7%, 1394 (1399) | 60.9%, 1423 (1421) |

Por nível (habilidade 0,5, força):

| Jeito | Nível 1 | Nível 10 | Nível 30 |
|---|---|---|---|
| o Provocador | 1400 | 1401 | 1447 |
| o Paciente | 1415 | 1411 | 1437 |
| o Observador | 1468 | 1461 | 1459 |
| o Inquieto | 1401 | 1392 | 1390 |

FORCA_BOT2 medida: {"agressivo":[1363,1416,1429],"defensivo":[1327,1421,1462],"leitor":[1381,1462,1500],"caotico":[1322,1394,1423]}

Tempo: 362 s.
