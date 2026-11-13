# Combate v2 do Online: decisões

Decisões tomadas fora da spec (a tarefa de 2026-11-12). As de 1 a 12 foram
propostas na Fase 0 e aprovadas pelo dono ("ok"); as seguintes foram
tomadas na Fase 1 pela regra da tarefa (a opção mais simples, registrada
aqui).

## Aprovadas na Fase 0

1. **Sem sorteio na resolução.** A semente só embaralha o deck (a compra
   de cada round). O código da sorte continua: é o sha256 da semente, e
   refazer a luta pela semente dá a mesma compra. Nocaute, knockdown e
   finalização são regras fixas, não chance.
2. **"Acertar" sem sorte.** Uma carta acerta quando resolve: não foi
   anulada por uma reação, não foi interrompida por um ataque mais rápido
   e a posição ainda serve pra ela. Reação ("contra X") anula a carta X
   em qualquer velocidade: o Bloqueio anula até o Jab. O Contra-ataque
   (3) continua perdendo pro Jab (5).
3. **Vida e nocaute.** Vida = 30 + (queixo − 50) × 0,4. Golpe em pé com
   dano 4 ou mais derruba (knockdown) e deixa grogue na troca seguinte.
   Nocaute: vida zero, ou golpe de dano 3 ou mais em quem está grogue.
   Terceiro knockdown: nocaute técnico. No chão (ground and pound) ou no
   clinch, vida zero é nocaute técnico. Finalização: a Finalização que
   resolve na montada (ou com ele grogue) finaliza; abaixo disso, encaixa.
4. **Atributos.** Cada carta tem um duelo de atributos (o meu e o dele):
   golpe contra defesa nos golpes e no clinch, queda contra defesa de queda
   na Queda, defesa de queda contra queda na Antiqueda, chão contra defesa
   no chão no chão. Diferença de 15 ou mais: +1 de velocidade (−15: −1). O
   dano escala pela diferença: × (1 + diferença / 100). Carta de dano base
   3 ou mais usa o poder: × (1 + (poder − 50) / 100). Cardio dá a energia
   máxima (10 + (cardio − 50) / 10), queixo dá a vida. O ajuste de peso
   entra porque já mexe nesses atributos.
5. **Compra.** Todo round o deck inteiro (12) é embaralhado pela semente e
   o lutador compra 5. A passiva fica fora das 12.
6. **Mão escondida, deck público.** Substitui a "mão à vista" de
   2026-10-27.
7. **Deck no `build`.** O deck mora no jsonb que já existe (sem SQL). Fica
   pra Fase 3.
8. **Flag `combat_v2`.** Chave em `jxj_config`, desligada por padrão no
   código; a versão de combate fica na luta (`estado.cv`) e a fila só junta
   lutadores da mesma versão. Fase 3.
9. **Win rate por carta** sai de três jeitos no relatório: luta vencida por
   quem jogou (o que a spec pede), troca vencida com a carta e luta com
   decks espelhados.
10. **Meta de habilidade** no relatório: jogador atento contra jogador ao
    acaso (meta 70% ou mais) e quem lê metade das trocas.
11. **Simulação em `sim/`**, em Node, importando o mesmo módulo do motor;
    `sim/` fora do deploy (`.vercelignore`).
12. **Duração de referência:** 7,8 trocas por luta, nocaute 21,7%,
    finalização 7,5%, decisão 68,2% (motor v5, 2026-11-10).

## Tomadas na Fase 1

13. **No chão, a carta da mão joga pela categoria.** O deck tem só cartas
    em pé. Por cima ou por baixo, a carta joga como a do chão da mesma
    categoria (golpe vira Ground and pound por cima e Golpes por baixo por
    baixo; queda vira Finalização e Raspar; defesa vira Segurar e Guarda;
    pressão vira Avançar e Levantar). Sem isso, a mão comprada em pé ficaria
    sem carta útil no chão. A postura mostra a categoria, então funciona
    igual em pé e no chão.
14. **Categorias com as chaves de antes:** `golpes`, `queda`, `defesa`,
    `pressao` (a spec escreve golpe/queda/defesa/pressão).
