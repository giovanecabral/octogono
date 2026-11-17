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
| Striker | 2x Bloqueio, 2x Chute alto, 1x Pressão (clinch), 2x Contra-ataque, 2x Cruzado, 2x Jab, 1x Queda | 48.7% | 37.9% | 24.4% |
| Wrestler | 1x Antiqueda, 2x Bloqueio, 1x Chute alto, 2x Pressão (clinch), 2x Contra-ataque, 2x Jab, 2x Queda | 56.6% | 40.4% | 21.0% |
| Grappler | 1x Antiqueda, 2x Bloqueio, 2x Chute alto, 2x Cruzado, 1x Jab, 2x Puxar guarda, 2x Queda | 57.2% | 45.5% | 32.9% |
| Counter | 1x Antiqueda, 2x Bloqueio, 1x Chute alto, 2x Pressão (clinch), 2x Contra-ataque, 1x Cruzado, 2x Jab, 1x Queda | 51.9% | 44.1% | 32.9% |

- Melhor deck do Striker medido de novo (5000 lutas por confronto): 48.3% contra o campo.
- Melhor deck do Wrestler medido de novo (5000 lutas por confronto): 55.3% contra o campo.
- Melhor deck do Grappler medido de novo (5000 lutas por confronto): 55.7% contra o campo.
- Melhor deck do Counter medido de novo (5000 lutas por confronto): 51.1% contra o campo.

Dominância (acima de 60%): nenhuma.

## Decks montados ao acaso no nível 30 (com as cartas da árvore)

40 decks válidos por estilo (com tudo que a build típica do nível 30 libera), cada um contra os 4 decks padrão (também no nível 30) (400 lutas por confronto). Dominância = acima de 60% contra o campo.

| Estilo | Melhor deck aleatório | Contra o campo | Mediana | Pior |
|---|---|---|---|---|
| Striker | 1x Chute alto, 2x Chute no corpo, 1x Pressão (clinch), 1x Contra-ataque, 1x Contragolpe, 2x Cruzado, 1x Direto, 2x Jab, 1x Queda | 63.0% | 47.7% | 33.5% |
| Wrestler | 1x Antiqueda, 1x Bodylock, 1x Pressão (clinch), 1x Contra-queda, 1x Cotovelada por cima, 1x Cruzado, 1x Jab, 1x Peso do ombro, 2x Queda, 1x Queda no contragolpe, 1x Sprawl | 66.3% | 56.3% | 32.7% |
| Grappler | 1x Antiqueda, 1x Chute alto, 1x Contra-ataque, 1x Fuga de quadril, 1x Guarda fechada, 1x Jab, 1x Mata-leão, 2x Puxar guarda, 2x Queda, 1x Raspagem de gancho | 64.4% | 54.1% | 29.4% |
| Counter | 1x Antiqueda, 1x Bloqueio, 1x Pressão (clinch), 2x Contra-ataque, 2x Esquiva, 1x Jab, 1x Leitura de queda, 1x Queda, 1x Saída de lado, 1x Uppercut | 68.9% | 53.7% | 34.9% |

- Melhor deck do Striker medido de novo (5000 lutas por confronto): 61.7% contra o campo.
- Melhor deck do Wrestler medido de novo (5000 lutas por confronto): 66.7% contra o campo.
- Melhor deck do Grappler medido de novo (5000 lutas por confronto): 65.6% contra o campo.
- Melhor deck do Counter medido de novo (5000 lutas por confronto): 67.8% contra o campo.

Dominância (acima de 60%): SIM: Striker 61.7%, Wrestler 66.7%, Grappler 65.6%, Counter 67.8%.

## Nível 30 (build típica de cada estilo, deck padrão)

| | Striker | Wrestler | Grappler | Counter | Agregado |
|---|---|---|---|---|---|
| Striker | 49.8 | 48.2 | 42.0 | 52.6 | **47.6** |
| Wrestler | 51.8 | 50.8 | 48.6 | 55.8 | **52.1** |
| Grappler | 58.0 | 51.4 | 49.9 | 46.0 | **51.8** |
| Counter | 47.4 | 44.2 | 54.0 | 51.6 | **48.5** |

Meta 45% a 55% no agregado: todos dentro.

## Evolução (mesmo estilo, build típica)

Hoje (motor v5): 30 contra 1 entre 62% e 85%; 30 contra 20 acima de 50%.

