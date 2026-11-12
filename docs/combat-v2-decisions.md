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
