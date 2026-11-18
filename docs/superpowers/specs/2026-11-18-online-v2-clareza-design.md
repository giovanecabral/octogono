# Online v2: clareza da mecânica (2026-11-18)

Pedido do dono, depois de jogar o combate v2 (cartas da árvore, flag
`combate_v2`): "ainda sinto que está meio aleatório. Coloco as cartas e
torço para que dê certo. Quero que fique clara a mecânica, para o jogador
sentir que sabe o que está fazendo e ganhar." Ele entendeu sozinho, depois
de analisar, que a velocidade decidia; o problema é que a tela só explica
DEPOIS da troca (linha do porquê) e nada ajuda ANTES de escolher.

O dono pediu as duas coisas: a regra clara antes de lutar e uma pista na
hora de escolher. Mais dois ajustes de placar. O dono não quis ver
desenhos antes ("faça tudo e me faça o deploy").

## O que já existe (recon de 2026-11-18)

- A troca não tem sorte (`api/_jxj-combate2.js`, cabeçalho e
  `resolverNormal`): reação "contra" anula em qualquer velocidade; a mais
  rápida resolve primeiro e, com dano, interrompe a mais lenta (menos a
  "resistente"); velocidade igual, as duas juntas. Velocidade: a da carta,
  ±1 pelo duelo de atributos (`limiarVel` 15), −1 grogue, −1 com energia
  no começo da troca ≤ `cansado` (2), −2 exausta, lento/rápido da troca
  anterior.
- Pistas que o jogador já tem mas estão escondidas: a postura dele (a
  categoria provável), o deck dele e o que ele já jogou no round (botão
  "Deck dele", `jxjDeckDele2`), a energia dele (sem energia pra pagar a
  finta, ele NÃO pode fintar: a postura é verdade), a régua de velocidade
  (só com o botão "Velocidade", `jxjRegua2`).
- O treino obrigatório (`JXJ_TREINO`, `jxjPrecisaTreino`) ensina o jogo
  ANTIGO (v1), não o de cartas.
- Placar: a barra de vida dele no topo é uma faixa fina; a energia é um
  número pequeno ao lado do ícone (`jxj-hud-num`), e a tela não diz quanto
  cada escolha gastou nem rendeu.

## Decisões do dono

- **Pista: opção B.** A tela mostra o que cada carta minha faz contra o
  que ele provavelmente vai jogar; a escolha é do jogador. Nunca "jogue
  esta carta", nunca uma carta marcada como "a melhor" (palavras do dono:
  "se o jogo falar qual carta é para ele jogar, o jogador realmente não vai
  pensar").
- Barra de vida dele maior.
- Energia clara: onde ela está, e o que o jogador perde com escolha
  errada e ganha com escolha certa.

## O que construir

### 1. "Como ganhar" (a regra antes de lutar)

Painel curto da luta v2, com `ICONE` (nunca emoji), texto sem travessão e
sem frase de efeito (suíte `texto`). Abre sozinho na primeira luta v2 do
navegador (`localStorage` `jxj:regras2`, leitura e escrita em try/catch;
sem storage, abre e não quebra) e por um botão "Como ganhar" na barra de
comando. Fecha com um botão; não bloqueia o relógio da troca de forma
injusta (minha escolha: na primeira luta, abre na etapa da postura da 1ª
troca e o texto avisa que o relógio corre; o construtor pode preferir
abrir na tela de "achou adversário" se existir um momento sem relógio).

Blocos (texto final do construtor, curto, números lidos de
`JXJ_DEF.combate2.regras`, nunca escritos à mão; acrescentar em
`definicoes2().regras` os que faltam: `cansado`, `exaustaVel`,
`recuperacaoRound`, `energiaPorSobra`, `pts`):

1. A troca: primeiro a postura (a categoria que você mostra), depois a
   carta.
2. Três jeitos de levar a troca: anular (reação contra a categoria dele,
   em qualquer velocidade), ser mais rápido com dano (interrompe a dele),
   velocidade igual (as duas juntas).
3. Ler ele: a postura dele diz a categoria; fintar custa energia (metade
   com a iniciativa); sem energia pra fintar, a postura dele é verdade; o
   deck dele e o que ele já jogou no round estão no botão "Deck dele"; a
   velocidade da carta dele pode mudar 1 pelos atributos.