| Estilo | 10 contra 1 | 30 contra 1 | 30 contra 20 | 30 contra o campo no 1 |
|---|---|---|---|---|
| Striker | 48.3% | 50.6% | 52.0% | 47.6% |
| Wrestler | 49.8% | 50.5% | 51.1% | 51.5% |
| Grappler | 50.2% | 48.9% | 47.9% | 51.8% |
| Counter | 51.6% | 51.2% | 50.9% | 51.0% |

## Quanto vale cada nó (nível 3, sozinho)

Vitória com o nó menos a vitória sem ele, média contra os 4 estilos (1000 lutas por confronto). Meta: de 0,5 a 6,5 pontos. Carta = a que o nó libera, com 3 estrelas; Luta = lutas vencidas por quem jogou a carta pelo menos uma vez (meta 40% a 60% em pé; carta de chão pela relativa à posição, até 10 pontos, decisão 9; só com mais de 200 jogadas).

| Estilo | Nó | Carta | Raridade | Pontos | Jogadas | Escolha | Luta | Relativa |
|---|---|---|---|---|---|---|---|---|
| Striker | Precisão | Direto | rara | +5.8 | 2806 | 29.6% | 55.6% | +7.2 |
| Striker | Combinações | Combinação | rara | +6.9 | 2833 | 30.5% | 57.7% | +9.4 |
| Striker | Contra-ataque de mãos | Contragolpe | épica | +3.6 | 3656 | 52.1% | 53.7% | +5.4 |
| Striker | Eficiência de golpes | Overhand | lendária | +2.9 | 1424 | 13.6% | 49.3% | +1.0 |
| Striker | Chutes baixos | Chute na perna | rara | +6.0 | 2545 | 25.6% | 56.0% | +7.6 |
| Striker | Chutes no corpo | Chute no corpo | rara | +5.7 | 3216 | 37.3% | 54.0% | +5.7 |
| Striker | Controle de distância | Chute frontal | épica | +3.2 | 3490 | 46.0% | 55.7% | +7.4 |
| Striker | Variedade de ataques | Chute rodado | lendária | +5.7 | 2784 | 33.6% | 55.3% | +7.0 |
| Striker | Controle de ritmo | Passo lateral | rara | -3.9 | 2267 | 24.8% | 40.7% | -7.6 |
| Striker | Combinações sob pressão | Joelhada no clinch | rara | +2.9 | 1931 | 19.9% | 52.1% | +3.8 |
| Striker | Manutenção de iniciativa | Cotovelada | épica | +5.3 | 3078 | 33.2% | 53.8% | +5.5 |
| Striker | Eficiência de energia ofensiva | Superman punch | lendária | +7.0 | 2674 | 31.1% | 59.5% | +11.1 |
| Wrestler | Entradas | Single leg | rara | +2.8 | 4485 | 58.5% | 56.8% | +8.5 |
| Wrestler | Correntes de queda | Double leg | rara | +2.9 | 4612 | 69.0% | 57.8% | +9.4 |
| Wrestler | Timing | Queda no contragolpe | épica | +3.9 | 4654 | 67.5% | 58.8% | +10.5 |
| Wrestler | Eficiência de tentativas | Suplex | lendária | +2.0 | 4051 | 48.9% | 57.5% | +9.2 |
| Wrestler | Controle posicional | Peso do ombro | rara | -0.3 | 443 | 63.6% | 73.3% | +9.1 |
| Wrestler | Manutenção de domínio | Cotovelada por cima | rara | +9.6 | 105 | 10.8% | 85.7% | +21.6 |
| Wrestler | Transições | Passagem de joelho | épica | +0.7 | 687 | 63.5% | 70.0% | +5.9 |
| Wrestler | Pressão no solo | Martelada | lendária | +9.5 | 235 | 25.1% | 77.4% | +13.3 |
| Wrestler | Equilíbrio | Sprawl | rara | -2.1 | 2001 | 18.1% | 45.1% | -3.2 |
| Wrestler | Recuperação de posição | Levantada técnica | rara | +0.1 | 200 | 50.9% | 29.4% | -7.2 |
| Wrestler | Defesa de entradas | Contra-queda | épica | -1.7 | 1988 | 17.9% | 44.3% | -4.0 |
| Wrestler | Retorno à distância | Bodylock | lendária | +4.0 | 1416 | 11.9% | 48.0% | -0.3 |
| Grappler | Eficiência de submissão | Kimura | rara | +0.6 | 224 | 90.0% | 92.4% | +28.3 |
| Grappler | Transições | Rasteira | rara | -3.5 | 3346 | 40.3% | 44.6% | -3.7 |
| Grappler | Oportunidades de ataque | Triângulo | épica | +3.4 | 767 | 97.7% | 68.1% | +31.5 |
| Grappler | Especialização técnica | Mata-leão | lendária | +4.8 | 3862 | 45.5% | 60.0% | +11.7 |
| Grappler | Controle | Cem quilos | rara | -0.8 | 334 | 44.5% | 79.5% | +15.4 |
| Grappler | Passagens | Passagem de guarda | rara | +0.6 | 383 | 40.6% | 77.1% | +12.9 |
| Grappler | Retenção | Guarda fechada | épica | +0.6 | 576 | 34.3% | 52.9% | +16.3 |
| Grappler | Recuperação | Raspagem de gancho | lendária | +0.7 | 759 | 86.7% | 61.4% | +24.9 |
| Grappler | Defesa de finalização | Defesa de finalização | rara | -0.9 | 180 | 10.1% | 25.1% | -11.4 |
| Grappler | Saídas | Fuga de quadril | rara | +1.3 | 594 | 28.9% | 40.9% | +4.3 |
| Grappler | Sobrevivência posicional | Recomposição | épica | -0.8 | 181 | 8.6% | 29.6% | -7.0 |
| Grappler | Recuperação de guarda | Berimbolo | lendária | +0.9 | 729 | 85.5% | 63.0% | +26.4 |
| Counter | Identificação de padrões | Esquiva | rara | +4.8 | 3039 | 36.8% | 56.8% | +8.4 |
| Counter | Antecipação | Leitura de queda | rara | +4.0 | 3109 | 38.1% | 53.1% | +4.7 |
| Counter | Resposta a ataques | Contra de esquerda | épica | +4.3 | 2762 | 32.2% | 57.5% | +9.1 |
| Counter | Adaptação | Leitura total | lendária | +2.9 | 2435 | 25.4% | 50.9% | +2.6 |
| Counter | Evasão | Pêndulo | rara | -0.5 | 1354 | 13.1% | 39.9% | -8.4 |
| Counter | Bloqueio | Guarda alta | rara | +0.5 | 2129 | 22.9% | 44.8% | -3.5 |
| Counter | Gestão de distância | Saída de lado | épica | +6.4 | 3081 | 37.4% | 57.6% | +9.2 |
| Counter | Recuperação defensiva | Segundo fôlego | lendária | +2.5 | 2259 | 24.7% | 49.2% | +0.9 |
| Counter | Contra-ataques | Contra no corpo | rara | +4.7 | 3109 | 35.9% | 58.5% | +10.2 |
| Counter | Timing | Cruzado de contra | rara | +2.9 | 3236 | 36.1% | 55.0% | +6.6 |
| Counter | Eficiência | Uppercut | épica | +3.7 | 3403 | 40.6% | 55.0% | +6.6 |
| Counter | Aproveitamento de oportunidades | Golpe de misericórdia | lendária | +5.4 | 2975 | 30.2% | 58.1% | +9.8 |

