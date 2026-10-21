# Online: diagnóstico das variantes de ação (fase 6 do plano, 2026-10-21)

Fase só de diagnóstico, sem mudança no jogo. Pedido do dono: listar as 30
variantes com o efeito medido de cada uma e propor dois caminhos, (a)
menos variantes com efeito grande e visível e (b) o jogador escolher a mão
antes da luta, com o impacto no balanço e o esforço de cada um.

Tudo medido com o motor da branch `luta-estrategia` (motor v3 com a
vantagem 22 da fase 3), lutadores típicos de nível 1, espelho (os dois
lados com o mesmo perfil), jogo racional (cada lado joga a mistura de
equilíbrio da posição). Scripts na pasta de rascunho da sessão; a mesma
conta da ferramenta (`ferramentas/jxj-balanco.mjs variantes`).

## Como cada número foi medido

- **Vitória na luta:** X recebe aquela variante sempre que usa a família
  naquele papel; o outro lado joga com a mão normal (o rodízio por round).
  Média dos 4 estilos, 800 lutas por estilo (3.200 por variante). 50% =
  igual à média da família. O erro de amostra é de cerca de 0,9 ponto.
- **Efeito por uso:** 9.265 estados de luta de verdade em pé, 957 por cima
  e 1.061 por baixo, tirados de 1.200 lutas. Em cada estado, a mesma troca
  é resolvida uma vez com cada variante da família, com o mesmo sorteio
  (só a variante muda). Os números são a média por uso: chance de
  nocaute, knockdown, queda, finalização; dano causado e recebido (pontos
  de dano do motor); energia gasta (negativo = recupera); pontos do round
  ganhos menos os cedidos; "cansa" = energia que o adversário perde.
- **Quantas vezes cada família é usada por luta** (cada lutador, jogo
  racional): Defesa em pé 2,89; Golpes em pé 1,77; Pressão em pé 1,65;
  Queda em pé 1,41; Defesa por baixo 0,61; Defesa por cima 0,47;
  Finalização por cima 0,22; Levantar 0,16; Raspar 0,11; Avançar por
  cima 0,09; Golpes por cima 0,02; Golpes por baixo 0. A mão muda a cada
  round, então cada variante de uma família de 3 aparece em média uma
  vez a cada 3 rounds de uso dela.

## As 30 variantes

| # | Papel | Família | Variante | O que muda (texto da tela) | Vitória na luta | Efeito medido por uso |
|---|---|---|---|---|---|---|
| 1 | em pé | Golpes | Jab e direto | Acerta mais · menos dano | 47,1% | nocaute 3,9%, knockdown 5,9%, dano 2,57, cansa 0,51 |
| 2 | em pé | Golpes | Cruzado | Mais dano e nocaute · acerta menos | 49,5% | nocaute 6,2%, knockdown 9,2%, dano 2,75, cansa 0,52 |
| 3 | em pé | Golpes | Chute na perna | Cansa e trava a perna · nocauteia menos | 49,7% | nocaute 4,0%, knockdown 7,2%, dano 2,78, cansa 0,74 |
| 4 | em pé | Queda | Double leg | Entra um pouco mais | 47,8% | queda entra 26,5%, gasta 2,73, pontos -0,24 |
| 5 | em pé | Queda | Single leg | Gasta menos · marca menos ponto | 50,2% | queda entra 25,8%, gasta 1,89, pontos -0,88 |
| 6 | em pé | Queda | Queda de quadril | Boa contra quem pressiona | 49,7% | queda entra 21,8% (já cai na meia-guarda), gasta 2,79, pontos -0,79 |
| 7 | em pé | Defesa | Guarda alta | Segura golpes · a queda entra mais | 50,2% | dano recebido 0,88, leva queda 4,1%, recupera 1,18 |
| 8 | em pé | Defesa | Sprawl | Segura a queda · o golpe passa mais | 50,7% | dano recebido 1,05, leva queda 2,3%, recupera 1,17 |
| 9 | em pé | Defesa | Esquiva e contra-ataque | Mais contra-ataque · recupera menos | 48,2% | dano recebido 0,99, dano causado 0,56 (as outras 0,40), recupera 0,61 |
| 10 | em pé | Pressão | Pressionar na grade | Pressão padrão, marca ponto | 49,2% | pontos 0,40, dano 1,46, cansa 1,32, gasta 1,56 |
| 11 | em pé | Pressão | Clinche e joelhadas | Mais dano · gasta mais energia | 50,8% | pontos 1,12, dano 2,26, cansa 1,32, gasta 2,00 |
| 12 | em pé | Pressão | Cortar o octógono | Cansa quem defende · golpe fraco | 48,8% | pontos -0,34, dano 0,73, cansa 1,64, gasta 1,56 |
| 13 | por cima | Golpes | Socos por cima | Ground and pound padrão | 49,0% | dano 1,72, nocaute 1,4% |
| 14 | por cima | Golpes | Cotoveladas | Mais dano e nocaute · acerta menos | 51,6% | dano 1,83, nocaute 1,4% |
| 15 | por cima | Golpes | Marteladas | Acerta mais · menos dano | 49,1% | dano 1,61, nocaute 0,9% |
| 16 | por cima | Finalização | Kimura | Vale igual em qualquer posição | 50,1% | finaliza 23,9%, encaixa 31,9% |
| 17 | por cima | Finalização | Mata-leão | Forte montado · fraca na guarda | 51,7% | finaliza 20,2%, encaixa 33,0% |
| 18 | por cima | Finalização | Triângulo de braço | Melhor na meia-guarda | 48,8% | finaliza 23,8%, encaixa 31,5% |
| 19 | por cima | Defesa | Segurar a posição | Controle sem gastar energia | 48,6% | pontos 0,96, cansa -0,17 (ele recupera) |
| 20 | por cima | Defesa | Pressão de peso | Cansa quem está por baixo | 50,3% | pontos 0,46, cansa 0,21 |
| 21 | por cima | Avançar | Passar a guarda | Melhora a posição um degrau | 50,1% | posição +0,70 degrau |
| 22 | por cima | Avançar | Ir pra montada | Pula pra montada · entra menos | 49,9% | posição +0,99 degrau |
| 23 | por baixo | Golpes | Golpes por baixo | Pouco dano · atrapalha por cima | 49,1% | dano 0,30, pontos -0,81 |
| 24 | por baixo | Golpes | Cotoveladas por baixo | Mais dano · acerta menos | 48,6% | dano 0,40, pontos -0,70 |
| 25 | por baixo | Raspar | Raspagem | Inverte a posição mais fácil | 50,7% | raspa 12,5%, finaliza 0% |
| 26 | por baixo | Raspar | Triângulo | Raspa menos · pode finalizar | 49,0% | raspa 7,1%, finaliza 1,7%, encaixa 8,5% |
| 27 | por baixo | Defesa | Fechar a guarda | Segura finalização · sem gastar | 48,9% | pontos -1,57, dano recebido 0,02 |
| 28 | por baixo | Defesa | Amarrar os braços | Trava o ground and pound dele | 50,8% | pontos -1,57, dano recebido 0,01 |
| 29 | por baixo | Levantar | Levantar | Tenta voltar a ficar em pé | 49,9% | levanta 60,9%, gasta 0,64 |
| 30 | por baixo | Levantar | Levantar pela grade | Levanta mais · gasta um pouco mais | 49,4% | levanta 67,1%, gasta 0,92 |

