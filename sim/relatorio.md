# Simulação do combate v2

10000 lutas por confronto, 9 trabalhadores. Jogador atento contra jogador atento, decks padrão, nível 1, peso-médio (menos onde diz).

## Estilo contra estilo

Vitória da linha contra a coluna (sem os empates).

| | Striker | Wrestler | Grappler | Counter | Agregado |
|---|---|---|---|---|---|
| Striker | 49.5 | 50.3 | 41.8 | 53.2 | **48.4** |
| Wrestler | 49.7 | 50.4 | 47.0 | 54.9 | **50.5** |
| Grappler | 58.2 | 53.0 | 50.3 | 44.7 | **51.9** |
| Counter | 46.8 | 45.1 | 55.3 | 50.1 | **49.1** |

Meta 45% a 55% no agregado: todos dentro. Confronto mais torto: Grappler contra Striker, 58.2%.

## Duração e como acaba

| Trocas por luta | Nocaute | Nocaute técnico | Finalização | Decisão | Empate |
|---|---|---|---|---|---|
| 8.3 | 26.7% | 1.1% | 2.0% | 69.3% | 0.9% |

Referência de hoje (motor v5): 7,8 trocas; nocaute (KO + TKO) 21,7%, finalização 7,5%, decisão 68,2%. Aqui, nocaute somado: 27.8%.

Trocas com velocidade empatada: 33.8%. Interrupções por troca: 0.28. Anulações por troca: 0.17. Trocas no encaixe: 0.0%.

## Cartas

Escolha = vezes jogada / vezes na mão. Troca = trocas vencidas quando jogada (sem as empatadas). Luta = lutas vencidas por quem jogou a carta pelo menos uma vez. Espelho = o mesmo, só nas lutas de deck igual contra deck igual. Relativa = Luta menos a média das cartas da mesma posição (em pé, por cima, por baixo): quem joga carta de baixo já está por baixo, e isso pesa na luta seja qual for a carta (decisão 9).

| Carta | Posição | Jogadas | Escolha | Troca | Luta | Espelho | Relativa |
|---|---|---|---|---|---|---|---|
| Jab | em pé | 341576 | 51.9% | 68.6% | 49.7% | 48.9% | +1.5 |
| Contra-ataque | em pé | 237772 | 39.2% | 56.3% | 49.3% | 49.8% | +1.1 |
| Bloqueio | em pé | 214692 | 26.2% | 58.8% | 47.2% | 46.6% | -1.0 |
| Queda | em pé | 207960 | 30.8% | 45.1% | 50.1% | 49.5% | +1.9 |
| Cruzado | em pé | 146582 | 25.9% | 24.8% | 45.6% | 44.1% | -2.6 |
| Antiqueda | em pé | 96292 | 16.6% | 33.6% | 45.0% | 46.9% | -3.2 |
| Pressão (clinch) | em pé | 65016 | 9.7% | 32.3% | 44.5% | 44.0% | -3.7 |
| Chute alto | em pé | 64435 | 18.9% | 33.1% | 51.3% | 51.0% | +3.1 |
| Puxar guarda | em pé | 53773 | 23.9% | 0.0% | 48.7% | 45.1% | +0.5 |
| Segurar | por cima | 52674 | 53.8% | 63.5% | 62.7% | 75.4% | -2.3 |
| Ground and pound | por cima | 28101 | 38.0% | 9.5% | 63.6% | 71.8% | -1.4 |
| Avançar | por cima | 25820 | 42.2% | 52.6% | 67.1% | 72.9% | +2.1 |
| Finalização | por cima | 7615 | 31.2% | 33.4% | 74.1% | 70.0% | +9.1 |
| Golpes por baixo | por baixo | 47577 | 75.0% | 66.1% | 38.9% | 27.3% | +3.3 |
| Guarda | por baixo | 34906 | 34.2% | 33.3% | 32.0% | 21.5% | -3.7 |
| Levantar | por baixo | 19002 | 31.4% | 48.7% | 30.1% | 30.1% | -5.5 |
| Raspar | por baixo | 12725 | 30.3% | 72.0% | 44.5% | 21.7% | +8.9 |

