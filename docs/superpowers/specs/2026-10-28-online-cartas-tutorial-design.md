# Online: luta em cartas e treino guiado

Data: 2026-10-28. Branch: `online-cartas`. Status: desenho aprovado pelo
dono por seções, com o protótipo no navegador (cartas, tela da luta e
animações de uma troca); esta spec espera a revisão dele antes do plano.

## 1. Por que

Pedido do dono, depois de jogar o Online com a estratégia por informação
(no ar desde 2026-10-28): "o jogo ficou melhor", mas

1. "a primeira vez do jogador pode ser meio confusa": ao criar o lutador,
   ele deve jogar uma luta em que aprende, "um tutorial prático, com
   animações, explicações breves";
2. a aparência das lutas Online e contra bot deve parecer "cartas mesmo",
   "com menos cara de vibecodado e mais cara de jogo de verdade".

## 2. Decisões do dono

| Tema | Decisão |
|---|---|
| Ordem | O revamp primeiro; o treino usa a tela nova |
| Alcance do revamp | Só a tela da luta (placar, posturas, cartas, revelação, lance, resultado) |
| Carta | Cor sólida por família (direção B do protótipo) com a gema de custo, o ícone, a faixa com o nome e a caixa de regra (direção C) |
| Tela | A do protótipo `luta-layout`: lutadores no alto com a mão dele em cartinhas, faixa, mesa em octógono, lance, sua mão em leque, gaveta |
| Animações | As do protótipo `luta-animacao`: voar pra mesa, virar junto, brilho e tremida, número, carimbo FINTA, iniciativa pulsando |
| Treino | Luta roteirizada contra um treinador, 5 trocas, cada uma ensina uma coisa |
| Carta errada no treino | Só a carta certa funciona (as outras apagadas, uma mão aponta a certa) |
| Relógio no treino | Nenhum nas 4 primeiras trocas; na última, o relógio de verdade |
| Quando | Obrigatório na primeira vez (sem pular) |

Os protótipos aprovados ficam em
`.superpowers/brainstorm/66919-1793221452/content/` (`cartas-fusao-v2.html`,
`luta-layout-v2.html`, `luta-animacao-v2.html`), só locais.

## 3. O que não muda

- Servidor, banco, motor, bot e regras: nada. A vista (`vistaDaLuta`) já
  manda tudo o que a tela nova usa (`acoes` com `restam`, `finta`,
  `rotulo`, `grupo`, `custo`, `dica`; `maos`, `maoCheia`, `sinais`,
  `etapa`, `estado.iniciativa`, `trocas` com `ev`).
- O fluxo da luta: `jxjTelaLuta` consulta a cada 1,2 s, `enviar(fam, tipo)`
  manda `acao` ou `sinal`, a revelação e o "ele já escolheu" seguem as
  regras da fase 2.
- Ids que testes, efeitos e o tutorial de prints usam: `jxj-card-eu`,
  `jxj-card-ele`, `jxj-posicao`, `jxj-relogio`, `jxj-anel`.
- Os sons (`SOM`), as regras de texto (sem travessão nem frase de efeito),
  ícone só do sprite, nenhum emoji.

## 4. Parte 1: a tela da luta em cartas

### 4.1 A carta

Um componente só (`jxjCarta(acao, {tamanho, estado})`), usado na mão, na
mesa e no treino:

- fundo de cor sólida da família, com listras finas: Golpes vermelho
  (`--sangue`), Queda ouro, Defesa osso, Pressão preto com borda
  vermelha; recorte de canto do jogo (octógono nos cantos);
- topo: gema em octógono com o custo de energia (`+2` quando recupera) e
  o nome da família;
- meio: o ícone da família (sprite) grande sobre um foco de luz;
- faixa preta com o nome da ação (o rótulo da variante, "Jab e direto";
  no chão, o da posição) e as cópias que restam ("×3", em ouro);
- caixa de regra: "Ganha de X. Perde pra Y." e, no momento decisivo
  (grogue, finalização encaixada), a dica do momento no lugar;
- as cópias que restam aparecem como cartas empilhadas atrás (até 2).

