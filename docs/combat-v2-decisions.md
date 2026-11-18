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

## Fase 6 (tela, a lógica)

70. **Só funções puras no `index.html`, sem mexer na tela de hoje:**
    `jxjPorQue2`, `jxjLinhas3d2` (com a tabela `JXJ_3D2`),
    `jxjReferencia2` (com `jxjEfeitoTexto2`) e `jxjNomeCarta2`. O nome da
    carta vem das definições (`JXJ_DEF.combate2`), sem cópia da lista no
    cliente.
71. **O por quê da troca tem até 3 frases**, nesta ordem: encaixe; reação
    (quem anulou o quê); velocidade e interrupção, ou empate de velocidade;
    carta que falhou porque a posição mudou; carta sem energia; finta e o
    custo. Sem nada disso: quem fez mais pontos na troca, ou "Nenhuma das
    duas cartas mudou a troca."
72. **A frase não depende de gênero:** "a sua carta", "a carta de Fulano",
    "saiu na frente" (e não "foi mais rápido"). Os dados não dizem o gênero
    da carta nem do jogador. A frase sai pronta pro HTML: nome de jogador e
    de carta passam por `jxjEsc` dentro da função.
73. **3D da v2 por tabela (`JXJ_3D2`):** todo tipo de evento do motor v2
    tem entrada; `null` = sem lance próprio. Usa só os lances que o diretor
    já tem: o golpe pela carta (Jab, jab; Cruzado, cruzado de esquerda;
    Chute alto, chute alto; Combinação, jab e direto; Contra-ataque,
    direto; clinch, cruzado no corpo; Esquiva, jab), o dano no chão como
    `gnp1`, a anulação como o lance da carta anulada (golpe no bloqueio,
    queda defendida, controle de quem está por cima) e o Avançar como
    `controle`.
74. **Um lance por acontecimento:** o golpe que derruba vira um `kd` só,
    com o dano; o golpe do nocaute fica no lance do fim; o dano da queda vai
    no lance da queda (com `alvo` e `dano`, pro placar descer no golpe).
    Interrupção, carta resistente, finta, sem energia e carta que falhou não
    têm lance (o golpe já mostra), nem o fim do round (o `jxj3dTrocas` põe a
    linha do round sozinho).
75. **`trocaVista` não manda o `como` do escapou:** a conversão olha a
    posição depois da troca (em pé, saiu na força e levanta; senão,
    defendeu). Resolvido depois: a troca manda o `como` e a
    conversão usa ele (a posição fica só pra troca gravada sem ele).
76. **Referência da v2:** em pé, por cima e por baixo, da mais rápida pra
    mais lenta (empate: mais dano, depois o nome). O texto do efeito sai
    dos efeitos declarativos da carta (`jxjEfeitoTexto2`), não de texto
    escrito à mão: carta ou efeito novo aparece sozinho. Com o estilo, a
    carta exclusiva de outro estilo sai da lista.
77. **Suíte `jxjv2`:** as funções rodam no jogo de verdade (a sandbox da
    carreira), com trocas do motor de verdade passadas por `trocaVista` e
    nome malicioso. A `luta3d` passou a varrer também a `JXJ_3D2` (lance
    sem `case` no diretor reprova).


## Cartas da árvore: simulação e calibragem (Tarefa 10, 2026-11-16)

80. **A casa.** A carta da árvore joga como ela mesma só em pé, por cima ou
    por baixo conforme o campo `casa`; fora dela entra a básica da categoria
    ali (Jab, Queda, Bloqueio, Pressão em pé; as 8 do chão no chão). Passiva
    do estilo e estrelas valem só na casa.
81. **O `ARVORE_V2` acabou.** O nó vale pela carta que libera e pelas
    estrelas dela; sem a carta no deck, o nó só dá o atributo. Por isso o
    nível 30 com deck padrão não passa de 52% e a evolução só aparece com o
    deck montado.
82. **Estrelas = nível do nó (1 a 3).** Nível 2: +0,5 de dano, ou +0,5 ponto
    de juiz em carta sem dano. Nível 3: o efeito da coluna "Estrela 3".
83. **Cópias por raridade:** comum 2, rara 2, épica 1, lendária 1
    (`COPIAS`); o deck aleatório da simulação e a `validarDeck` usam a mesma
    tabela.
