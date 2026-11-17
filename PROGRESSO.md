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

## Estado em 2026-11-17 (manhã)

Tudo junto na branch local `cartas-integracao` (worktree
`.claude/worktrees/cartas-integracao`, sem push): etapa 1 (tarefas 1 a 10), Tarefa 11
em parte (`71c6b4d`), Tarefa 12 e tela (13 a 15, `cartas-servidor`), conversor, 17 e
19 (`cartas-conversor`). Bateria completa `TUDO CERTO` antes do `71c6b4d`;
`jxjtelas` 6 de 6 verde com o processador livre (a intermitência vista com a
simulação rodando é de tempo).

- Calibragem: 5 rodadas, a última sem fechar. Os números da rodada 5 estão SEM
  commit em `api/_jxj-cartas.js`, `docs/combat-v2.md`, `docs/combat-v2-decisions.md`
  (decisões 80 a 89) e 2 linhas do `testar.js`, no worktree da etapa 1 e copiados
  pra integração. Relatório final: `sim/relatorio-r5-final.md` (worktree da etapa 1).
  Fora: melhor contra melhor no nível 30 (Wrestler 57,6%, Counter 42,8%; Grappler
  contra Striker 76,2%), Wrestler 30 contra 1 em 92,2%, 14 nós, cartas de chão
  (Kimura +28, Triângulo +31 de relativa). Dentro: nível 1 idêntico, nível 30 com o
  deck padrão, deck aleatório contra o campo de melhores (decisão 89).
- Tarefa 11: `deckDoBot2` e faixas feitos; baixo e médio com o deck padrão.
  Falta `SIM_FAIXAS=baixo,medio node sim/decks-bot2.mjs --escrever` (o
  classificador negou ao agente; precisa do dono) e medir `FORCA_BOT2`
  (`SIM_PARTES=bots SIM_SAIDA=relatorio-bots.md node sim/simular.mjs 10000`). Até lá
  a `jxjbot` reprova "habilidade e força" (1526 contra 1448).
- 3D: joelhada e cotovelada sem IK (não é ponta de cadeia); suplex e raspagem
  aproximados.
- Agentes travam esperando processo em background (o aviso não chega pra eles):
  rodar o que passa de 9 minutos pela sessão principal.

## Falta

1. Dono: decidir a calibragem (aceitar, regra nova pro chão, ou limite de
   finalização por deck) e aprovar os números; liberar o comando da Tarefa 11.
2. Commit dos números, decks dos bots e `FORCA_BOT2`; bateria completa.
3. Fechamento do plano: merge no `combate-v2`, ponta a ponta
   (`ferramentas/online-v2-e2e.mjs`), LEIA-ME "Cartas da árvore", push do `combate-v2`.
4. Fase 7 do combate v2 (flag, migração `supabase_jxj_combate2.sql`): do dono.
5. Antes de qualquer deploy: este arquivo entra no `.vercelignore`.

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