Estados: finta (etiqueta "−1,5 finta", com duas casas: "−0,75" com a
iniciativa), sem energia pra fintar (apagada, cadeado, desligada), acabou
no round (só o contorno tracejado), escolhida (sobe, brilho dourado). Na
etapa da postura a carta não mostra finta.

### 4.2 A tela

De cima pra baixo (computador e celular na mesma ordem; no celular, menor):

1. **Lutadores:** retrato, nome, vida e energia de cada um; no centro, o
   relógio (vermelho na postura, dourado na ação), round e troca. Embaixo
   do adversário, a mão dele em cartinhas da cor da família, com quantas
   restam; a zerada fica apagada (classe `zero`).
2. **Faixa:** posição (Em pé, Por cima, Por baixo), a iniciativa e o
   placar do round; o trilho do momento só na luta v3.
3. **Mesa:** um octógono desenhado; de cada lado, a vaga da postura
   (pequena) e a vaga da ação (grande). Antes da revelação, a postura dele
   aparece de costas quando ele já mostrou ("ele já mostrou"); a ação dele
   fica de costas até a revelação. A faixa do momento decisivo, quando
   houver, fica em cima da mesa.
4. **Lance:** a troca anterior: quem leu (borda verde ou vermelha), o
   texto dos eventos e a narração ao vivo, quando houver.
5. **Sua mão:** as cartas em leque, que sobem ao passar o mouse ou tocar
   (toque e mouse pela capacidade, `semHover`). Na postura, tocar mostra a
   postura; na ação, tocar joga a carta. Dicas da primeira luta curtas,
   em cima da mão.
6. **Gaveta fechada:** histórico, duelos de atributo e tendência dele.

No celular (390 px), as 4 cartas da mão cabem lado a lado (86 px cada) e
nada rola na horizontal; a mão fica no fim da tela, ao alcance do polegar.

### 4.3 Animações

Disparadas pela troca nova da vista (o mesmo gatilho de hoje, `nova`):

- a carta tocada voa da mão até a vaga (postura: uma cópia voa, a carta
  fica na mão; ação: a carta sai da mão);
- a carta dele cai na vaga de costas quando a vista diz que ele escolheu
  (`adversarioEscolheu`, que pela regra da fase 2 só conta ação mandada
  depois da revelação; contra bot, logo na etapa da ação);
- na revelação as duas viram juntas (giro de 0,55 s);
- quem leu: a carta brilha em ouro; a outra treme e escurece; o número
  (dano ou pontos) sobe da carta; o retrato de quem apanhou treme e a
  barra de vida desce;
- finta: carimbo "FINTA" na carta de quem fintou;
- iniciativa: a ficha pulsa quando muda de dono;
- knockdown, nocaute, finalização e queda: os efeitos e sons de hoje
  (`jxjEfeitos`), agora sobre as cartas e os retratos.

Com "reduzir movimento" no sistema, nada se move: as cartas aparecem
viradas e os números sem subir.

### 4.4 Resultado

A tela de resultado ganha o acabamento das cartas (o cartão dos juízes em
cartas e a carta que decidiu a luta), sem mudar o que mostra: método,
placar, rating, XP, fichas, semente conferida, revanche e a lição do bot.

### 4.5 Testes da Parte 1

`jxjtelas` (DOM falso): a carta tem a gema, o nome, as cópias e a regra
certos pra cada família e papel; a mão dele mostra as quatro contagens e a
zerada com `zero`; na postura, tocar manda `sinal`; na ação, tocar manda
`acao`; finta, sem energia e sem carta nos estados certos; a mesa mostra a
postura dele de costas antes da revelação e de frente depois, e nunca a
ação dele antes da revelação; luta v3 sem quebrar; nada de `undefined`,
emoji ou travessão. `texto` e `rotas` verdes. Checklist em duas janelas
(computador e celular, gente e bot) com prints.

## 5. Parte 2: o treino

### 5.1 Quando

- Obrigatório pra quem ainda não lutou: o lutador principal com o cartel
  zerado e sem a marca `jxj:treino` no navegador. Ao criar o lutador, a
  tela vai pro treino (`#/jxj/treino`) em vez da árvore; "Buscar
  adversário" e "Lutar contra bot" levam ao treino enquanto ele não foi
  feito.