Nó fora de 0,5 a 6,5: Combinações 6.9, Controle de ritmo -3.9, Eficiência de energia ofensiva 7.0, Controle posicional -0.3, Manutenção de domínio 9.6, Pressão no solo 9.5, Equilíbrio -2.1, Recuperação de posição 0.1, Defesa de entradas -1.7, Transições -3.5, Controle -0.8, Defesa de finalização -0.9, Sobrevivência posicional -0.8, Evasão -0.5. Carta fora de 40% a 60%: Martelada 77.4% (relativa 13.3), Kimura 92.4% (relativa 28.3), Triângulo 68.1% (relativa 31.5), Mata-leão 60.0%, Cem quilos 79.5% (relativa 15.4), Passagem de guarda 77.1% (relativa 12.9), Guarda fechada 52.9% (relativa 16.3), Raspagem de gancho 61.4% (relativa 24.9), Berimbolo 63.0% (relativa 26.4), Pêndulo 39.9%.

## Melhor deck no nível 30 (busca de deck)

Subida de encosta a partir do deck padrão: troca uma carta não fixa por uma carta liberada da árvore, aceita a troca que mais melhora (mais de 1 ponto), triagem com 200 lutas por rival e confirmação com 2000. Volta 1 contra os 4 decks padrão do nível 30; volta 2 contra os padrão mais os melhores da volta 1.