84. **Como a simulação mede.** (a) O valor do nó é a luta com a carta no deck
    padrão no lugar de uma carta não fixa da mesma categoria
    (`deckDoNo`; se não houver, no lugar da última com 2 cópias). (b) A busca
    de deck é subida de encosta (`sim/busca-deck.mjs`) com a política atenta
    dos dois lados (a mistura de equilíbrio é o que ela joga): triagem com 100
    lutas por rival e confirmação com 1.000 (o plano pedia 200 e 2.000; a
    rodada final levou 5.232 s mesmo assim). (c) A evolução é medida com o
    melhor deck do nível 30 contra o nível 1 e o nível 20 com deck padrão.
    (d) Na parte `decks` do nível 1 o sorteio mudou de decks (a ordem do
    catálogo mudou), mas as outras 6 partes do nível 1 ficaram idênticas ao
    relatório aprovado; no sorteio novo nenhum deck passa de 60%.
85. **Calibragem em 3 rodadas, o que mudou** (cada carta tem um comentário
    com o antes e o depois e o resultado medido em `api/_jxj-cartas.js`).
    Rodada 1: vel 4 para 3 em Direto, Combinação e Chute na perna (+10 caiu
    pra 0: passou do ponto), nerfs de dano e velocidade em Superman,
    Contragolpe, Joelhada e Cotovelada, buffs em Double leg, Suplex, Mata-leão
    e nas defesas fracas. Rodada 2: Direto, Combinação e Chute na perna
    voltam pra vel 4 com menos dano e mais custo (de 33 nós fora pra 20);
    Contra de esquerda de +22,5 pra +5,1; Golpe de misericórdia de +10,0 pra
    +10,5 (ainda fora). Rodada 3: Leitura de queda e Saída de lado passam a
    anular golpe também (de -2,8 e -2,4 pra +4,5 e +6,6), Leitura total
    anula só o que tem dano 2 ou mais (de +9,8 pra +3,2), Misericórdia sai
    de vel 4/dano 2/custo 2 pra dano 1/custo 3 (+5,7), Bodylock deixa de
    valer contra golpe (de +7,9 pra +4,4). Duas coisas aprendidas: a
    velocidade não mexe em carta de reação (`contra` vale em qualquer
    velocidade, decisão 2), e carta de chão não responde a número, porque a
    maior parte do valor dela vem da troca que o `deckDoNo` faz.
86. **DÚVIDA PRO DONO: nó de carta de chão.** Depois das 3 rodadas, 13 nós
    seguem fora de 0,5 a 6,5 nos 10.000 lutas finais: Controle de ritmo
    -3,9, Equilíbrio -2,1, Defesa de entradas -1,7, Controle -0,8, Defesa de
    finalização -0,9, Sobrevivência posicional -0,8, Evasão -0,5, Controle
    posicional 0,0 e Recuperação de posição +0,1 (abaixo), e Combinações
    +6,9, Eficiência de energia ofensiva +7,0, Manutenção de domínio +9,8 e
    Pressão no solo +9,6 (acima). Causa: fora da casa a carta joga como a
    básica. Cotovelada por cima e Martelada (golpe por cima, wrestler)
    viram um terceiro Jab no lugar do Cruzado, que no deck padrão do
    wrestler é fraco: +9 sem a carta fazer nada. As defesas de chão ficam em
    0 porque a carta de chão quase não é jogada (7% a 13% da mão). Pergunta:
    trocar a regra do `deckDoNo` (por exemplo, trocar sempre a básica da
    mesma categoria) ou aceitar esses nós fora da faixa?
87. **DÚVIDA PRO DONO: portão "carta jogada de 40% a 60%" no chão.** Em pé
    ficou só o Mata-leão em 60,0% e o Pêndulo em 39,9%. No chão, as cartas
    decisivas passam: Kimura 96,0% (relativa à posição +31,9), Triângulo
    68,4% (+31,8), Berimbolo 62,2% (+25,6), Raspagem de gancho 61,3% (+24,7),
    Martelada 78,2% (+14,1), Cem quilos, Passagem de guarda, Guarda fechada
    (+13 a +16). Quem joga finalização no chão já está ganhando, seja qual
    for a carta (decisão 9). Pergunta: o portão do chão vale pela relativa à
    posição (até 10 pontos), como na Fase 1, ou por outra régua?
