# Online v2: treino com cartas e "Como ganhar" fora do relógio (2026-11-18)

Continuação de `2026-11-18-online-v2-clareza-design.md` (decisão 93, no ar
em `fd70c4e`). O dono jogou e disse: "eu vi o tutorial do Como ganhar, mas
era muito texto para pouco tempo, eu tinha 5 s até a decisão da carta". E
pediu as duas pendências: o treino guiado na versão de cartas e o "Como
ganhar" fora do relógio.

## Por quê

O jogador ainda aprende a regra no meio da luta, com o prazo correndo. A
regra tem que ser aprendida jogando, sem relógio, antes da primeira luta;
na luta, só uma referência curta para consultar.

## 1. Treino guiado com cartas

Hoje o treino (`JXJ_TREINO`, `jxjTreinoVista`, `jxjPrecisaTreino`, rota
`#/jxj/treino`) ensina o jogo antigo (v1). Fazer a versão de cartas, no
mesmo padrão: só na tela, roteiro fixo, desenhado pela MESMA
`jxjDesenharCombate2` com vistas montadas no formato da vista do servidor
(o teste "treino, o roteiro" do v1 mostra o padrão: a vista do treino
passa pela tela de verdade). Sem servidor, sem banco, sem rating, sem
relógio (o jogador lê no tempo dele; o passo só anda quando ele joga).

Cada passo ensina UMA coisa, com uma frase curta (no máximo ~20 palavras
por passo, sem parede de texto) e a jogada pedida em destaque; a
resolução de cada passo usa o motor de verdade (`resolverTroca2` não roda
no navegador: as resoluções do roteiro são geradas pelo motor num teste e
conferidas, ou escritas à mão e o teste prova que batem com o motor).
Ordem sugerida (o construtor pode ajustar e registra):

1. Postura: você mostra a categoria de uma carta; ele vê a sua e você a
   dele.
2. Anular: ele mostrou Golpe; jogue a Defesa que anula golpe (o selo
   "Anula" aparece na carta). Resultado: a carta dele anulada.
3. Mais rápida: jogue a carta mais rápida com dano; interrompe a dele.
4. Mais lenta: o que acontece quando a dele é mais rápida (mostrar, sem
   punir o jogador pelo roteiro: o passo explica pelo selo "Mais lenta").
5. Finta e energia: jogar outra categoria que a postura custa energia; a
   barra de energia desce; sem energia ele não pode fintar.
6. Ler ele: "Ele não tem energia pra fintar": a postura é verdade.
7. Fim: "Você já sabe ganhar uma troca" NÃO (frase de efeito). Texto
   neutro, ex.: "Treino feito. O botão Como ganhar resume a regra."

Quem faz: obrigatório uma vez para quem tem o combate v2 ligado e ainda
não fez o treino de cartas (`localStorage` `jxj:treino2`, try/catch; a
regra antiga `jxjPrecisaTreino` continua para quem está na v1). O dono já
lutou e a flag está só pra ele: ele vai passar pelo treino uma vez, de
propósito (é como ele vai avaliar). "Rever o treino" leva ao de cartas
quando a conta está na v2. Como saber se a conta está na v2: o mesmo dado
que a tela já usa para escolher a luta v2 (procurar; não inventar consulta
nova ao servidor se já houver).

Texto: português, sem travessão, sem frase de efeito, ícone só `ICONE`.
Nada de emoji.

## 2. "Como ganhar" fora do relógio e mais curto

- Não abre mais sozinho dentro da luta. O treino de cartas ensina; quem
  já fez o treino não precisa dele aberto na luta.
- Na luta, o botão continua, e o painel vira uma referência curta: no
  máximo 3 blocos, uma linha cada, com ícone (anular / mais rápida
  interrompe / velocidade igual juntas; energia e finta numa linha; ler a
  postura numa linha). Os números continuam saindo de
  `JXJ_DEF.combate2.regras`.
- Na tela antes da luta (onde ficam "Entrar na fila" e "Lutar contra
  bot"), um link "Como ganhar" que abre o mesmo painel, sem relógio.
- `jxj:regras2` deixa de ser usado para abrir sozinho (pode sair).

## O que não fazer

- Não mexer no motor, nos números, nos decks do bot, em `FORCA_BOT2`, no
  treino v1 nem na luta v1.
- Sem SQL; servidor só se faltar dado público (registrar o porquê).
- A pista nunca diz qual carta jogar.

## Testes e entrega

Suítes `jxjv2`, `jxjtelas`, `jxj`, `combate2`, `rotas`, `texto`,
`luta3d`, `tutorial` (se tocar em `TUTORIAIS`), e o e2e
`ARVORE=1 PORTA=8851 node ferramentas/online-v2-e2e.mjs` (ou um e2e do
treino no mesmo molde) com prints em 1280x800, 390x844 e 360x780 de cada
passo do treino e do "Como ganhar" curto. Testes novos: o roteiro inteiro
passa pela tela; cada resolução do roteiro bate com o motor; quem tem v2
sem `jxj:treino2` cai no treino de cartas; quem tem v1 continua no
antigo; o "Como ganhar" não abre sozinho na luta. Provar o dente de cada
um. Decisão 94 em `docs/combat-v2-decisions.md`.