| Estilo | Volta | Melhor deck | Contra os rivais | Passos |
|---|---|---|---|---|
| Striker | 1 | 2x Jab, 2x Cruzado, 1x Chute alto, 1x Contragolpe, 1x Chute no corpo, 1x Chute frontal, 2x Contra-ataque, 1x Pressão (clinch), 1x Queda | 67.6% | 4 |
| Wrestler | 1 | 2x Queda, 1x Pressão (clinch), 1x Antiqueda, 1x Queda no contragolpe, 1x Suplex, 1x Bloqueio, 1x Cotovelada por cima, 2x Jab, 1x Martelada, 1x Peso do ombro | 83.1% | 5 |
| Grappler | 1 | 2x Puxar guarda, 2x Queda, 1x Antiqueda, 1x Kimura, 1x Bloqueio, 1x Triângulo, 2x Jab, 1x Mata-leão, 1x Raspagem de gancho | 73.6% | 4 |
| Counter | 1 | 2x Contra-ataque, 1x Bloqueio, 1x Antiqueda, 1x Golpe de misericórdia, 1x Jab, 1x Esquiva, 1x Leitura de queda, 1x Contra no corpo, 1x Saída de lado, 1x Pressão (clinch), 1x Queda | 70.6% | 7 |
| Striker | 2 | 2x Jab, 2x Cruzado, 1x Chute alto, 1x Chute frontal, 1x Chute no corpo, 1x Contragolpe, 2x Contra-ataque, 1x Pressão (clinch), 1x Queda | 56.1% | 3 |
| Wrestler | 2 | 2x Queda, 1x Pressão (clinch), 1x Antiqueda, 1x Martelada, 1x Cotovelada por cima, 1x Bloqueio, 1x Single leg, 2x Jab, 1x Queda no contragolpe, 1x Double leg | 72.2% | 5 |
| Grappler | 2 | 2x Puxar guarda, 2x Queda, 1x Antiqueda, 1x Mata-leão, 2x Bloqueio, 2x Jab, 1x Kimura, 1x Triângulo | 64.4% | 3 |
| Counter | 2 | 2x Contra-ataque, 1x Bloqueio, 1x Antiqueda, 1x Leitura de queda, 2x Jab, 1x Golpe de misericórdia, 1x Saída de lado, 1x Contra de esquerda, 1x Pressão (clinch), 1x Queda | 59.1% | 4 |

Nível 30, todos com o melhor deck (volta 2), uns contra os outros:

| | Striker | Wrestler | Grappler | Counter | Agregado |
|---|---|---|---|---|---|
| Striker | 50.0 | 56.6 | 25.8 | 54.0 | **45.5** |
| Wrestler | 43.4 | 50.1 | 66.3 | 63.6 | **57.8** |
| Grappler | 74.2 | 33.7 | 50.8 | 53.0 | **53.7** |
| Counter | 46.0 | 36.4 | 47.0 | 49.7 | **43.1** |

Meta 45% a 55% no agregado: FORA: Wrestler 57.8%, Counter 43.1%.

Deck aleatório no nível 30 contra o campo dos melhores decks (volta 2), 40 decks por estilo, 300 lutas por confronto. Portão: até 60% (decisão 89).

- Striker: melhor 44.5%, mediana 35.0%.
- Wrestler: melhor 53.1%, mediana 38.3%.
- Grappler: melhor 45.8%, mediana 36.0%.
- Counter: melhor 41.7%, mediana 28.6%.

Deck aleatório acima de 60% contra o campo de melhores: nenhum.

Melhor deck contra os decks padrão (só informação, nível 30, 2500 lutas por confronto):

- Striker: 67.9% contra o campo.
- Wrestler: 79.8% contra o campo.
- Grappler: 73.6% contra o campo.
- Counter: 67.6% contra o campo.

Dominância (acima de 60%): SIM: Striker 67.9%, Wrestler 79.8%, Grappler 73.6%, Counter 67.6%.

Evolução (mesmo estilo): o nível 30 com o melhor deck contra o nível 1 e o nível 20 com o deck padrão. Meta: 30 contra 1 de 62% a 85%; 30 contra 20 acima de 50%.

| Estilo | 30 contra 1 | 30 contra 20 |
|---|---|---|
| Striker | 67.3% | 66.8% |
| Wrestler | 91.5% | 91.4% |
| Grappler | 61.7% | 60.6% |
| Counter | 66.4% | 66.4% |

Tempo: 10152 s.
