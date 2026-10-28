# Online em cartas, Parte 2: o treino guiado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quem ainda não lutou no Online faz, antes da primeira luta, um treino de 5 trocas contra um treinador fictício, na própria tela de luta em cartas, com frases curtas e as animações de verdade; só a carta certa funciona nas 4 trocas guiadas, e a última é livre, com relógio.

**Architecture:** Só na tela (`index.html`): um roteiro (`JXJ_TREINO`) e uma tela (`jxjTelaTreino`, rota `#/jxj/treino`) que guarda o estado do treino, monta a cada passo uma vista igual à do servidor e desenha com `jxjDesenharCombate` (a mesma da Parte 1); a revelação usa `jxjRevelar`. Nada vai pro servidor além de `definicoes` e `estado` (leitura). A marca `jxj:treino` fica no navegador. Painel, busca e criação mandam pro treino enquanto ele é obrigatório.

**Tech Stack:** `index.html`, `estilo.css`, `testar.js` (`jxjtelas`), puppeteer local pro checklist.

**Spec:** `docs/superpowers/specs/2026-10-28-online-cartas-tutorial-design.md` (seção 5). Parte 1 no ar desde 2026-10-28.

## Global Constraints

- Obrigatório pra quem ainda não lutou: o lutador principal com o cartel zerado e sem a marca `jxj:treino`. Ao criar o lutador, a tela vai pro treino; "Buscar adversário" e "Lutar contra bot" levam ao treino enquanto ele não foi feito. Sem pular.
- Feito o treino (ou feita a primeira luta de verdade), nunca mais obrigatório. Botão "Treino" no painel pra rever.
- Adversário "Treinador", fictício, selo "Treino"; o lutador do jogador entra com o nome, o retrato e a mão do estilo dele.
- Nas trocas guiadas: só a carta certa funciona; as outras apagadas e desligadas; uma seta animada aponta a certa; as frases uma por vez, num balão.
- Sem relógio nas 4 primeiras trocas; na última, o relógio de verdade (5 s e 12 s).
- Sem rating, sem XP, sem luta gravada; nenhuma ação de luta vai pro servidor.
- Texto sem travessão nem frase de efeito; ícone só do sprite; nada de emoji.

## Decisões (mudanças pequenas no roteiro da spec, por coerência com as regras)

1. **4 + 1 trocas em 2 rounds.** O round tem 4 trocas no jogo de verdade: as lições 1 a 4 são o round 1 e a lição 5 é a troca 1 do round 2 (a mão volta cheia e a iniciativa some, que a lição 5 passa a ensinar; sai a frase "no chão as cartas mudam de nome", porque o round novo começa em pé).
2. **Lição 2 com frase verdadeira.** O treinador ainda tem Golpes (usa na lição 4), então a frase vira "Olhe a mão dele no alto: a Pressão dele acabou neste round. Ele vai de Queda: Defesa ganha de Queda."
3. **Na lição 4 o treinador mostra Peso na frente** (honesto) e faz Golpes.
4. **Na lição 5 o treinador blefa:** mostra Guarda alta e faz Pressão; o resultado sai do ciclo em pé.
5. **O relógio das lições guiadas mostra "livre"**; `JXJ_TREINO_PRAZOS` (5000 e 12000) pode ser trocado pelos testes.

## Review Focus

1. Recarregar a página no meio do treino: volta pro começo do treino, sem quebrar e sem luta gravada. Teste na Task 2.
2. Navegador sem `localStorage` (bloqueado): o treino não quebra; quem não lutou continua sendo mandado pro treino até a primeira luta. Teste na Task 3.
3. Clique duplo na carta certa: uma troca só. Teste na Task 2.
4. Prazo estourado na última troca: postura e ação padrão (Defesa), o treino termina igual. Teste na Task 2.
5. Conta com luta já feita e sem a marca: nada obrigatório. Teste na Task 3.

---

### Task 1: O roteiro e a vista do treino

**Files:** `index.html` (perto do Online, depois de `jxjRevelar`), `testar.js`.