Meta 40% a 60% (luta vencida quando jogada): FORA: Segurar 62.7%, Ground and pound 63.6%, Avançar 67.1%, Finalização 74.1%, Golpes por baixo 38.9%, Guarda 32.0%, Levantar 30.1%. Relativa à posição, até 10 pontos: todas dentro.

## Estilo por categoria de peso

Agregado de cada estilo contra os outros três, na mesma categoria (2500 lutas por confronto).

| Categoria | Striker | Wrestler | Grappler | Counter |
|---|---|---|---|---|
| Peso-leve | 47.7 | 50.6 | 51.9 | 49.7 |
| Meio-médio | 48.4 | 50.0 | 52.3 | 49.3 |
| Peso-médio | 47.8 | 51.0 | 51.0 | 50.2 |
| Peso-pesado | 46.4 | 53.7 | 50.9 | 49.0 |

## Peso contra peso (a fila junta pesos diferentes)

O mais pesado contra o mais leve, mesmo estilo, média dos 4 estilos (1250 lutas por estilo).

| Mais pesado | Mais leve | Vitória do mais pesado |
|---|---|---|
| Meio-médio | Peso-leve | 49.8% |
| Peso-médio | Peso-leve | 50.3% |
| Peso-pesado | Peso-leve | 51.6% |
| Peso-médio | Meio-médio | 50.5% |
| Peso-pesado | Meio-médio | 50.9% |
| Peso-pesado | Peso-médio | 50.5% |

## Habilidade (quanto a escolha decide)

Espelho de cada estilo. Meta (decisão 10): o atento vence o jogador ao acaso em 70% ou mais.

| Estilo | Atento x ao acaso | Lê metade das trocas x atento | Lê todas x atento |
|---|---|---|---|
| Striker | 71.9% | 85.3% | 99.7% |
| Wrestler | 72.8% | 84.2% | 98.9% |
| Grappler | 73.1% | 85.4% | 99.6% |
| Counter | 74.6% | 86.1% | 99.9% |

## Decks montados ao acaso (caça a combo quebrado)

40 decks válidos por estilo, cada um contra os 4 decks padrão (400 lutas por confronto). Dominância = acima de 60% contra o campo.

| Estilo | Melhor deck aleatório | Contra o campo | Mediana | Pior |
|---|---|---|---|---|
| Striker | 1x Bloqueio, 2x Chute alto, 1x Pressão (clinch), 2x Contra-ataque, 2x Cruzado, 2x Jab, 2x Queda | 48.8% | 37.4% | 25.1% |
| Wrestler | 1x Antiqueda, 2x Bloqueio, 1x Chute alto, 2x Pressão (clinch), 2x Contra-ataque, 2x Jab, 2x Queda | 56.7% | 39.2% | 23.0% |
| Grappler | 1x Antiqueda, 2x Bloqueio, 1x Chute alto, 1x Pressão (clinch), 1x Contra-ataque, 2x Jab, 2x Puxar guarda, 2x Queda | 57.3% | 45.0% | 33.3% |
| Counter | 2x Antiqueda, 2x Bloqueio, 1x Chute alto, 1x Pressão (clinch), 2x Contra-ataque, 2x Jab, 2x Queda | 50.3% | 44.8% | 33.4% |

- Melhor deck do Striker medido de novo (5000 lutas por confronto): 48.9% contra o campo.
- Melhor deck do Wrestler medido de novo (5000 lutas por confronto): 54.5% contra o campo.
- Melhor deck do Grappler medido de novo (5000 lutas por confronto): 56.1% contra o campo.
- Melhor deck do Counter medido de novo (5000 lutas por confronto): 47.2% contra o campo.

