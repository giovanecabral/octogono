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