15. **O que é ataque (pra interromper):** carta com dano maior que zero.
    A Queda tem dano 2, então é ataque. Avançar, Raspar, Levantar e
    Finalização não têm dano: não interrompem, mas mudam a posição, e a
    carta mais lenta que não serve mais na posição nova falha (Levantar
    antes da Finalização: a finalização falha).
16. **Resistente olha o dano base da carta** (o número impresso nela), não
    o dano depois da passiva e dos atributos.
17. **Empate com as duas mudando a posição:** as duas mudanças se anulam
    (travaram); o dano das duas entra. Nocaute dos dois na mesma troca:
    vence quem causou mais dano; igual, empate.
18. **Sem energia pra pagar:** a carta joga exausta (−2 de velocidade,
    metade do dano, sem efeitos) e a energia vai a zero. Cansado (2 ou
    menos no começo da troca): −1 de velocidade.
19. **Golpe (pra derrubar, nocautear e o +1 no grogue):** carta com dano
    que não é Queda. Contra-ataque e clinch contam.
20. **Finalização encaixada sem sorte:** o 2x2 de antes vira regra.
    Quem encaixou: apertar (Queda, a carta da finalização) ou emendar
    (Pressão); outra carta solta o encaixe e a troca segue normal. Quem
    está preso: defender (Defesa) ou sair na força (outra). Defender ganha
    de apertar; emendar ganha de defender (finaliza); sair na força ganha
    de emendar (escapa e levanta) e perde pra apertar (finaliza).
21. **Grogue dura uma troca** e o fim do round tira o grogue.
22. **Pontos dos juízes por troca:** dano (1 por ponto), queda 3, controle
    (fim da troca por cima) 1,5, avançar 1, raspar 2, levantar 1, anular
    1, interromper 0,5, knockdown 4, ausência 5. Round: 10-9 pra quem fez
    mais; mais de 12 de diferença, 10-8; igual, 10-10. Iniciativa: quem fez
    mais pontos na troca (a Antiqueda também dá).
23. **Fim do round:** energia + 2 + 1 por carta que sobrou na mão (as 2
    sobras), até o máximo; em pé de novo; mão nova.
24. **Cartas fixas e passivas de partida** (ajustadas na simulação):
    striker Jab, 2 Cruzados, Chute alto e "Mãos pesadas" (+0,5 de dano nos
    golpes em pé); wrestler 2 Quedas, clinch, Antiqueda e "Entrada rápida"
    (Queda +1 de velocidade); grappler 2 Puxar guarda, Queda, Antiqueda e
    "Jogo de chão" (cartas no chão custam 1 a menos, Finalização finaliza da
    meia-guarda); counter 2 Contra-ataques, Bloqueio, Antiqueda e "Leitura"
    (Bloqueio e Contra-ataque recuperam 1 de energia a mais).
25. **Puxar guarda**, exclusiva do grappler (velocidade 4, sem dano, custo
    1): leva a luta pro chão com ele por baixo. O caminho do grappler pro
    chão é rápido, mas por baixo.

## Calibragem na simulação (Fase 1)

Medido com `sim/simular.mjs` (jogador atento contra atento, decks padrão).
Cada mudança abaixo saiu de uma medida; os números de cada rodada estão
no relatório (`sim/relatorio.md`).

26. **Desempate pelos pontos.** Cartões iguais no fim: vence quem fez mais
    pontos na luta toda; pontos iguais, empate. Sem isso, 6% de empate
    (deck igual contra deck igual empata troca a troca); com ele, 1,6%.
27. **Controle só com a carta resolvida.** Quem está por cima ganha o
    ponto de controle da troca só se a carta dele resolveu. Antes, a
    Segurar (custo 0) dava controle toda troca e quem estava por baixo
    nunca vencia uma troca: grappler em 13,6%.
28. **O chão virou um ciclo.** Segurar só anula o Levantar (anulava Raspar
    e Levantar); Guarda só anula golpe (anulava golpe e Avançar); Raspar
    velocidade 2; Levantar velocidade 4. Por cima: Segurar ganha do
    Levantar, Ground and pound ganha do Raspar (mais rápido), Avançar e
    Finalização ganham da Guarda. Por baixo: Golpes por baixo interrompe
    Ground and pound, Avançar e Finalização; Raspar ganha da Segurar;
    Levantar foge do Ground and pound, do Avançar e da Finalização.
