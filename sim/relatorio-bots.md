# Simulação do combate v2

10000 lutas por confronto, 9 trabalhadores. Jogador atento contra jogador atento, decks padrão, nível 1, peso-médio (menos onde diz).

## Bots do combate v2 (Fase 5)

Jogador modelo (atenta, mostra a categoria da carta e, 30% das vezes, uma isca) contra o bot do servidor; 200 lutas por casa (estilo do jogador x estilo do bot x nível 1, 10 e 30).
Força = o rating com que o bot entra no Glicko (o jogador modelo vale 1500). Na tabela, a vitória do jogador e a força medida; entre parênteses, FORCA_BOT2.

| Jeito | Habilidade 0 | Habilidade 0,5 | Habilidade 1 |
|---|---|---|---|
| o Provocador | 63.5%, 1403 (1363) | 60.5%, 1426 (1416) | 60.6%, 1425 (1429) |
| o Paciente | 59.0%, 1437 (1327) | 46.5%, 1524 (1421) | 42.1%, 1555 (1462) |
| o Observador | 50.4%, 1497 (1381) | 41.2%, 1562 (1462) | 39.2%, 1576 (1500) |
| o Inquieto | 59.2%, 1436 (1322) | 50.5%, 1497 (1394) | 46.8%, 1522 (1423) |

Por nível (habilidade 0,5, força):

| Jeito | Nível 1 | Nível 10 | Nível 30 |
|---|---|---|---|
| o Provocador | 1399 | 1411 | 1466 |
| o Paciente | 1485 | 1517 | 1572 |
| o Observador | 1515 | 1560 | 1614 |
| o Inquieto | 1455 | 1496 | 1539 |

FORCA_BOT2 medida: {"agressivo":[1403,1426,1425],"defensivo":[1437,1524,1555],"leitor":[1497,1562,1576],"caotico":[1436,1497,1522]}

Tempo: 325 s.