88. **DÚVIDA PRO DONO: nível 30 com o melhor deck e deck aleatório.** A busca
    acha, pros 4 estilos, um deck que vence os decks padrão do nível 30 em
    67,6% (Striker), 84,8% (Wrestler), 79,4% (Grappler) e 70,7% (Counter), e
    com os melhores decks uns contra os outros o Striker fica em 39,6% e o
    Counter em 55,1% (Wrestler 52,4%, Grappler 52,9%). O melhor de 40 decks
    aleatórios no nível 30 vence o campo em 61,7% (Striker), 75,6% (Wrestler),
    67,9% (Grappler) e 67,8% (Counter). A evolução também passa do teto: 30
    contra 1 de 66,6% a 92,6% (Wrestler 92,6% contra 85%). As cartas da
    árvore somadas valem mais do que 1 nó isolado sugere. Parei na terceira
    rodada, como combinado. Opções: nova rodada de nerfs (começando por
    Martelada, Cotovelada por cima e Peso do ombro do Wrestler) ou ajustar o
    portão pra "deck aleatório até 60% no nível 1 e 30 vs 1 até 92%".

### Resposta do dono às decisões 86 a 88 e a rodada 4 (2026-11-17)

86 (resolvida na medição, sem efeito). O dono pediu que a carta do nó entre no
    lugar de uma carta não fixa da MESMA CASA no deck padrão, com o fallback
    de antes se não houver. O `deckDoNo` agora faz isso, mas o deck padrão só
    tem cartas em pé (as de chão entram como básicas), então pra carta de
    cima e de baixo vale o fallback e pras de pé a regra já era essa: os 192
    decks (48 nós por 4 estilos) saíram idênticos aos de antes, e a medição
    não mudou. O motivo do +9 de Cotovelada por cima e Martelada continua
    sendo o terceiro Jab no lugar do Cruzado do wrestler. Defesas
    situacionais abaixo de 0,5, com o número medido (10.000, 4.000 lutas por
    nó): Controle de ritmo (Passo lateral) -3,9, Equilíbrio (Sprawl) -2,1,
    Defesa de entradas (Contra-queda) -1,7, Controle (Cem quilos) -0,8,
    Defesa de finalização -0,9, Sobrevivência posicional (Recomposição)
    -0,8, Evasão (Pêndulo) -0,5, Controle posicional (Peso do ombro) -0,3,
    Recuperação de posição (Levantada técnica) +0,1 e Transições (Rasteira)
    -3,5. Seguem registradas como situacionais, como o dono permitiu.
87 (a régua da decisão 9 fica: relativa à posição, até 10 pontos). Rodada 4:
    vel e custo piores em Kimura, Triângulo, Berimbolo e Raspagem de gancho.
    Não fechou: relativa Kimura +27,8, Triângulo +31,3, Berimbolo +26,4,
    Raspagem +24,9 (antes +31,9, +31,8, +25,6, +24,7). Quem joga finalização
    no chão já está ganhando; número de carta quase não mexe nisso. Peso do
    ombro voltou pra dentro (+9,1). Mata-leão 60,0% e Pêndulo 39,9% em pé.
88 (rodada 4, a última). Martelada (dano 1,5, nocaute abaixo de 0,3 da
    vida), Cotovelada por cima (vel 3, dano 0,5, custo 2), Peso do ombro (sem
    energia e sem anular golpe), Rasteira (vel 3) e as 4 finalizações acima,
    com a busca de deck em 200 lutas por rival na triagem e 2.000 na
    confirmação. Resultado: 14 nós fora (eram 13), nenhum portão novo
    fechado. Nível 30 com deck padrão dentro (47,8%, 51,3%, 52,3%, 48,7%).
    Melhor deck uns contra os outros: Striker 42,1% fora, Wrestler 52,8%,
    Grappler 53,6%, Counter 51,5% (o Counter passou a caber). Melhor deck
    contra os padrão: 67,0%, 82,8%, 74,6% e 70,4%. Deck aleatório no nível
    30: 61,9%, 72,3%, 68,8% e 68,2% (5.000 lutas). Evolução: 30 contra 1 de
    61,3% a 91,6% (Grappler 61,3% passou abaixo de 62%, Wrestler 91,6% acima
    de 85%), 30 contra 20 de 62,0% a 92,0%. A Rasteira nerfada derrubou o nó
    pra -3,5 e o Grappler contra o Striker de 81,0% pra 76,4%. Sem 5ª rodada,
    como combinado: dúvida aberta pro dono (o conjunto de cartas do Wrestler
    por cima, e o teto do deck aleatório, passam do teto com qualquer
    número de carta; as opções são tirar a casa "por cima" do deck do
    Wrestler ou subir o teto do portão).