Dominância (acima de 60%): nenhuma.

## Nível 30 (build típica de cada estilo)

Deck padrão:

| | Striker | Wrestler | Grappler | Counter | Agregado |
|---|---|---|---|---|---|
| Striker | 49.9 | 62.7 | 41.3 | 50.4 | **51.5** |
| Wrestler | 37.3 | 49.5 | 61.9 | 42.0 | **47.1** |
| Grappler | 58.7 | 38.1 | 50.3 | 57.6 | **51.5** |
| Counter | 49.6 | 58.0 | 42.4 | 50.8 | **50.0** |

Com a carta nova no deck (no lugar de: Striker, Contra-ataque; Wrestler, Cruzado; Grappler, Pressão (clinch); Counter, Chute alto):

| | Striker | Wrestler | Grappler | Counter | Agregado |
|---|---|---|---|---|---|
| Striker | 51.4 | 62.9 | 37.5 | 43.5 | **48.0** |
| Wrestler | 37.1 | 50.0 | 57.0 | 44.2 | **46.1** |
| Grappler | 62.5 | 43.0 | 49.8 | 62.7 | **56.1** |
| Counter | 56.5 | 55.8 | 37.3 | 49.5 | **49.8** |

## Evolução (mesmo estilo, build típica)

Hoje (motor v5): 30 contra 1 entre 62% e 85%; 30 contra 20 acima de 50%.

| Estilo | 10 contra 1 | 30 contra 1 | 30 contra 20 | 30 contra o campo no 1 |
|---|---|---|---|---|
| Striker | 48.0% | 62.6% | 53.8% | 68.5% |
| Wrestler | 52.8% | 63.6% | 55.2% | 69.8% |
| Grappler | 50.6% | 60.1% | 53.8% | 70.5% |
| Counter | 59.2% | 71.8% | 55.2% | 69.5% |

## Quanto vale cada nó (nível 3, sozinho)

Vitória com o nó menos a vitória sem ele, média contra os 4 estilos (1000 lutas por confronto). Hoje (motor v5): de 0,5 a 6,5 pontos.