29. **Vida 12** (+0,2 por ponto de queixo acima de 50). Com 30, o dano
    médio de 7 por lutador dava 85% de decisão e 9,6% de nocaute.
30. **Finalização da meia-guarda** (`K2.finalizaNivel` 1; o grappler, da
    guarda). Da montada, a finalização era 0,1%: o round tem 3 trocas e a
    posição volta em pé a cada round. O encaixe quase sempre acontece na
    última troca do round e o gongo salva; o mecanismo ficou como era.
31. **Cartas que mudaram dos valores de partida:** Chute alto dano 5 → 4,
    Queda velocidade 2 → 3, Antiqueda custo 1 → 0, Contra-ataque custo
    1 → 2, Puxar guarda categoria Queda → Pressão. Motivos: deck aleatório
    com 2 Chutes altos vencia o campo em 61%; a Queda lenta só ganhava do
    Bloqueio e o wrestler perdia do striker em 69% a 77%; a Antiqueda era
    escolhida 11% das vezes e saía de todo deck bom; o Contra-ataque
    barato segurava o striker; a Antiqueda segurava o Puxar guarda e o
    wrestler vencia o grappler em 73%.
32. **Passivas que mudaram:** wrestler de "Queda +1 de velocidade" (com a
    Queda em 3, ele ia a 63%) e de "Queda resistente ao Jab" pra "Queda
    custa 1 a menos"; grappler finaliza da guarda (os outros, da
    meia-guarda).
33. **Limiar de velocidade dos atributos ficou em 15.** Com 20 ou 25, o
    grappler perdia o +1 no chão e caía pra 26% a 30%.
34. **Avançar anula o Raspar** (passar a guarda segura a raspagem). Sem
    isso, o Raspar vencia 92% das trocas em que era jogado e ficava 17
    pontos acima das outras cartas de baixo; Raspar custando 3 não mudava
    nada (quem está por cima não tinha resposta).
35. **Poder pela metade** (`K2.poderEscala` 200). Com 100, o peso-pesado
    vencia o peso-leve em 54,5% (hoje, 49,7% a 51,7%).
36. **Decks padrão do striker e do counter sem a segunda Antiqueda.** O
    deck padrão do striker com 2 Antiquedas perdia pra um deck aleatório
    sem elas (61,8% contra o campo): virou Jab, 2 Cruzados, 2 Chutes
    altos, 2 Bloqueios, 2 Contra-ataques, clinch, Queda e mais um Jab. O do
    counter troca uma Antiqueda por um Chute alto.
37. **Passiva do striker: +0,25 de dano** (era 0,5). Com o deck novo e 0,5,
    o striker ia a 57,3%: o Cruzado dele passava do dano do knockdown
    contra quem tem pouca defesa. O dano fixo tem degrau: o knockdown é a
    partir de 4, e um quarto de ponto muda confronto inteiro.

## Fase 3 (servidor)

38. **O deck mora numa coluna própria** (`jxj_lutadores.deck`), não no
    `build` (revisa a 7). O `build` é lido como mapa de nós pela tela da
    árvore, pela validação e pelo SQL; misturar o deck ali mexeria em todos
    esses leitores. Como a carta da troca já pedia migração (39), o deck foi
    junto. `null` = o deck padrão do estilo.
39. **A carta da troca em `jxj_acoes.carta`** (migração
    `supabase_jxj_combate2.sql`). A coluna `familia` tem o check das 4
    famílias, e com deck duas cartas da mesma família são jogadas
    diferentes. `familia` continua sendo a categoria da carta.
40. **Flag:** `jxj_config` `combate_v2` = `false` (ninguém), `true`
    (todos) ou `{"contas": [...]}` (só essas contas), lida pela `jxj_cfg`
    que já existe. A luta nova é v2 quando as contas dos dois lados estão
    liberadas; ela termina na versão em que nasceu (desligar a flag não mexe
    em luta começada). Sem a migração, a chave não existe e tudo é v1. A
    migração entra com a flag desligada.