4. Energia: cada carta custa; com energia baixa (≤ cansado) a carta sai 1
   mais lenta; sem energia pra pagar, sai exausta (2 mais lenta, metade
   do dano, sem efeito); no fim do round volta a recuperação mais 1 por
   carta que sobrou na mão.
5. Pontos: dano, queda, knockdown, anular, interromper (os de `pts`).

O treino antigo fica como está (a flag só está ligada pro dono, que já
lutou). Anotar no PROGRESSO.md que antes de ligar a flag pra todos o
treino precisa da versão de cartas.

### 2. A pista na hora de escolher (opção B)

Na etapa da ação, com a postura dele já revelada, cada carta da minha
mão ganha um selo curto do que ela faz contra a categoria que ele mostrou:

- **Anula**: a carta tem reação "contra" que casa com as cartas dele
  daquela categoria;
- **Mais rápida**: minha velocidade maior que a da carta dele (e ela tem
  dano: interrompe; sem dano, "Mais rápida, sem dano");
- **Juntas**: velocidade igual;
- **Mais lenta**: a dele resolve antes (se ele tem dano, ele interrompe);
- quando as cartas possíveis dele dão resultados diferentes, o selo diz a
  mistura de forma curta (ex.: "Anula 2 de 3").

As cartas possíveis dele = o deck dele menos o que ele já jogou no round,
só as da categoria da postura, como elas jogam na posição atual (no chão,
a carta do chão da categoria, como o servidor faz em `cartaEfetiva`). A
velocidade dele = a da carta mais o que é público: grogue, energia ≤
cansado, exausta (a energia dele é pública), lento e rápido se a vista
manda. Nunca os atributos dele (a build dele é secreta) nem a mão dele.

Uma linha na barra de comando diz se ele pode fintar: "Ele tem energia
pra fintar" ou "Ele não tem energia pra fintar: a postura dele é
verdade". Se ele não mostrou postura (prazo), nada de selo; a linha diz
que não tem leitura.

A conta mora numa função pura no `index.html` (ex.: `jxjPrevisao2`) que a
tela e os testes usam. O teste compara com o motor de verdade
(`resolverTroca2` de `api/_jxj-combate2.js`) em muitas trocas sorteadas
com os dois lutadores de atributos iguais e sem passivas: o selo tem que
bater com o que o motor resolve (anulou, quem foi primeiro, juntas). Teste
de que a função não lê `atr` dele nem a mão dele. Provar o dente.

### 3. Barra de vida dele maior

A barra dele no topo com a mesma leitura da minha (altura e segmentos
comparáveis), em 1280, 390 e 360, sem empurrar as cartas nem o 3D
(`jxj3dPosicionar`). Vida nunca desce antes do golpe encostar (regra do
3D, `JXJ_3D.mostrado`): só muda o desenho.

### 4. Energia clara

- Nos dois placares, a energia como barra com rótulo "Energia" e o
  número "7,9 de 10", com a marca da faixa de cansado (≤ cansado) e a cor
  mudando nela.
- Na linha do porquê da troca, o que cada um gastou: "Você: −2,5 de
  energia (carta 1, finta 1,5)" e o dele; "cansado: 1 mais lento" e
  "exausta" quando aconteceu. Ganhos também: o que a escolha rendeu
  (pontos, dano, anular).
- No fim do round: "+2 de recuperação, +1 por carta que sobrou" com o
  total.
- Na mão, a carta que sairia exausta ou faria ficar cansado diz isso no
  título/selo (hoje há `finta`/`exausta`/`sem-energia`; deixar o texto
  explícito).

## O que não fazer

- Nada de dizer qual carta jogar nem destacar uma como a melhor.
- Nada de mexer no motor, nos números, no deck do bot ou em `FORCA_BOT2`.
- Nada de SQL. Mudança no servidor só em `definicoes2().regras` (e na
  vista se faltar dado público, como lento/rápido), com teste.
- v1 (luta sem `combate===2`) bit a bit igual.

## Testes e entrega

`jxjv2`, `jxjtelas`, `jxj`, `combate2`, `rotas`, `texto`, `luta3d`, e o
e2e `ARVORE=1 PORTA=8851 node ferramentas/online-v2-e2e.mjs <pasta>`
com prints em 1280x800, 390x844 e 360x780 mostrando: o "Como ganhar"
aberto, os selos na mão com a postura dele, a linha de fintar, as duas
barras de vida, a energia nos placares e o gasto na linha do porquê.