| Estilo | Nó | No combate novo | Pontos |
|---|---|---|---|
| Striker | Precisão | Jab com +0,1 de dano por nível. | +3.3 |
| Striker | Combinações | Libera a Combinação; +0,25 de dano nela por nível depois do 1. | +1.8 |
| Striker | Contra-ataque de mãos | Contra-ataque com +0,1 de dano por nível. | +3.2 |
| Striker | Eficiência de golpes | O Cruzado que acerta dá 0,5 ponto a mais por nível. | +1.4 |
| Striker | Chutes baixos | O Chute alto que acerta dá 0,75 ponto a mais por nível. | +0.6 |
| Striker | Chutes no corpo | No nível 2, o Chute alto custa 1 a menos. | +0.9 |
| Striker | Controle de distância | No nível 2, o Bloqueio também anula a Queda. | +3.3 |
| Striker | Variedade de ataques | Golpe em pé que acerta dá 0,25 ponto a mais por nível. | +4.7 |
| Striker | Controle de ritmo | O Bloqueio que anula dá 0,5 ponto a mais por nível. | +1.0 |
| Striker | Combinações sob pressão | No nível 2, o clinch fica 1 mais rápido. | +5.6 |
| Striker | Manutenção de iniciativa | O Jab que interrompe dá 0,5 ponto a mais por nível. | +4.7 |
| Striker | Eficiência de energia ofensiva | O clinch que acerta dá 1 ponto a mais por nível. | +1.6 |
| Wrestler | Entradas | A Queda que acerta dá 0,5 ponto a mais por nível. | +2.9 |
| Wrestler | Correntes de queda | Libera o Double leg; no nível 2, ele custa 1 a menos. | +3.2 |
| Wrestler | Timing | Queda com +0,5 de dano por nível. | +3.5 |
| Wrestler | Eficiência de tentativas | Queda com +0,25 de dano por nível. | +0.7 |
| Wrestler | Controle posicional | Por cima, a carta que resolve dá 0,75 ponto a mais por nível. | +1.2 |
| Wrestler | Manutenção de domínio | A pegada por cima (Segurar) também anula a raspagem e dá 0,5 ponto por nível quando anula. | +0.7 |
| Wrestler | Transições | No nível 2, a Queda que acerta já passa pra meia-guarda. | +0.8 |
| Wrestler | Pressão no solo | Por cima, a carta que resolve dá 0,75 ponto a mais por nível. | +1.2 |
| Wrestler | Equilíbrio | A Antiqueda que anula dá 0,5 ponto a mais por nível. | +2.1 |
| Wrestler | Recuperação de posição | Vida +1 por nível. | +4.4 |
| Wrestler | Defesa de entradas | A Antiqueda também anula a pressão (clinch, puxada de guarda, rasteira) e dá 0,5 ponto por nível quando anula. | +1.4 |
| Wrestler | Retorno à distância | O Bloqueio que anula dá 0,5 ponto a mais por nível. | +3.0 |
| Grappler | Eficiência de submissão | No nível 3, a Finalização fica 1 mais rápida. A Queda que acerta dá 0,5 ponto a mais por nível. | +6.1 |
| Grappler | Transições | Libera a Rasteira. | +3.7 |
| Grappler | Oportunidades de ataque | A puxada de guarda que acerta dá 0,25 ponto por nível. | +3.1 |
| Grappler | Especialização técnica | O Raspar que acerta dá 1,5 ponto a mais por nível. | +2.2 |
| Grappler | Controle | Por cima, a carta que resolve dá 0,5 ponto a mais por nível. | +1.6 |
| Grappler | Passagens | O Avançar que acerta dá 1 ponto a mais por nível. | +1.5 |
| Grappler | Retenção | A Guarda também anula o Avançar e dá 1 ponto por nível quando anula. | +2.1 |
| Grappler | Recuperação | Golpes por baixo com +0,4 de dano por nível. | +3.7 |
| Grappler | Defesa de finalização | Golpes por baixo com +0,4 de dano por nível. | +3.7 |
| Grappler | Saídas | O Levantar que acerta dá 1,5 ponto a mais por nível. | +2.9 |
| Grappler | Sobrevivência posicional | Por baixo, a carta que resolve dá 0,25 ponto a mais por nível. | +5.1 |
| Grappler | Recuperação de guarda | A Antiqueda que anula dá 0,75 ponto a mais por nível. | +3.0 |
| Counter | Identificação de padrões | Libera a Esquiva. | +3.6 |
| Counter | Antecipação | O Bloqueio também anula o clinch e dá 0,5 ponto por nível quando anula. | +1.4 |
| Counter | Resposta a ataques | Contra-ataque com +0,15 de dano por nível. | +3.8 |
| Counter | Adaptação | Vida +0,75 por nível. | +1.8 |
| Counter | Evasão | O Jab que acerta dá 0,15 ponto a mais por nível. | +2.8 |
| Counter | Bloqueio | O Bloqueio que anula dá 0,5 ponto a mais por nível. | +2.2 |
| Counter | Gestão de distância | No nível 2, o Bloqueio também anula a Queda. | +4.0 |
| Counter | Recuperação defensiva | Vida +1 por nível. | +2.1 |
| Counter | Contra-ataques | O Contra-ataque que acerta dá 0,5 ponto a mais por nível. | +4.3 |
| Counter | Timing | O Cruzado que acerta dá 0,5 ponto a mais por nível. | +2.0 |
| Counter | Eficiência | Cruzado com +0,1 de dano por nível. | +1.6 |
| Counter | Aproveitamento de oportunidades | O Jab que interrompe dá 0,25 ponto a mais por nível. | +4.9 |

Fora de 0,5 a 6,5: nenhum.

Tempo: 2025 s.
