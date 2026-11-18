# Progresso: combate v2 e cartas da árvore

Atualizado em 2026-11-17. Branch principal deste trabalho: `combate-v2` (atrás da
flag `combate_v2` em `jxj_config`). Nada disso está no ar.

## Feito

- **Combate v2, fases 1 a 6** no `combate-v2` (com push, HEAD `edffcd1`):
  motor, servidor, árvore (Fase 4, `fbe6de1`), bots v2, lógica da tela
  (`jxjPorQue2`, `JXJ_3D2`, `jxjLinhas3d2`, `jxjReferencia2`), aba Deck
  (`jxjCarta2`) e tela da luta v2 (opção B do porquê). Layouts aprovados pelo dono.
- **Spec das cartas** aprovada: `docs/superpowers/specs/2026-11-13-cartas-colecao-design.md` (`cf201fd`).
- **Plano das cartas** aprovado: `docs/superpowers/plans/2026-11-15-cartas-colecao.md`
  (19 tarefas em 4 etapas, `35ea78c`).
- **Conversor do Mixamo** (`ferramentas/converter-mixamo.mjs`), conferido contra o
  `mx_lutas.glb` (média de 0,05 grau): `953bc6f`, `a078395`.
- **Arte das cartas** (Tarefa 16): ferramenta `ferramentas/arte-cartas.mjs` e as 65
  imagens em `img/cartas/` (1 MB), lance de cada carta em `luta3d/lances-cartas.js`,
  suíte `cartasarte`. Juntado no `combate-v2` (`edffcd1`).
- **Downloads do Mixamo** (Tarefa 18): 22 FBX no scratchpad da sessão
  (`.../scratchpad/mixamo/`, com `lista.tsv`). Sprawl, suplex e superman não existem
  no Mixamo e vão ser programados (Tarefa 19).
- **Etapa 1, tarefas 1 a 9** na branch `cartas-etapa1` (ver agentes abaixo).
- **Custo (pedido do /usage, 2026-11-16):** agente `executor-cartas` com
  `model: sonnet` em `.claude/agents/executor-cartas.md` (fora do git, `.claude/`
  está no `.gitignore`); `effortLevel` `high` em `~/.claude/settings.json`;
  `claudeInChromeDefaultEnabled` `false` em `~/.claude.json` (ligar com `/chrome`
  quando precisar). Backups em `.bak`. Valem a partir da próxima sessão.

## Estado em 2026-11-17 (fim do dia)

O plano das cartas está completo (tarefas 1 a 19 e o fechamento), junto no
`combate-v2`, sem deploy. Bateria completa `TUDO CERTO`; ponta a ponta com deck
da árvore (`ARVORE=1 PORTA=8851 node ferramentas/online-v2-e2e.mjs <pasta>`) ok.

- Calibragem parada na decisão 91 (6 rodadas): números da rodada 5 mais a regra
  de 1 cópia pra carta de chão e finalização (decisão 90). Fora dos portões,
  conhecido: Wrestler 57,8% e Counter 43,1% no melhor contra melhor do nível 30,
  Wrestler 91,5% de 30 contra 1, Grappler contra Striker 74,2%, cartas de chão.
  Não recomeçar sem o dado do grupo de teste.
- Bots: deck por faixa (`deckDoBot2`) e `FORCA_BOT2` medida de novo (1403 a 1576).
- Tela e lances 3D aprovados pelo dono "por enquanto" (2026-11-17): ele diz o que
  incomoda depois de jogar. Pendências conhecidas: joelhada e cotovelada sem IK,
  suplex e raspagem aproximados; no computador, a faixa "Mostre uma postura"
  fica semitransparente sobre o palco parado.
- Agentes travam esperando processo em background (o aviso não chega pra eles):
  rodar o que passa de 9 minutos pela sessão principal.

## Falta

1. Fase 7 do combate v2: grupo de teste com a flag. Migração
   `supabase_jxj_combate2.sql` e a flag são do dono.
2. Antes de qualquer deploy: este arquivo entra no `.vercelignore`, e o
   `luta3d/mx_cartas.glb` precisa estar na pasta do `vercel --prod`.
3. Depois do grupo de teste: regra nova pro chão, se o dado pedir.
4. Feito na branch `treino-v2` (decisão 94, 2026-11-18): o treino de cartas
   (`JXJ_TREINO2`, obrigatório uma vez pra conta v2 sem `jxj:treino2`) e o
   Como ganhar curto, que não abre mais sozinho. Falta o dono avaliar.

## Decisões importantes

- Combate v2: carta mais rápida resolve primeiro; reação ("contra") anula em
  qualquer velocidade; sem sorte na resolução (a semente só embaralha o deck);
  rounds de 3 trocas, mão de 5, deck de 12.
- Fase 4 (decisões 47 a 53): nós da árvore iguais aos de hoje; no v2 o nó vale só
  pelo efeito v2 (o atributo fica no combate de antes, `perfilLuta2`); energia e
  finta não são efeito de nó; efeito novo `pontos`; medição com sementes pareadas;
  deck salvo que deixou de valer volta pro padrão com `deckMontado: false`.
- Fase 5 (54 a 66): com a flag, luta contra bot é v2 e o bot joga cego;
  `FORCA_BOT2` medido (1322 a 1500).
- Fase 6 (70 a 77): lógica da tela em funções puras, testadas nas suítes.
- Cartas: cada nó libera uma carta (48). Raridade pelo andar do ramo (1 e 2 rara,
  3 épica, 4 lendária; as 9 de hoje são comuns). Cada carta tem casa (`pe`, `cima`,
  `baixo`); fora dela joga como a básica (`BASICA_PE` em pé, `CHAO` no chão).
  Cópias: comum e rara até 2, épica e lendária 1. Estrelas: nível 1 libera, nível 2
  dá +0,5 de dano (ou +0,5 ponto sem dano), nível 3 aplica `estrela3`; estrela só
  vale na casa. Híbrido só libera rara. O `ARVORE_V2` da Fase 4 acaba.
- Arte: render do nosso 3D com a cor da raridade. Animação: Mixamo e lances
  programados; `mx_cartas.glb` fora do git, carrega depois que a luta abre, com reserva.
- Árvore v2 calibrada: nós de 0,6 a 6,1; nível 30 com deck padrão de 47,1% a 51,5%.

## Regras em vigor

- Sem deploy, sem SQL no Supabase de produção, sem migração sem aprovação, sem
  mexer em variável de ambiente, sem expor segredo. Push na `master` é deploy.
- GLB e FBX do Mixamo nunca vão pro git. No Mixamo, só pela tela do site.
- Texto sem travessão, sem frase de efeito e sem emoji; ícone só do sprite (`ICONE`).