41. **Luta contra bot continua na v1** até a Fase 5 (os bots ainda não
    jogam com cartas).
42. **Narração ao vivo por IA só na v1** até a Fase 6. A narração do fim
    funciona na v2 com os textos dos eventos novos (`textoEvento2`).
43. **Sem energia:** a finta sem energia é recusada, como na v1; o custo
    da carta sem energia não é recusado: a carta joga exausta (regra 18).
44. **Log de resolução gravado com a troca**, como o primeiro evento
    (`tipo: "resolucao"`); `acao_a` e `acao_b` guardam o id da carta.
45. **Postura na v2:** a categoria de uma carta da mão (a carta continua na
    mão). Quem não mandou mostra a categoria da carta que jogaria sozinho
    (a Defesa da mão).
46. **A vista nunca manda a mão dele:** só quantas cartas ele tem. A
    leitura do banco (`jxj_luta`) traz a carta dos dois na troca aberta;
    só o servidor usa, e a vista manda a de quem pede (`minhaCarta`).

## Fase 4 (a árvore)

47. **Os nós são os mesmos** (id, custo, regras de pontos e de tier). O
    combate v2 lê o mesmo `build`; cada nó ganha um efeito v2 em
    `ARVORE_V2` (`api/_jxj-cartas.js`). Quem já gastou pontos recebe na
    hora o que os nós dele dão: sem reset, sem respec grátis, sem SQL. A
    luta v1 segue com os efeitos de antes.
48. **No combate v2, o nó vale só pelo efeito v2.** O atributo que o nó dá
    fica na v1: o perfil da luta v2 (`perfilLuta2`, `api/_jxj-luta2.js`)
    usa os atributos do estilo e da categoria. Medido com o atributo: o
    degrau de 15 pontos da velocidade fazia a mesma Defesa de queda +6
    valer 7 pontos no grappler (passa o limiar) e 0 no wrestler (não
    passa); no nível 30, o atributo somado dava ao striker 97% a 99%
    contra o wrestler. Sem o atributo da árvore, o nível 1 (o balanço
    aprovado) não muda e `duelosVel` fica como estava.
49. **Energia e finta não entram em efeito de nó.** Na simulação a energia
    quase nunca falta (counter contra wrestler: 1 troca cansado em 2.572,
    energia mínima mediana 6) e o jogador da simulação não finta: efeito
    de energia e de finta mediu 0. Os nós usam dano, pontos de juiz,
    anulação, velocidade (pouco: +1 no Contra-ataque valia 18 pontos),
    vida e a carta nova. Com gente fintando a energia deve pesar mais; o
    motor do round (recuperação 2 + 1 por carta guardada) não mudou.
50. **Efeito novo no motor: `pontos`** (pontos de juiz a mais quando o
    efeito dispara: na reação, quando a carta acerta ou quando interrompe).
    Com `porNivel`, os números do efeito (pontos, energia, dano extra)
    multiplicam pelo nível; `ateDano`, `avanca` e `anula`, não.
51. **As 4 cartas novas** (uma por estilo, liberada pelo nó de
    `desbloqueio`, só no deck do estilo): Combinação (striker, golpe,
    velocidade 4, dano 2, custo 2), Double leg (wrestler, queda 2/2/3, lenta
    mas o Jab não interrompe), Rasteira (grappler, queda 3/0/1 que só
    derruba quem atacou: a terceira e a quarta queda do deck) e Esquiva (counter, defesa 3/1/1, anula golpe
    e ainda acerta 1 de dano). Os números que não ficaram
    estão no comentário de cada carta.
52. **Como o nó é medido:** cada nó no nível 3 sozinho, contra os 4
    estilos no nível 1, menos a mesma luta sem o nó, com as mesmas sementes
    nos dois lados (sem isso, o ruído da linha de base mudava todos os nós
    do estilo juntos em até 3 pontos). O nó de carta nova mede com a carta
    no lugar de uma que o estilo dispensa (Striker, Contra-ataque;
    Wrestler, Cruzado; Grappler, clinch; Counter, Chute alto), nunca do
    Jab: sem Jab ninguém segura a queda de velocidade 4, e o teste media a
    falta do Jab, não a carta.
