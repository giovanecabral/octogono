# Simulação do combate v2

10000 lutas por confronto, 9 trabalhadores. Jogador atento contra jogador atento, decks padrão, nível 1, peso-médio (menos onde diz).

## Bots do combate v2 (Fase 5)

Jogador modelo (atenta, mostra a categoria da carta e, 30% das vezes, uma isca) contra o bot do servidor; 200 lutas por casa (estilo do jogador x estilo do bot x nível 1, 10 e 30).
Força = o rating com que o bot entra no Glicko (o jogador modelo vale 1500). Na tabela, a vitória do jogador e a força medida; entre parênteses, FORCA_BOT2.

| Jeito | Habilidade 0 | Habilidade 0,5 | Habilidade 1 |
|---|---|---|---|
| o Provocador | 67.6%, 1373 (1400) | 61.2%, 1421 (1420) | 61.7%, 1417 (1440) |
| o Paciente | 73.5%, 1322 (1400) | 61.1%, 1422 (1420) | 56.1%, 1458 (1440) |
| o Observador | 67.6%, 1372 (1400) | 56.1%, 1458 (1420) | 49.7%, 1502 (1440) |
| o Inquieto | 72.8%, 1329 (1400) | 64.2%, 1399 (1420) | 61.2%, 1421 (1440) |

Por nível (habilidade 0,5, força):

| Jeito | Nível 1 | Nível 10 | Nível 30 |
|---|---|---|---|
| o Provocador | 1413 | 1407 | 1442 |
| o Paciente | 1406 | 1415 | 1443 |
| o Observador | 1460 | 1458 | 1455 |
| o Inquieto | 1409 | 1396 | 1391 |

FORCA_BOT2 medida: {"agressivo":[1373,1421,1417],"defensivo":[1322,1422,1458],"leitor":[1372,1458,1502],"caotico":[1329,1399,1421]}

Tempo: 424 s.