- Feito o treino (ou feita a primeira luta de verdade), nunca mais é
  obrigatório. Botão "Treino" no painel do Online pra rever.
- A marca fica no navegador (sem SQL): em outro aparelho, quem ainda não
  lutou faz de novo; quem já lutou nunca.

### 5.2 Como roda

Só na tela: um roteiro (`JXJ_TREINO`) monta, a cada passo, uma vista
igual à do servidor e desenha com a mesma tela da Parte 1 (o que o
jogador aprende é exatamente o que ele vai ver). Nada vai pro servidor:
sem rating, sem XP, sem luta gravada. O adversário é "Treinador",
fictício, com o selo "Treino". O lutador do jogador entra com o nome, o
retrato e a mão do estilo dele.

### 5.3 O roteiro (1 round, 5 trocas)

Abertura: "Treino rápido: 5 trocas. Aqui ninguém perde nada." e
"Começar".

1. **A mão e o ciclo** (só a ação). "Estas são as suas cartas neste
   round. Cada uma ganha de uma e perde pra outra." "Ele vai de Pressão:
   Golpes ganha de Pressão." Certa: Golpes. Resultado: o golpe entra.
2. **A mão dele e a iniciativa** (só a ação). "Você venceu a troca: a
   iniciativa é sua. Com ela, a finta custa metade." "Olhe a mão dele no
   alto: agora ele só tem Queda e Defesa." "Defesa ganha de Queda."
   Certa: Defesa. Resultado: a queda dele é defendida.
3. **A postura.** "Antes da ação, cada um mostra uma postura. Ele vê a
   sua antes de escolher." Ele mostra Base baixa. Mostrar: Guarda alta.
   Depois: "Ele mostrou Base baixa. Pode ser verdade ou finta." Certa:
   Defesa. Resultado: ele foi honesto; você leu.
4. **A finta.** "Mostre Avançando." Depois: "Ele viu Avançando e vai de
   Golpes pra te pegar entrando. Finte: faça Queda. Fazer outra ação que
   não a sua postura custa energia." Certa: Queda. Resultado: carimbo
   FINTA na sua carta, você derruba e fica por cima.
5. **A sua vez.** "No chão as cartas mudam de nome. Agora é com você: o
   relógio volta." Postura e ação livres, com o relógio de verdade (5 s e
   12 s). O treinador tem postura e ação fixas no roteiro; o resultado sai
   da tabela do ciclo por papel (a mesma `VENCE` do motor, copiada como
   dado). O round fecha com o cartão dos juízes.

Fim: "Pronto: mão, ciclo, postura, finta e iniciativa." Botões "Montar a
árvore" (o nível 1 tem 3 pontos), "Buscar adversário" e "Rever o treino".

Cada estilo tem as cartas que o roteiro usa (Golpes 1, Defesa 2, Queda 1,
Pressão 1 nas 4 primeiras trocas: a menor mão de cada família cobre).

Nas trocas guiadas: só a carta certa funciona; as outras ficam apagadas e
uma mão animada aponta a certa; as frases aparecem uma por vez, num
balão perto do que explicam (mão, mão dele, mesa, faixa).

### 5.4 Testes da Parte 2

`jxjtelas`: o roteiro anda os 5 passos; nas guiadas, tocar a carta errada
não muda nada e a certa avança; a última troca aceita qualquer carta e
fecha o round; o fim marca `jxj:treino`; lutador com cartel zerado e sem
a marca vai pro treino ao criar e ao buscar; com a marca ou com luta, não;
o botão "Treino" abre o roteiro; nenhuma chamada a `/api/jxj` sai do
treino; nada de `undefined`, emoji ou travessão. `texto` e `rotas`.

## 6. Entrega

- Parte 1 primeiro, completa e testada, mostrada ao dono rodando; pode ir
  pro ar sozinha quando ele mandar.
- Parte 2 depois, do mesmo jeito.
- Bateria completa verde antes de cada deploy; deploy só com o dono
  mandando.

## 7. Fora do escopo

Fila, painel, ranking, temporada, torneios e hall (ficam como estão);
arte ilustrada nas cartas (o ícone fica; dá pra trocar depois); qualquer
mudança de regra, número ou servidor; treino com rating ou recompensa.