Vitória na luta: de 47,1% a 51,7%, média 49,6%, desvio de 1,0 ponto
(perto do próprio erro de amostra). Na suíte `jxjmotor`, com duas
amostras, todas ficam entre 48,2% e 52,1%.

## O que os números dizem

1. **Equilibradas e quase invisíveis.** Nenhuma variante muda a vitória
   mais que 3 pontos, e a maioria fica dentro do erro de amostra. Ter a
   "melhor" na mão o tempo todo vale menos de 2 pontos.
2. **Os efeitos por uso existem, mas cada variante aparece pouco.** O
   maior é o do cruzado: nocaute em 6,2% dos usos contra 3,9% do jab
   (+59%) e knockdown 9,2% contra 5,9%. Só que Golpes em pé sai 1,8 vez
   por luta, e o cruzado só está na mão um round em cada três: na luta
   inteira, ele soma cerca de 1 ponto de chance de nocaute. Ninguém
   percebe isso jogando.
3. **Efeitos que dá pra ver no lance:** joelhadas (dano 2,26 contra 1,46
   da grade, pontos 1,12 contra 0,40), chute na perna e cortar o
   octógono (cansam 45% e 24% mais), single leg (gasta 1,89 contra 2,73),
   quadril (entra menos, mas já cai na meia-guarda), esquiva (contra-ataca
   40% mais, recupera metade), montada (+0,99 degrau contra +0,70),
   levantar pela grade (67% contra 61%), triângulo por baixo (a única
   finalização por baixo).
4. **Variantes que não mudam nada na prática:**
   - Amarrar os braços e fechar a guarda dão os mesmos números em todas
     as medidas. O ground and pound que o amarrar segura quase não
     acontece: o jogo racional golpeia por cima 0,02 vez por luta.
   - As 3 de Golpes por cima (diferença de 0,2 de dano por uso) e as 2 de
     Golpes por baixo (0,1), numa família que quase não se usa.
   - Double leg contra single leg: a queda entra 26,5% contra 25,8%. O
     que muda é o custo e o ponto, não a queda.
5. **No chão a escolha é rara.** As 18 variantes do chão somam 1,7 uso
   por luta por lutador; as 12 de pé, 7,7. Variante nova no chão quase
   não aparece pro jogador.
