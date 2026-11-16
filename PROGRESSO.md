# Progresso: combate v2 e cartas da árvore

Atualizado em 2026-11-16. Branch principal deste trabalho: `combate-v2` (atrás da
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

## Agentes parados (não retomar sem o dono pedir)

Os dois eram do tipo `fork` (rodam no modelo da sessão). Pararam no limite de uso.
A próxima tarefa vai pro `executor-cartas`, que o dono escolhe.

- **Etapa 1** (tarefas 1 a 12 do plano)
  - Worktree: `.claude/worktrees/agent-aa1bb64be53cd0fdd`, branch `cartas-etapa1`, sem push.
  - Commits: `1880144` (T1), `55a0779` (T2), `2d40e10` (T3), `f4e979c` (T4),
    `0856dcf` (T5), `9462147` (T6), `5e01240` (T7), `1aebc85` (T8), `06abc9c` (T9).
  - Em andamento: Tarefa 10 (simulação, portões, busca de deck e calibragem).
    Arquivo sem commit: `sim/busca-deck.mjs` (38 linhas). Faltavam as partes da
    simulação: deck do nó, cartas no nível 30, busca e matriz do melhor deck.
  - Falta depois: Tarefa 11 (decks dos bots por faixa) e 12 (servidor: deck salvo
    que deixou de valer, definições), com a bateria verde.
- **Conversor** (parte das tarefas 17 e 18)
  - Worktree: `.claude/worktrees/agent-abab6c677f379f538`, branch `cartas-conversor`, sem push.
  - O merge do `combate-v2` já está feito (HEAD `edffcd1`, igual ao `combate-v2`).
  - Existe um `luta3d/mx_cartas.glb` de teste (173 KB, só 3 clipes: Joelhada,
    ChuteFrontal, Pendulo). Fora do git, como deve ser.
  - Falta: converter os 22 FBX pro `mx_cartas.glb`, carregamento depois que a luta
    abre com reserva quando falta, teste, `imp` e `dist` de cada golpe em
    `lances-cartas.js`, prints, estresse em 3x e refazer a arte (`prancha2.png`).

## Falta

1. Etapa 1: tarefas 10, 11 e 12.
2. Conversor: os 22 FBX e o resto da lista acima.
3. Etapa 2, a tela: tarefas 13 (carta com raridade, arte e estrelas), 14 (aba Deck
   com as cartas da árvore) e 15 (carta nova chegando, árvore com a carta).
4. Tarefa 17 (o 3D toca o lance da carta) e 19 (lances programados: sprawl, suplex,
   superman, chão; arte final).
5. Merge de tudo no `combate-v2`, bateria completa (`node testar.js`), ponta a ponta,
   push do `combate-v2`. Sem deploy.
6. Fase 7 do combate v2: grupo de teste com a flag. Migração
   `supabase_jxj_combate2.sql` e a flag são do dono.
7. Antes de qualquer deploy: este arquivo entra no `.vercelignore`.

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
