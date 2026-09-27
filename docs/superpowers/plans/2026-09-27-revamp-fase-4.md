# Revamp — Fase 4 (Nova carreira em 5 passos) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A criação do lutador vira um assistente de 5 passos no estilo novo (Nome, Visual, Divisão e modo, Rival, Draft), com progresso, Voltar pro passo anterior, fundo próprio por passo, e o componente de bloqueio Pro (Lenda e Rival travados pra quem não é Pro).

**Architecture:** Cada passo continua sendo a função que já existe (`screenName`, `screenCriador`, `screenDivisao`, `screenAtivarRival`, `renderDraft`), com a MESMA lógica; muda a moldura (`montarPasso()` sobre `montarTela()`) e o visual (CSS escopado em `.tela-criacao`). `montarTela({voltar})` passa a aceitar função além de rota. `bloqueioPro(elemento)` é o componente único de recurso travado (usado de novo na fase 5). Link de desafio pula divisão e rival: 3 passos.

**Tech Stack:** o mesmo.

**Spec:** `docs/superpowers/specs/2026-09-26-revamp-ui-design.md` seções 5 (Nova carreira) e 9 (Recursos Pro travados).

## Global Constraints

- Tudo das fases anteriores continua valendo (sem travessão em texto novo, ícone só SVG, classe por token, `assert` em substituição, commit + push, nada de `vercel --prod`).
- **Mecânica intocada:** draft (orçamento, `rollTable`, reroll uma vez, toque em 2 passos sem hover), validação do nome do rival, trava de Lenda sem Pro, `SEED`/`MODO`/`DIVISION` do desafio. `node testar.js desafio`, `draft`, `rival` e `interface` (4 divisões + lenda) verdes com os mesmos números.
- Ganchos que os testes usam continuam: botão "Montar o lutador", abas com classe começando em `aba`, opções `chip`/`sw`, `#nomeIn`, botão "Pular", botão `btn` de avançar no criador, cartas `div-c`, `#modo_lenda`, botão "Continuar" do rival, `#reroll`, cartas `card` do draft.
- `bloqueioPro`: sem Pro, o recurso fica a 35% de opacidade, não responde a clique, e o único ponto clicável é o selo "Assine o Pro" (leva a `#/conta/pro`). Com Pro, devolve o elemento sem mudança.

---

### Task 1: `bloqueioPro`, Voltar como função e a moldura de passo (TDD, suíte `rotas`)

**Files:** `index.html` (bloco INTERFACE NOVA), `estilo.css`, `testar.js`

**Interfaces:**
- `montarTela({... voltar: string|function})`
- `montarPasso(n, total, {titulo, fundo, voltar}) -> corpo` (cabeçalho com "Passo n de total" + barra de `total` segmentos, `n` acesos)
- `bloqueioPro(elemento) -> elemento | div.bloqueio-pro`

- [ ] Teste (falha primeiro): `bloqueioPro` sem Pro embrulha, marca o elemento com `bloqueado`, zera o `onclick` dele e cria `selo-assine` cujo clique leva a `#/conta/pro`; com Pro devolve o mesmo elemento. `montarPasso(2,5,...)` monta `.passo-barra` com 5 `.passo-seg`, 2 com `on`, e o texto "Passo 2 de 5".
- [ ] Implementar e rodar `rotas`.
- [ ] Commit + push.

### Task 2: Passo 1, Nome

- Fundo `tunel`. Título "Nome do lutador". Campo grande (`input-hero`), botão "Montar o lutador" (texto mantido). Desafio: faixa com divisão/modo do desafio, sem travessão. Voltar leva ao menu. `total = desafio ? 3 : 5`.
- Rodar `interface`, `rotas`. Screenshot 3 larguras. Commit + push.

### Task 3: Passo 2, Visual

- Fundo `vestiario`. Duas colunas: palco com o retrato grande sob luz (spot em gradiente) e campo do nome; painel com as abas de categoria (`aba`), opções (`chip`/`sw` redesenhados). Ações: "Escolher divisão" (ou "Começar a carreira" no desafio), "Sortear", "Pular". Voltar volta pro Passo 1 com o nome preenchido.
- Rodar `interface`. Screenshot. Commit + push.

### Task 4: Passo 3, Divisão e modo

- Fundo `arena-alto`. Seletor de modo em dois cards (Carreira / Seja uma lenda); Lenda passa por `bloqueioPro` quando não é Pro (o `#modo_lenda` continua existindo). Divisões em grade de cards (`div-c` + visual de `.cartao`): nome em Anton, "até N lb", barra de nocaute (baixo/médio/alto), quantidade de lutadores, "o melhor daqui é X". Aviso das divisões que não fecham 22 lutas no modo Lenda. Voltar volta pro Passo 2.
- Teste da trava ajustado ao componente: sem Pro, clicar a opção Lenda não muda `MODO` e o selo leva à conta; com Pro, entra no modo (os passos já existentes do `interface lenda` continuam).
- Rodar `interface` (as 4 divisões + lenda), `rotas`. Screenshot. Commit + push.

### Task 5: Passo 4, Rival

- Fundo `cartazes`. Dois cards: "Sim, quero um rival" (com `bloqueioPro` sem Pro) e "Não, carreira normal" (já marcado). Com Sim: campo do nome do rival e a validação de sempre (`validarNomeRival`). Botão "Continuar". Voltar volta pro Passo 3.
- Rodar `interface`, `rival`. Screenshot. Commit + push.

### Task 6: Passo 5, Draft

- Fundo `octogono-luz`. Cabeçalho do passo com "Montagem X de 4". Três painéis no estilo novo (`.painel-n`): cartas (orçamento com barra, reroll, lista de cartas com visual de `.cartao`, percentil com a escala de 5 cores), octógono central, dossiê. Mesma interação (hover mostra; sem hover, toque em 2 passos com "toque de novo pra confirmar"). Voltar volta pro Passo 4 ANTES da primeira carta; depois da primeira carta o Voltar some (a carta já consumiu sorteio e custo; voltar criaria estado inconsistente).
- Rodar `interface` (4 variações), `draft`, `desafio`. Screenshot com hover e em 380 px. Commit + push.

### Task 7: Fechamento

- `node testar.js` completo em background → TUDO CERTO.
- Screenshots dos 5 passos nas 3 larguras + teste manual do fluxo no Chrome (portão já logado não é possível headless; usar sessão falsa injetada só na ferramenta).
- Docs (`LEIA-ME.md` seção "Nova carreira em 5 passos", `PENDENCIAS.md` item 37), commit + push, checkpoint com o dono antes da fase 5.