6. O jogador humano usa as famílias diferente do jogo racional (golpeia
   mais por cima, por exemplo). Os números de uso são do equilíbrio; o
   efeito por uso vale pra qualquer jogo.

## (a) Menos variantes, efeito grande e visível

**O que seria:** escolha só em pé, 2 variantes por família (8 no total),
com efeito 2 a 3 vezes maior e legível no lance. No chão, cada família
fica com uma ação só (a padrão de hoje: socos por cima, kimura, segurar,
passar, golpes por baixo, raspagem, fechar a guarda, levantar). De 30
pra 16 ações, e as 8 de pé com troca de verdade.

**Protótipo medido** (efeitos aumentados sem calibrar; mesma medição):

| Par | Vitória na luta | Efeito por uso |
|---|---|---|
| Jab / Cruzado | 45,0% / 51,7% | nocaute 2,5% / 7,4% (3 vezes), knockdown 4,4% / 10,3% |
| Double leg / Quadril | 47,9% / 49,6% | queda 29,0% / 20,6% (quadril cai na meia-guarda) |
| Guarda alta / Sprawl | 48,9% / 51,0% | dano recebido 1,10 / 1,36 |
| Grade / Joelhadas | 49,9% / 50,1% | dano 1,52 / 3,27, pontos 0,35 / 1,94 |

- **O efeito fica visível** (o cruzado nocauteia 3 vezes mais por uso),
  mas o primeiro protótipo saiu desequilibrado: o cruzado vale 6,7 pontos
  a mais que o jab. Efeito grande pede calibrar cada par até os dois
  ficarem na faixa (hoje 48% a 52,5%), e com efeito grande essa faixa é
  mais difícil de manter em todos os estilos (o jab vai de 40,8% a 48,4%
  conforme o estilo).
- **Impacto no balanço:** os métodos mudam (mais nocaute com o cruzado
  forte), então é preciso medir de novo a matriz de estilos, os métodos,
  as variantes, o nível 30 contra o 1, as builds e os bots (`PESOS_VALOR`
  retreinado, `FORCA_BOT` medida de novo). Número de combate novo:
  `VERSAO_MOTOR` 4 e `VERSAO_BALANCEAMENTO` 3 (respec grátis e fila só
  com a mesma versão; o SQL é só o número, como o `supabase_jxj_motor3.sql`).
- **Esforço: médio, de 1 a 2 dias com a medição.** Tabela `VARIANTES`
  nova e versionada (luta antiga refeita pela semente precisa da tabela
  antiga), testes (`jxjmotor` variantes, `jxjbot`, misturas), textos das
  ações na tela, a ferramenta de balanço. Sem tabela nova no banco.

## (b) O jogador escolhe a mão antes da luta

**Medido com as variantes de hoje** (a mão fixa a luta inteira contra o
rodízio do outro lado, 1.000 lutas por estilo):

| Mão fixa | Vitória |
|---|---|
| a melhor de cada família (a mesma pra todos) | 50,9% |
| a melhor de cada família pra cada estilo | 52,2% |
| a pior de cada família | 45,7% |

- **Escolher a mão vale de 1 a 2 pontos; errar custa 4.** Com as
  variantes de hoje, a escolha é pouca estratégia e uma armadilha pra
  quem não conhece os números.
- Junto com (a), a escolha passa a valer mais, mas aí qualquer par mal
  calibrado vira escolha obrigatória (todo mundo leva o cruzado) e a
  variedade some. Precisa de (a) calibrado antes.
- **Informação:** se o adversário vê a mão, vira leitura antes da luta
  (bom pra estratégia, mais um texto na tela); se não vê, vira palpite.
  A mão teria que entrar no compromisso sha256 do começo, pra auditoria.
- **Esforço: grande, de 3 a 5 dias.** Tela de escolha (12 famílias, ou 4
  com (a)), servidor validando e gravando a mão na luta (migração: coluna
  em `jxj_lutas` ou dentro de `perfis`), motor recebendo a mão em vez de
  tirar da semente, bot escolhendo a mão dele, compromisso e auditoria,
  testes, calibração e as duas suítes de bots.

## Recomendação

1. **(a) primeiro, só em pé.** É onde a luta acontece (7,7 usos por luta
   contra 1,7 no chão) e onde o efeito pode aparecer no lance. Calibrar
   os 4 pares com a mesma bateria das fases anteriores, com a meta de
   cada par entre 48% e 52,5% em todo estilo e o efeito por uso pelo
   menos 2 vezes maior que hoje.
2. **(b) não agora.** Com as variantes de hoje não muda nada; com (a)
   depende da calibração. Se o dono quiser escolha depois de (a), o
   caminho mais barato é a escolha de uma variante só (a "assinatura" do
   lutador numa família de pé), medida como a mão fixa acima.
3. Cortar já, sem esperar (a): Amarrar os braços (igual à guarda fechada
   em todas as medidas). Remover variante também sobe `VERSAO_MOTOR`.