53. **Deck montado que deixou de valer** (a reconfiguração tirou o nó da
    carta): fica guardado, a luta usa o padrão e o estado diz
    `deckMontado: false`. Se o nó voltar, o montado volta.


## Fase 5 (bots)

54. **Luta contra bot no combate novo quando a flag vale pra conta do
    jogador** (só a dele: a conta dos bots não entra na lista). Sem a
    flag, a luta contra bot é a de antes, com o mesmo código.
55. **O bot é o mesmo da tela** (`montarBot`: nome, rosto, estilo, build,
    jeito e roda saem da mesma semente). Muda o perfil (`perfilLuta2`:
    deck padrão do estilo, a árvore pelo efeito v2) e o rating
    (`FORCA_BOT2`). O bot não monta deck: a carta nova da árvore fica fora
    do deck dele.
56. **Cego.** O bot enxerga o estado com a mão do jogador trocada pela
    quantidade de cartas (`vistaDoBot`); o deck do jogador e o que ele já
    jogou no round são públicos. A carta do jogador na troca nunca é
    argumento das funções do bot. O perfil do jogador entra, como no bot
    de antes (que já usava o perfil humano nas misturas).
57. **A leitura da troca** (a tabela das cartas e a mistura de equilíbrio
    do jogador "atenta") saiu de `sim/politicas.mjs` pra
    `api/_jxj-leitura2.js` sem mudar a conta: 60 de 60 lutas iguais antes
    e depois. O servidor e a simulação usam a mesma.
58. **Habilidade:** carta ao acaso em 0,6 x (1 - s) das vezes; no resto, a
    mistura de equilíbrio. Sem o "peso do estilo" de antes: o jeito já
    puxa pro estilo.
59. **As personalidades nas cartas:** os mesmos pesos por categoria do bot
    de antes (`PESOS_PERSONALIDADE`), divididos entre as cartas da mão de
    cada categoria. O Observador joga a carta que mais rende contra a
    última do jogador (pela leitura); o forte, contra o hábito dele. O
    Inquieto anda na roda das 4 categorias e pula a que não tem na mão.
    O erro de propósito (`ERRO_PERSONALIDADE`), a regra de não repetir a
    mesma categoria uma 4ª vez e o começo puro da primeira luta contra
    bot continuam.
60. **Inclinação:** o peso do jeito vezes e^(0,08 x s x ganho), com o ganho
    no valor da leitura (na v1 era em chance de vencer).
61. **Encaixe e grogue:** o bot joga a leitura, sem o jeito (como o momento
    decisivo da v1).
62. **Cansado** (energia 2 ou menos): metade das vezes a defesa (o
    Provocador, um quarto), como antes.
63. **Postura:** a categoria da carta pretendida ou, com a chance de isca do
    jeito vezes s (mais se a finta dele está barata), outra categoria da
    mão; sem energia pra fintar, nunca isca. Com as posturas reveladas, o
    bot responde à do jogador como verdade (confia x s) ou como isca
    (desconfia x s); sem energia pra fintar, joga a carta da própria
    postura. Os números de isca, confia e desconfia são os do bot de antes.
64. **Força medida contra o jogador "atenta" (1500)**, pelo caminho do
    servidor, com o jogador mostrando a categoria da carta e 30% de isca
    (`sim/bots2.mjs`). O número sai menor que o do bot de antes porque a
    base é outra (o "atenta" joga a mistura de equilíbrio; na v1 a base era
    o jogador de estilo). A faixa `RATING_BOT` (a habilidade pelo rating do
    jogador) não mudou.
65. **Lição do fim com as cartas do combate novo** (`LICAO2`): o que pune
    cada jeito mudou (o Bloqueio e o Contra-ataque punem o Provocador; o
    clinch passa pela defesa do Paciente e tira energia).
66. **A simulação dos bots fica fora do relatório padrão** (custa 7 minutos
    com 10.000): `SIM_PARTES=bots SIM_SAIDA=relatorio-bots.md node
    sim/simular.mjs 10000`.