### Rodada 5 (2026-11-17, a última liberada pelo dono)

89. **Os portões "melhor deck no nível 30" e "deck aleatório no nível 30"
    comparam com o campo dos melhores decks da volta 2**, não com o deck
    padrão: o deck padrão não leva nenhuma carta da árvore, então é um
    adversário fraco por definição. Contra o deck padrão os dois seguem no
    relatório, só como informação (parte `decks` e a linha "melhor deck
    contra os decks padrão"). A parte `busca` agora mede 40 decks aleatórios
    por estilo contra os 4 melhores decks (300 lutas por confronto).
    Alvos da rodada: Wrestler de 30 contra 1 abaixo de 85%, Grappler contra
    Striker abaixo de 65%, Striker com 45% ou mais.
    Números mudados: Cotovelada por cima vel 3 para 2, dano 0,5 para 0, custo
    2 para 3 (nó +9,6 para +9,4; luta 77,5% para 83,3%: o valor do nó vem do
    Jab que ela deixa no deck, não dela); Suplex dano 3 para 2, custo 2 para
    3 (+3,1 para +2,2); Kimura custo 2 para 3 (+0,6 para +0,5); Triângulo
    custo 3 para 4 (+3,4 para +3,1); Chute frontal custo 1 para
    0, reforço do Striker (+3,6 para +3,9). Medido só o valor dos nós
    (6.000 lutas, 2.400 por nó) e o nível 30 com deck padrão (Striker 48,1%,
    Wrestler 50,8%, Grappler 52,0%, Counter 49,1%). Os alvos de busca (melhor
    deck, deck aleatório, evolução) dependem da rodada longa, que o dono roda.

### Rodada 6 (2026-11-17): limite de cópias (decisão 90)

90. **Carta da árvore de chão (casa `cima` ou `baixo`) e carta de finalização da árvore (inclusive as de pé, como o Mata-leão) têm no máximo 1 cópia por deck, qualquer que seja a raridade.** As outras seguem a raridade (comum e rara 2, épica e lendária 1). Motivo: no melhor deck da rodada 5, o Grappler levava 2 Kimuras e o Wrestler 2 Cotoveladas por cima, e as duas dominavam o campo. O número mora num ponto só, `copiasDe(id)` em `api/_jxj-cartas.js`: `validarDeck`, o deck do bot (`deckDoBot2`), o deck aleatório da simulação e as definições que o servidor manda (`cartas[id].copias`, que a tela lê no lugar do número da raridade). A busca de deck passa por `validarDeck`. Deck salvo com 2 cópias de carta de chão deixa de valer e volta pro padrão. Nenhum número de carta mudou nesta rodada. Nós medidos de novo (6.000 lutas): Combinações, Evasão voltaram pra faixa; Gestão de distância (+6,6) saiu; Martelada, Kimura e Pêndulo voltaram pra faixa de 40% a 60% por carta; seguem fora Triângulo, Mata-leão, Cem quilos, Passagem de guarda, Guarda fechada, Raspagem de gancho e Berimbolo. Rodada final (melhor deck, aleatório, evolução): o dono roda.

Resultado da rodada 6 (10.000 lutas, `sim/relatorio-r6-final.md`): o limite de cópias quase não mexeu. Melhor deck contra melhor deck no nível 30: Striker 45,5%, Wrestler 57,8%, Grappler 53,7%, Counter 43,1% (rodada 5: 45,0, 57,6, 54,6, 42,8); Grappler contra Striker 74,2% (76,2%); Wrestler de 30 contra 1 com o melhor deck 91,5% (92,2%); deck aleatório contra o campo de melhores até 53,1%; nível 1 igual ao relatório aprovado nas 6 seções.

91. **A calibragem para aqui e os números da rodada 5, com a regra da decisão 90, valem pro grupo de teste (decisão do dono, 2026-11-17).** Seis rodadas mostraram que o Wrestler forte e as cartas de chão decisivas não respondem a número de carta nem a cópias: o peso vem da regra do chão (posição e finalização). Ficam fora dos portões, conhecidos: Wrestler 57,8% e Counter 43,1% no melhor contra melhor, Wrestler 91,5% de 30 contra 1, Grappler contra Striker 74,2%, 13 nós e as cartas de chão pela relativa. Tudo atrás da flag `combate_v2`: o grupo de teste da Fase 7 dá o dado de gente jogando, e uma regra nova pro chão, se precisar, sai de lá.

## Tela: o duelo das cartas (2026-11-17, pedido do dono)

92. **A revelação da troca é um duelo das duas cartas, e o resultado de cada carta é `deu_certo` ou `falhou`.** O dono desenhou a cena: sem a seta do meio, a carta do jogador sempre na esquerda e a do oponente na direita, um pouco maiores do que antes; a que prevaleceu cresce e sobe, a outra fica toda cinza e cai; quando as duas dão certo, as duas sobem, menos do que uma sozinha. O caso "nenhuma deu certo" o dono não disse: as duas ficam neutras, sem subir e sem cinza.
    A regra mora num lugar só, `jxjResultadoDuelo2(t)` no `index.html`, e lê só os eventos que o servidor já manda (os mesmos do porquê, `jxjPorQue2`). Uma carta **deu certo** quando fez alguma coisa: dano (inclusive a punição do contra, como a do Superman punch), a reação anulou, mudou a posição (queda, puxar a guarda, avançar, raspar, levantar, recuar), encaixou, finalizou ou nocauteou, escapou do encaixe, ou um efeito dela (energia, iniciativa, mais rápido, tirar o grogue; lento, sangrando ou grogue no outro). **Falhou** no resto: interrompida, anulada por reação, a posição mudou antes, ou resolveu sem efeito (o Bloqueio contra uma Queda). As duas que se anularam: as duas falharam. Daí saem 4 casos: só A, só B, as duas, nenhuma. A tela (`jxjRevelar2`, `jxjMesa2`, o som) e os testes (`jxjv2`) usam a mesma função. Os pontos de juiz da troca não entram: o controle e a iniciativa do fim da troca não são efeito da carta.
    Tempo: as cartas viram (0,3 s a 0,85 s), o resultado entra em 1,15 s (`JXJ_DUELO_RESULTADO_MS`) e o duelo dura 2,5 s (`JXJ_DUELO_MS`). Com o 3D, o duelo fica no meio do palco, a mão sai, e só depois o 3D toca a troca; pra caber, a janela da animação da luta v2 foi de 7 s pra 9,5 s, só na v2 (`ESTRATEGIA.prazosV2.animacaoMs`, lido por `prazosDaLuta`; a v1 segue com 7 s, teste no `jxjmotor` e no `jxj`). Sem o 3D, o duelo fica na mesa até a próxima etapa: a etapa da postura da troca seguinte, até o jogador mostrar a dele. A linha do porquê perdeu as duas cartas e as setas (ficou o selo, a frase e os ganhos).
    Som (pedido do dono, pelo lado de quem vê, `jxjSomDuelo2`): a virada toca `carta.mp3`; a minha prevaleceu, `conquista.mp3`; as duas, `conquista.mp3` mais baixo e mais grave; nenhuma, `ui-aba.mp3`. A minha falhou fica sem som: nenhum arquivo de `audio/` serve (a vaia tem 4 s e fala da luta inteira) e o download é decisão do dono. Todos os sons do duelo têm menos de 0,7 s e acabam antes do 3D começar; os golpes da troca entram depois do resultado do duelo. O mudo vale como em todo o jogo (`toca` e `ctx`).

## Tela: clareza da mecânica (2026-11-18, pedido do dono)

93. **A regra antes de lutar, a pista na hora de escolher e a energia clara** (spec `docs/superpowers/specs/2026-11-18-online-v2-clareza-design.md`; o dono: "coloco as cartas e torço para que dê certo"). Nada mudou no motor, nos números, nos decks do bot nem em `FORCA_BOT2`; a luta v1 não passa por nada disto. Escolhas que a spec deixou pro construtor:
    - **A pista é uma função só, `jxjPrevisao2(v, eu)`**, que a tela e os testes usam. Ela refaz a conta do motor (`resolverNormal`) com o que é público: o deck dele menos o que ele já jogou no round, só da categoria da postura, a carta efetiva na posição de agora (a básica em pé, a do chão, a da casa como ela mesma) com a passiva do estilo dele; a velocidade dele com grogue, cansado, exausta, lento e rápido. Sem as estrelas dele (a árvore é secreta) e sem o duelo de atributos (secreto pela spec): quando a diferença de velocidade é 1 ou 0, o detalhe avisa que os atributos podem mudar 1. A minha velocidade é a da vista (o servidor já soma o meu duelo), menos a exausta, que a tela calcula com a finta. Na suíte `jxjv2`, 4.000 trocas sorteadas (atributos iguais, sem estrelas, com passiva) batem com o motor em todas; um espião na vista reprova leitura de `atr`, `perfis`, `maos` e `semente`.
    - **Seis resultados, não quatro:** além de Anula, Mais rápida, Juntas e Mais lenta, **Ele anula** (a reação dele pega a minha carta) e **Se anulam** (as duas). Sem eles o selo mentiria quando a carta dele é uma defesa. "Se anulam" não sai com as cartas de hoje (nenhuma reação casa com outra carta de reação), mas a conta e o texto existem.
    - **O selo:** um resultado, só o rótulo ("Anula"); resultados diferentes, o mais comum com a conta pelas cópias ("Anula 2 de 3", empate pela ordem fixa anula, ele anula, se anulam, mais rápida, juntas, mais lenta). O detalhe com todas as cartas dele vai no título da carta e na carta tocada (celular). Cor pelo resultado (verde: anula e mais rápida; vermelho: ele anula e mais lenta; ouro: juntas), nunca destaque de carta: várias cartas podem ter o mesmo selo e nenhuma é marcada como a melhor. Sem a postura dele (prazo) ou com a finalização encaixada, nada de selo.
    - **Linha de fintar** na frase da barra de comando, na etapa da carta: pela energia dele contra o custo da finta (metade com a iniciativa), com `>=`, igual ao servidor (`acaoV2`) e ao bot.
    - **Como ganhar:** abre sozinho na primeira luta v2 do navegador (`jxj:regras2`, marcado ao abrir; sem storage abre uma vez por carga da página) e pelo botão "Como ganhar" na barra de comando. Fica na zona da mão, acima da barra de comando, e nunca cobre as cartas: dá pra jogar com ele aberto, e o texto avisa que o relógio corre. No computador os 5 blocos ficam lado a lado; no celular, um embaixo do outro, com rolagem dentro. Os números saem de `definicoes2().regras` (agora com `cansado`, `exaustaVel`, `recuperacaoRound`, `energiaPorSobra`, `grogueVel` e `pts`); a suíte troca as regras e confere que o texto muda.
    - **Servidor, só dado público:** `definicoes2()` ganhou `basicaPe` e o `mods` de cada passiva; a vista (`ladoVisto`) ganhou `lento` e `rapido` dos dois (a frase da troca já contava).
    - **Placar:** vida e energia num bloco só (`v2-placar`), igual dos dois lados. A barra dele no topo era uma faixa fina porque caía na coluna estreita da grade; agora fica na coluna do nome, e no celular (até 720 px) o lado dele vira itens da tarja e o placar ganha uma linha inteira. A energia é barra com "Energia 7,9 de 10", a marca do cansado e a cor vermelha quando chega nela. O `jxj-card-ele` continua com a barra dentro (o 3D, a vida que só desce no golpe e os testes leem dali). No celular, o tremor do card dele não aparece (o card vira itens da tarja); o número que sobe e o selo do knockdown aparecem no meio da tarja.
    - **Gasto na linha do porquê:** "Você: −2,5 de energia (carta 1, finta 1,5)." e "Ele: ...", com "+X de volta" (efeito), "−X tirados por você" (efeito dele), "cansado: 1 mais lento" e a carta exausta. "Ele", nunca o nome do outro jogador. O ganho de energia saiu dos selos (está no gasto); anular e interromper viraram selos do que a escolha rendeu. No fim do round, a recuperação e o total de verdade (o estado depois, com o teto).
    - **Mão:** "Sai exausta" e "Fica cansado" embaixo da carta (cansado só quando a carta leva a energia pra faixa e não é a última troca do round, porque o fim do round recupera).