**Interfaces:**
- Produces:
  - `JXJ_TREINO` (array de 5 lições): `{postura: famíliaCertaOuNull, acao: famíliaCerta|null (null = livre), ele: {postura, acao}, fala: [textos], resultado: (estado, minha) => {ev, eventos, pontos:{a,b}, dano:{a,b}, pos?}}`.
  - `jxjTreinoNovo(lutador, def)` → estado inicial `{i:0, etapa, round:1, troca:1, mao:{a,b}, energia:{a,b}, dano:{a,b}, pontos:[{a,b}], cartoes:[], iniciativa:null, pos:"pe", meuSinal:null, minhaAcao:null, trocas:[], fim:false}`.
  - `jxjTreinoVista(st, lutador, def)` → objeto no formato da vista do servidor (os campos que `jxjDesenharCombate` lê), com `nomes.b = {nome:"Treinador", treino:true, ...}`.
  - `jxjTreinoJogar(st, fam, tipo)` → novo estado (postura ou ação), sem efeito colateral.

- [ ] Step 1: teste (`jxjtelas`, sem tela): no contexto do jogo, `jxjTreinoNovo` com cada estilo dá a mão do estilo; `jxjTreinoVista` passa por `jxjDesenharCombate` sem `undefined`; as 5 lições têm as cartas que cada estilo tem; jogar a carta certa avança e a errada não muda nada; a lição 4 cobra a finta (0,75 com a iniciativa) e põe o jogador por cima; a troca 4 fecha o round 1 com 10 a 9 pra quem pontuou mais e a lição 5 começa em pé, com a mão cheia e sem iniciativa.
- [ ] Step 2: ver falhar. Step 3: implementar. Step 4: passar. Step 5: commit.

### Task 2: A tela do treino

**Files:** `index.html` (`jxjTelaTreino`, rota `treino`, selo "Treino" no placar, balão, seta, fim), `estilo.css`, `testar.js`.

- `jxjTelaTreino(id)`: carrega definições e estado (só leitura), acha o lutador (`id` ou o principal), monta o estado e desenha. A cada passo: balão com a fala (botão "Continuar" quando a fala não pede carta), cartas erradas desligadas e apagadas, seta na certa, relógio "livre" (ou o de verdade na lição 5, por `JXJ_TREINO_PRAZOS`). Depois da jogada: revelação por `JXJ_REVELACAO_MS`, a explicação do resultado no balão e "Continuar".
- Fim: "Pronto: mão, ciclo, postura, finta e iniciativa." e o que aconteceu na lição 5; grava `jxj:treino`; botões "Montar a árvore", "Buscar adversário" e "Rever o treino".
- Prazo estourado na lição 5: postura e ação padrão (Defesa).

- [ ] Step 1: testes (`jxjtelas`): o treino inteiro pela tela (5 lições, carta errada não faz nada, clique duplo na certa faz uma troca, a 5 livre), sem nenhuma ação de luta no servidor (`fetch` contado), a marca gravada no fim, recarregar no meio volta ao começo, prazo estourado na 5 termina igual, sem `undefined`, emoji nem travessão.
- [ ] Step 2 a 5 como sempre.

### Task 3: Obrigatório na primeira vez

**Files:** `index.html` (`jxjPrecisaTreino`, painel, busca, criação), `testar.js`.

- `jxjTreinoFeito()` (lê `jxj:treino` com try/catch) e `jxjPrecisaTreino(est)`: nenhuma luta no cartel de nenhum lutador da conta e sem a marca.
- Painel: "Buscar adversário" e "Lutar contra bot" levam ao treino enquanto precisa; botão "Treino" sempre.
- Busca (`#/jxj/fila`): precisa do treino, vai pro treino (sem entrar na fila).
- Criação: depois de criar, precisa do treino, vai pro `treino/<id>`; senão, a árvore (como hoje).

- [ ] Step 1: testes: conta sem luta e sem marca é mandada pro treino ao buscar e ao abrir a fila; com a marca, não; com luta no cartel, não; sem `localStorage`, continua mandando (até a primeira luta) e o treino não quebra; o botão "Treino" abre o treino. Os testes antigos de fila e bot rodam com a marca já gravada pelo teste do treino.
- [ ] Step 2 a 5.

### Task 4: Checklist, documentação e bateria

- Checklist no Chrome local (computador e celular): conta nova, criar lutador, cair no treino, jogar as 5 lições, ver a seta, o balão, a revelação, a finta da lição 4 e o blefe do treinador na 5; o fim; depois "Buscar adversário" vai pra busca. Prints.
- LEIA-ME (seção do treino), CLAUDE.md, PENDENCIAS 49.
- `node testar.js` completo; commit e push na branch. Deploy só com o dono mandando.
